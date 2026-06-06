// Reconciliation: suggest bank transactions that look like payment of an
// invoice. Heuristic scoring over the transactions Kashing already pulled —
// amount, invoice-number-in-memo, and customer-name overlap. Bank-feed-agnostic:
// it scores whatever transactions exist (today that's GoCardless EU/UK; if a
// Hong Kong feed is added later it works unchanged).
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices, transactions } from "@/lib/db/schema";
import { reconciledTransactionIds } from "@/lib/invoice-server";

export type MatchSuggestion = {
  transactionId: number;
  bookingDate: string | null;
  amountCents: number;
  currency: string;
  counterparty: string | null;
  memo: string | null;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
};

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Rank incoming credits as candidate payments for one open invoice.
 * Returns at most `limit`, best first; only candidates that clear a minimum
 * plausibility bar are surfaced.
 */
export async function suggestMatchesForInvoice(
  invoiceId: number,
  limit = 5,
): Promise<MatchSuggestion[]> {
  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!inv) return [];
  if (["paid", "void", "draft"].includes(inv.status)) return [];

  const outstanding = Number(inv.totalCents) - Number(inv.amountPaidCents);
  if (outstanding <= 0) return [];

  const reconciled = await reconciledTransactionIds();

  // Incoming credits in the same currency. A single user's dataset is small,
  // so pull and score in JS rather than build a fuzzy SQL query.
  const rows = await db
    .select({
      id: transactions.id,
      bookingDate: transactions.bookingDate,
      valueDate: transactions.valueDate,
      amountCents: transactions.amountCents,
      currency: transactions.currency,
      creditorName: transactions.creditorName,
      debtorName: transactions.debtorName,
      memo: transactions.memo,
    })
    .from(transactions)
    .where(and(gt(transactions.amountCents, 0), eq(transactions.currency, inv.currency)));

  const custTokens = norm(inv.customerName).split(" ").filter((t) => t.length >= 3);
  const numNorm = norm(inv.number);

  const out: MatchSuggestion[] = [];
  for (const t of rows) {
    if (reconciled.has(t.id)) continue;
    const amt = Number(t.amountCents);
    const date = t.bookingDate ?? t.valueDate ?? null;
    // A payment shouldn't predate the invoice (small grace not needed: issue
    // date is usually the same day or earlier than the wire).
    if (date && date < inv.issueDate) continue;

    const reasons: string[] = [];
    let score = 0;

    const diff = Math.abs(amt - outstanding);
    if (diff === 0) {
      score += 0.6;
      reasons.push("exact amount");
    } else if (diff <= Math.max(50, Math.round(outstanding * 0.01))) {
      score += 0.4;
      reasons.push("amount ~matches");
    } else if (diff <= Math.round(outstanding * 0.1)) {
      score += 0.15;
      reasons.push("amount close");
    }

    const hay = `${norm(t.debtorName)} ${norm(t.creditorName)} ${norm(t.memo)}`;

    if (numNorm && hay.includes(numNorm)) {
      score += 0.5;
      reasons.push("invoice no. in memo");
    }

    if (custTokens.length) {
      const hits = custTokens.filter((tok) => hay.includes(tok)).length;
      if (hits === custTokens.length) {
        score += 0.3;
        reasons.push("name matches");
      } else if (hits > 0) {
        score += 0.15;
        reasons.push("name partial");
      }
    }

    if (score < 0.3) continue; // not worth surfacing

    out.push({
      transactionId: t.id,
      bookingDate: date,
      amountCents: amt,
      currency: t.currency,
      counterparty: t.debtorName ?? t.creditorName ?? null,
      memo: t.memo,
      score: Math.round(score * 100) / 100,
      confidence: score >= 0.8 ? "high" : score >= 0.5 ? "medium" : "low",
      reasons,
    });
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
