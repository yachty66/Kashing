import { gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoicePayments, transactions } from "@/lib/db/schema";
import { openReceivables, reconciledTransactionIds, syncInvoicePaymentState } from "@/lib/invoice-server";
import { money } from "@/lib/money";

export type AutoMatch = {
  invoiceId: number;
  invoiceNumber: string;
  customerName: string | null;
  transactionId: number;
  amountCents: number;
};

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Tier-1 auto-reconciliation: an incoming credit whose memo carries the
 * invoice number AND whose amount equals the invoice's outstanding balance is
 * settled automatically. Everything fuzzier stays a suggestion (handled by
 * lib/invoice-matching in the UI), so we never silently mis-settle.
 */
export async function autoReconcileTransactions(): Promise<AutoMatch[]> {
  const open = await openReceivables();
  if (open.length === 0) return [];

  const reconciled = await reconciledTransactionIds();
  const credits = await db
    .select({
      id: transactions.id,
      amountCents: transactions.amountCents,
      currency: transactions.currency,
      creditorName: transactions.creditorName,
      debtorName: transactions.debtorName,
      memo: transactions.memo,
      bookingDate: transactions.bookingDate,
      valueDate: transactions.valueDate,
    })
    .from(transactions)
    .where(gt(transactions.amountCents, 0));

  const today = new Date().toISOString().slice(0, 10);
  const used = new Set<number>();
  const matches: AutoMatch[] = [];

  for (const { inv, outstandingCents } of open) {
    const numNorm = norm(inv.number);
    if (!numNorm) continue;
    for (const t of credits) {
      if (reconciled.has(t.id) || used.has(t.id)) continue;
      if (t.currency && inv.currency && t.currency !== inv.currency) continue;
      const hay = norm(`${t.creditorName} ${t.debtorName} ${t.memo}`);
      const refHit = hay.includes(numNorm);
      const amountHit = Number(t.amountCents) === outstandingCents;
      if (!refHit || !amountHit) continue;

      await db.insert(invoicePayments).values({
        invoiceId: inv.id,
        transactionId: t.id,
        amountCents: Number(t.amountCents),
        paidAt: t.bookingDate ?? t.valueDate ?? today,
        method: "reconciled",
        note: "auto-reconciled (reference + amount)",
      });
      await syncInvoicePaymentState(inv.id);
      used.add(t.id);
      matches.push({
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        customerName: inv.customerName,
        transactionId: t.id,
        amountCents: Number(t.amountCents),
      });
      break;
    }
  }

  if (matches.length > 0) void notifyManager(matches);
  return matches;
}

/** Best-effort WhatsApp ping to the manager when invoices auto-settle. */
async function notifyManager(matches: AutoMatch[]): Promise<void> {
  try {
    const { getManager } = await import("@/lib/users");
    const { twilioChannel } = await import("@/lib/twilio");
    const mgr = await getManager();
    if (!mgr) return;
    const channel = twilioChannel();
    for (const m of matches) {
      await channel.send(
        mgr.phone,
        `✅ ${m.invoiceNumber} paid — ${money(m.amountCents, "HKD")}${m.customerName ? ` from ${m.customerName}` : ""}. Auto-reconciled.`,
      );
    }
  } catch (e) {
    console.warn("reconcile notify failed", e);
  }
}
