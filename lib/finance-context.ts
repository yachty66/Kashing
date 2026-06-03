import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, analyses, transactions } from "@/lib/db/schema";
import { applyOverlay, type SubscriptionLike } from "@/lib/subscription-overlay";

type Sub = SubscriptionLike;

type AnalysisPayload = {
  subscriptions?: Sub[];
  recurring_obligations?: { name: string; monthly_amount_eur: number; type: string }[];
};

/**
 * Build the system-prompt prefix that gives the chat model live access to
 * the user's financial data. Compact-ish JSON of accounts, detected subs,
 * and transactions — formatted for an LLM to reason over, not for human
 * eyes. Returns the full prompt text including instructions.
 */
export async function buildFinanceContext(): Promise<string> {
  const accts = await db.select().from(accounts);
  const txRows = await db
    .select({
      id: transactions.id,
      bookingDate: transactions.bookingDate,
      valueDate: transactions.valueDate,
      amountCents: transactions.amountCents,
      currency: transactions.currency,
      creditorName: transactions.creditorName,
      debtorName: transactions.debtorName,
      memo: transactions.memo,
      status: transactions.status,
      category: transactions.category,
      accountName: accounts.displayName,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id));

  const llmRow = await db
    .select()
    .from(analyses)
    .where(eq(analyses.kind, "llm"))
    .orderBy(desc(analyses.createdAt))
    .limit(1);

  const today = new Date().toISOString().slice(0, 10);
  const llmPayload = (llmRow[0]?.payload as AnalysisPayload | undefined) ?? null;
  const subs = await applyOverlay(llmPayload?.subscriptions ?? []);

  const baseInstructions = `You are a financial assistant inside the user's own personal-finance app.
Today is ${today}. You have direct access to their bank accounts, transactions,
detected subscriptions, and recurring obligations — they're listed below.

When answering:
- Use real numbers and real merchant names from the data, not invented examples.
- Be direct and specific. No "based on the data" preamble, no caveats unless
  the data genuinely doesn't cover the question.
- Format amounts as €X.XX. Use month names not raw YYYY-MM.
- If a question can't be answered from the data, say so plainly and suggest
  the closest related thing you CAN answer.
- Don't repeat the user's question back; just answer.
- Keep responses tight — one to three short paragraphs unless the user
  explicitly asks for a deep breakdown.
- The user's bank reports amounts in EUR (cents in the raw data). Negative
  amounts are outgoing (the user paid), positive are incoming (the user
  received).`;

  if (accts.length === 0 || txRows.length === 0) {
    return `${baseInstructions}

# CURRENT STATE
No bank connected yet${accts.length > 0 ? "" : ", or no transactions imported yet"}.
Politely tell the user there's no data to query against and suggest they
go to Subscriptions → Connect a bank → Pull & analyze.`;
  }

  // ---- Compact summaries ----
  const accountsCompact = accts.map((a) => ({
    name: a.displayName ?? a.iban ?? `Account ${a.id}`,
    iban_last4: a.iban ? a.iban.slice(-4) : null,
    balance_eur: a.balanceCents != null ? Number(a.balanceCents) / 100 : null,
  }));

  // Subs compact
  const subsCompact = subs.map((s) => ({
    name: s.name,
    monthly_amount_eur: s.monthly_amount_eur,
    cadence: s.cadence,
    category: s.category,
    confidence: s.confidence,
    manual: s.manual ?? false,
  }));

  const obligations = llmPayload?.recurring_obligations ?? [];

  // Transactions compact — one line per tx, oldest first so the LLM reads
  // them chronologically.
  type TxOut = {
    date: string;
    amt: number; // EUR signed
    merchant: string;
    cat: string | null;
    memo: string | null;
    account: string | null;
  };
  const txs: TxOut[] = txRows
    .map((t) => {
      const date = t.bookingDate ?? t.valueDate ?? "";
      const merchant =
        t.creditorName ?? t.debtorName ?? (t.memo ?? "").split(/\s+/).slice(0, 4).join(" ") ?? "(unknown)";
      const memo = t.memo && t.memo !== merchant ? t.memo.slice(0, 80) : null;
      return {
        date,
        amt: Math.round((Number(t.amountCents) / 100) * 100) / 100,
        merchant: merchant || "(unknown)",
        cat: t.category,
        memo,
        account: t.accountName,
      } satisfies TxOut;
    })
    .filter((t) => t.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Month rollup (current + previous 2 months) for fast "how much did I
  // spend on X" answers without the LLM having to count every line.
  type MonthRoll = { ym: string; in_cents: number; out_cents: number; by_category: Record<string, number> };
  const months = new Map<string, MonthRoll>();
  for (const t of txs) {
    const ym = t.date.slice(0, 7);
    let m = months.get(ym);
    if (!m) {
      m = { ym, in_cents: 0, out_cents: 0, by_category: {} };
      months.set(ym, m);
    }
    const cents = Math.round(t.amt * 100);
    if (cents >= 0) m.in_cents += cents;
    else m.out_cents += -cents;
    const cat = t.cat ?? "Uncategorized";
    m.by_category[cat] = (m.by_category[cat] ?? 0) + Math.abs(cents);
  }
  const monthsCompact = [...months.values()]
    .sort((a, b) => b.ym.localeCompare(a.ym))
    .slice(0, 4) // last 4 months
    .map((m) => ({
      ym: m.ym,
      in_eur: Math.round(m.in_cents) / 100,
      out_eur: Math.round(m.out_cents) / 100,
      net_eur: Math.round(m.in_cents - m.out_cents) / 100,
      by_category_eur: Object.fromEntries(
        Object.entries(m.by_category).map(([k, v]) => [k, Math.round(v) / 100]),
      ),
    }));

  return `${baseInstructions}

# CURRENT STATE

## Connected accounts
${JSON.stringify(accountsCompact, null, 1)}

## Detected subscriptions (active recurring charges)
${JSON.stringify(subsCompact, null, 1)}

## Recurring obligations (rent, loans, insurance — separate from subscriptions)
${JSON.stringify(obligations, null, 1)}

## Monthly summary (last 4 months, newest first)
${JSON.stringify(monthsCompact, null, 1)}

## Every transaction (oldest first, ~90 days of history)
Schema: date, amt (EUR; positive=income, negative=outgoing), merchant, cat=category, memo, account.
${JSON.stringify(txs, null, 1)}
`;
}
