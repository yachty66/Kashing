import { NextResponse } from "next/server";
import { eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { merchantCategories, transactions } from "@/lib/db/schema";
import { CATEGORIES, type Category, merchantKey, ruleClassify } from "@/lib/categories";

export const runtime = "nodejs";
export const maxDuration = 120;

type TxRow = {
  id: number;
  amountCents: number;
  creditorName: string | null;
  debtorName: string | null;
  memo: string | null;
};

/**
 * Assign every transaction a category. Strategy in order:
 *   1. Rule-based classification for obvious cases (transfers, income)
 *   2. Lookup `merchant_categories` cache (LLM-categorized or user-overridden)
 *   3. Batch the still-unknown merchants and ask the LLM
 *
 * Idempotent — only categorizes transactions whose category is currently
 * null, and only invokes the LLM for merchants not already in the cache.
 */
export async function POST() {
  const all = (await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      creditorName: transactions.creditorName,
      debtorName: transactions.debtorName,
      memo: transactions.memo,
      category: transactions.category,
    })
    .from(transactions)) as Array<TxRow & { category: string | null }>;

  if (all.length === 0) {
    return NextResponse.json({ categorized: 0, llm_calls: 0 });
  }

  // Existing cache
  const cacheRows = await db.select().from(merchantCategories);
  const cache = new Map(cacheRows.map((r) => [r.key, r.category as Category]));

  // For each transaction without a category, work out what to do
  type Pending = { id: number; key: string; row: TxRow };
  const pending: Pending[] = [];
  const ruleAssignments: { id: number; category: Category }[] = [];
  const cacheAssignments: { id: number; category: Category }[] = [];

  for (const t of all) {
    if (t.category) continue; // already categorized

    const ruleCat = ruleClassify({
      creditorName: t.creditorName,
      debtorName: t.debtorName,
      memo: t.memo,
      amountCents: Number(t.amountCents),
    });
    if (ruleCat) {
      ruleAssignments.push({ id: t.id, category: ruleCat });
      continue;
    }

    const key = merchantKey({
      creditorName: t.creditorName,
      debtorName: t.debtorName,
      memo: t.memo,
      amountCents: t.amountCents,
    });
    const cached = cache.get(key);
    if (cached) {
      cacheAssignments.push({ id: t.id, category: cached });
      continue;
    }

    pending.push({ id: t.id, key, row: t });
  }

  // Apply rule + cache hits
  for (const a of ruleAssignments) {
    await db
      .update(transactions)
      .set({ category: a.category })
      .where(eq(transactions.id, a.id));
  }
  for (const a of cacheAssignments) {
    await db
      .update(transactions)
      .set({ category: a.category })
      .where(eq(transactions.id, a.id));
  }

  // For pending: collapse to unique merchant keys with sample context
  const uniqueMerchants = new Map<string, { samples: string[]; signedAmounts: number[] }>();
  for (const p of pending) {
    const entry = uniqueMerchants.get(p.key) ?? { samples: [], signedAmounts: [] };
    const sample = `${p.row.creditorName ?? p.row.debtorName ?? ""}${
      p.row.memo ? " — " + p.row.memo.slice(0, 80) : ""
    }`.trim();
    if (sample && entry.samples.length < 3 && !entry.samples.includes(sample)) {
      entry.samples.push(sample);
    }
    entry.signedAmounts.push(Number(p.row.amountCents) / 100);
    uniqueMerchants.set(p.key, entry);
  }

  let llmCalls = 0;
  if (uniqueMerchants.size > 0) {
    const merchantList = [...uniqueMerchants.entries()].map(([key, v]) => ({
      key,
      samples: v.samples,
      sample_amounts_eur: v.signedAmounts.slice(0, 5),
    }));
    const result = await llmCategorize(merchantList);
    llmCalls = 1;

    // Persist into cache + apply to transactions
    for (const [key, cat] of Object.entries(result)) {
      if (!CATEGORIES.includes(cat as Category)) continue;
      await db
        .insert(merchantCategories)
        .values({ key, category: cat, source: "llm", updatedAt: new Date() })
        .onConflictDoUpdate({
          target: merchantCategories.key,
          set: { category: cat, source: "llm", updatedAt: new Date() },
        });
    }

    // Re-pull cache and apply pending
    const freshCache = new Map(
      (await db.select().from(merchantCategories)).map((r) => [r.key, r.category as Category]),
    );
    for (const p of pending) {
      const cat = freshCache.get(p.key);
      if (!cat) continue;
      await db
        .update(transactions)
        .set({ category: cat })
        .where(eq(transactions.id, p.id));
    }
  }

  return NextResponse.json({
    categorized:
      ruleAssignments.length + cacheAssignments.length + pending.length,
    rule_hits: ruleAssignments.length,
    cache_hits: cacheAssignments.length,
    llm_classified: pending.length,
    llm_calls: llmCalls,
  });
}

const SYSTEM = `You categorize bank transactions for a personal finance app.

Output STRICT JSON. No prose, no markdown.

Pick the SINGLE BEST category for each merchant from this exact list:
${CATEGORIES.join(", ")}

Rules:
- "Subscriptions" is for digital recurring services (Netflix, Spotify, Claude, AWS, SaaS, etc.)
  even if billed annually. NOT for one-off purchases.
- "Bills & Utilities" is for phone plans, internet, electricity, gas, water, tax bills.
  Mobile carriers like sim.de / Vodafone / Telekom go here.
- "Eating Out" is restaurants, cafés, bars, fast food, food delivery.
- "Groceries" is supermarkets and grocery stores (Edeka, REWE, Lidl, Aldi, Trader Joe's).
- "Transport" is fuel, public transit, parking, taxis, rideshare, bike-share, bus, train.
- "Travel" is flights, hotels, Airbnb, multi-day trip expenses (NOT daily commute).
- "Shopping" is general retail, clothes, household goods, Amazon non-Prime, electronics.
- "Entertainment" is movies, games, concerts, events.
- "Rent & Housing" is monthly rent payments and house bills (NOT utilities).
- "Health & Insurance" is pharmacy, doctor visits, insurance premiums (AOK, TK, Allianz).
- "Fitness" is gym memberships, sports clubs, classes.
- "Personal Care" is haircut, beauty, spa, cosmetics.
- "Income" is salary, refunds, interest received.
- "Transfers" is movement between the user's own accounts.
- "Loans & Fees" is loan repayments, bank fees, SEPA fees, ATM charges.
- "Other" only if absolutely none of the above fit.

Use your knowledge of merchants. Edeka = Groceries, REWE = Groceries, Lidl = Groceries,
Lekkerland = Groceries (REWE To Go), Netflix = Subscriptions, sim.de = Bills & Utilities,
N26 Go = Bills & Utilities, AOK = Health & Insurance, Grover = Subscriptions
(hardware rental), Amazon Prime = Subscriptions, Lyft / Uber / Lime / Nextbike = Transport,
Bolt = Transport, FlixBus = Travel, Booking.com / Expedia / Airbnb = Travel.

Output shape:
{ "<merchant key>": "<Category>", ... }

The merchant keys are given to you; preserve them exactly.`;

async function llmCategorize(
  merchants: { key: string; samples: string[]; sample_amounts_eur: number[] }[],
): Promise<Record<string, string>> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not set");
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.PUBLIC_BASE_URL ?? "http://localhost:3001",
      "X-Title": "Kashing categorize",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5",
      max_tokens: 6000,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: "Categorize these merchants:\n\n" + JSON.stringify(merchants, null, 1) },
      ],
    }),
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { choices: { message: { content: string } }[] };
  let raw = j.choices[0].message.content.trim();
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }
  return JSON.parse(raw);
}
