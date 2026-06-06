/**
 * Subscription detection — port of mysubs/backend/app/detection.py.
 *
 * Two passes:
 *   detectHeuristic(txs)  — fast, deterministic, cadence + amount-stability.
 *   detectLLM(txs)        — sharper; uses OpenRouter (Claude) to recognize
 *                           merchant names and decompose Apple/Google bundles,
 *                           catch rotating-transaction-ID subs, etc.
 */

export type Tx = {
  amountCents: number;
  bookingDate: string | null;
  valueDate: string | null;
  creditorName: string | null;
  debtorName?: string | null;
  memo: string | null;
};

type MerchantRow = {
  merchant: string;
  count: number;
  amounts: number[];
  dates: string[];
  sample_memo: string;
};

function merchantKey(t: Tx): string {
  const name = (t.creditorName ?? "").trim();
  if (name) return name.toLowerCase();
  const memo = (t.memo ?? "").toLowerCase();
  return memo.split(/\s+/).slice(0, 4).join(" ") || "(unknown)";
}

export function merchantTable(txs: Tx[]): MerchantRow[] {
  const g = new Map<string, { date: string; amount: number; memo: string }[]>();
  for (const t of txs) {
    if (t.amountCents >= 0) continue; // outgoing only
    const k = merchantKey(t);
    const d = t.bookingDate ?? t.valueDate ?? "";
    const amount = Math.round((-t.amountCents / 100) * 100) / 100;
    const arr = g.get(k) ?? [];
    arr.push({ date: d, amount, memo: (t.memo ?? "").slice(0, 120) });
    g.set(k, arr);
  }
  const rows: MerchantRow[] = [];
  for (const [k, items] of g.entries()) {
    items.sort((a, b) => a.date.localeCompare(b.date));
    rows.push({
      merchant: k,
      count: items.length,
      amounts: items.map((i) => i.amount),
      dates: items.map((i) => i.date),
      sample_memo: items.find((i) => i.memo)?.memo ?? "",
    });
  }
  rows.sort((a, b) => b.count - a.count || a.merchant.localeCompare(b.merchant));
  return rows;
}

export type HeuristicResult = {
  subscriptions: { name: string; monthly_amount_eur: number; cadence_days: number; occurrences: number }[];
  monthly_total_eur: number;
};

export function detectHeuristic(txs: Tx[]): HeuristicResult {
  const rows = merchantTable(txs);
  const subs: HeuristicResult["subscriptions"] = [];
  for (const row of rows) {
    if (row.count < 2) continue;
    const dates = row.dates.filter(Boolean).map((d) => new Date(d).getTime());
    if (dates.length < 2) continue;
    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const cadenceBuckets: [number, number][] = [
      [6, 8], // weekly
      [25, 35], // monthly
      [88, 95], // quarterly
      [350, 380], // yearly
    ];
    if (!cadenceBuckets.some(([lo, hi]) => avgGap >= lo && avgGap <= hi)) continue;
    const min = Math.min(...row.amounts);
    const max = Math.max(...row.amounts);
    const mean = row.amounts.reduce((a, b) => a + b, 0) / row.amounts.length;
    if (max - min > Math.max(2.0, 0.15 * mean)) continue;
    subs.push({
      name: row.merchant,
      monthly_amount_eur: Math.round(mean * 100) / 100,
      cadence_days: Math.round(avgGap * 10) / 10,
      occurrences: row.amounts.length,
    });
  }
  const monthly = subs
    .filter((s) => s.cadence_days >= 25 && s.cadence_days <= 35)
    .reduce((acc, s) => acc + s.monthly_amount_eur, 0);
  return { subscriptions: subs, monthly_total_eur: Math.round(monthly * 100) / 100 };
}

// ---------- LLM detection ----------

const SYSTEM_PROMPT = `You are a financial transaction classifier.

You will be given a per-merchant aggregate of a user's bank transactions \
(outgoing only) over ~90 days. Your job is to identify ALL recurring monthly \
subscriptions the user is paying for, including ones that simple cadence/amount \
heuristics would miss.

Failure modes that statistical detectors miss (look for these):
  - Different transaction IDs each charge (e.g. Amazon Prime appears as \
\`amazon prim* N28LK1FN4\`, \`amazon prim* NO0B012Z4\` — these are ONE subscription)
  - FX-varying amounts (USD-billed services hitting EUR account at different rates)
  - Usage-based subs (cloud APIs, hosting) — fixed cadence, variable amount
  - Single occurrence but clearly a known recurring service
  - PayPal- or Klarna-routed subs (merchant string is the processor)
  - Apple/Google bundles (\`apple.com/bill\`) that lump multiple subs into one payee

Also classify and EXCLUDE from subscriptions:
  - Rent (memo often says "miete"; recurring same amount to a person)
  - Loan repayments (often appears twice under two memos for the same payment)
  - Internal transfers between the user's own accounts
  - Pay-per-use that mimics recurring (transit, ride-share, food/cafe)
  - One-off purchases that happen to be on Amazon/Apple but aren't subscriptions

For Apple/Google bundles, separate the recurring stream from one-off purchases; \
only count the recurring stream in monthly_amount_eur.

Use your knowledge of merchant names. Be confident about clear identifications.

Output STRICT JSON only — no prose, no markdown fences. Schema:

{
  "subscriptions": [
    {
      "name": "Human-friendly service name",
      "merchant_strings": ["raw merchant strings this maps to"],
      "monthly_amount_eur": 8.99,
      "cadence": "monthly|weekly|yearly|usage-based",
      "confidence": "high|medium|low",
      "evidence": "1-sentence why",
      "category": "saas|media|telco|cloud|hardware-rental|gym|vpn|other",
      "domain": "netflix.com"   // primary website domain of the service, e.g. "spotify.com", "aws.amazon.com", "sim.de". OMIT this field if you genuinely don't know — never guess.
    }
  ],
  "recurring_obligations": [
    {"name": "...", "monthly_amount_eur": 0, "type": "rent|loan|insurance|tax", "evidence": "..."}
  ],
  "excluded": [
    {"merchant": "...", "reason": "transfer|one-off|per-use|fee|p2p"}
  ],
  "summary": {
    "monthly_subscription_total_eur": 0,
    "monthly_obligation_total_eur": 0,
    "subscription_count": 0
  }
}
`;

const BRIEF_PROMPT = `You're writing a short, useful brief for a user about their \
subscriptions, based on the structured analysis you'll be given.

Style: 3-5 short paragraphs. No bullet lists, no markdown headers. Punchy and \
specific. Mention concrete amounts and service names. Surface things that look \
wasteful, dormant, or worth a closer look (sudden jumps, overlapping services, \
forgotten subs). End with the single highest-impact action the user could take.

Do not restate the table. Tell the user something they wouldn't notice from \
just reading the list.`;

export type Subscription = {
  name: string;
  merchant_strings?: string[];
  monthly_amount_eur: number;
  cadence?: string;
  confidence?: "high" | "medium" | "low";
  evidence?: string;
  category?: string;
  domain?: string;
};

export type Obligation = {
  name: string;
  monthly_amount_eur: number;
  type: string;
  evidence?: string;
};

export type Analysis = {
  subscriptions: Subscription[];
  recurring_obligations: Obligation[];
  excluded?: { merchant: string; reason: string }[];
  summary: {
    monthly_subscription_total_eur: number;
    monthly_obligation_total_eur: number;
    subscription_count: number;
  };
};

async function openrouter(system: string, user: string, maxTokens = 12000): Promise<string> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not set");
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.PUBLIC_BASE_URL ?? "http://localhost:3001",
      "X-Title": "Kashing detect",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5",
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok) throw new Error(`OpenRouter error: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as { choices: { message: { content: string } }[] };
  return j.choices[0].message.content;
}

function stripFences(s: string): string {
  let out = s.trim();
  if (out.startsWith("```")) {
    out = out.replace(/^```(?:json)?\s*/i, "");
    out = out.replace(/```\s*$/i, "");
  }
  return out.trim();
}

export async function detectLLM(txs: Tx[]): Promise<Analysis> {
  const rows = merchantTable(txs);
  const userMsg = "Per-merchant outgoing transaction aggregate:\n\n" + JSON.stringify(rows, null, 1);
  const raw = await openrouter(SYSTEM_PROMPT, userMsg);
  return JSON.parse(stripFences(raw)) as Analysis;
}

export async function writeBrief(analysis: Analysis): Promise<string> {
  const userMsg = "Structured analysis:\n\n" + JSON.stringify(analysis, null, 1);
  return (await openrouter(BRIEF_PROMPT, userMsg, 2000)).trim();
}
