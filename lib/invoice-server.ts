// Server-side invoice helpers (touch the DB). Imported only by API routes.
import { eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessProfile, invoiceLines, invoicePayments, invoices } from "@/lib/db/schema";

/** Return the single business-profile row, creating a default one if missing. */
export async function getOrCreateBusinessProfile() {
  const existing = await db.select().from(businessProfile).limit(1);
  if (existing.length > 0) return existing[0];
  const [row] = await db.insert(businessProfile).values({}).returning();
  return row;
}

/**
 * Allocate the next sequential invoice number (e.g. "INV-2026-0001") and bump
 * the counter. Single-user app, so a read-increment is safe enough; the unique
 * constraint on invoices.number is the backstop.
 */
export async function allocateInvoiceNumber(): Promise<string> {
  const profile = await getOrCreateBusinessProfile();
  const seq = profile.nextSeq;
  await db
    .update(businessProfile)
    .set({ nextSeq: seq + 1, updatedAt: new Date() })
    .where(eq(businessProfile.id, profile.id));
  const year = new Date().getFullYear();
  return `${profile.invoicePrefix}-${year}-${String(seq).padStart(4, "0")}`;
}

/** Recompute subtotal/total from the invoice's lines and persist them. */
export async function recalcInvoiceTotals(invoiceId: number): Promise<void> {
  const [inv] = await db
    .select({ discountCents: invoices.discountCents })
    .from(invoices)
    .where(eq(invoices.id, invoiceId));
  if (!inv) return;
  const lines = await db
    .select({ amountCents: invoiceLines.amountCents })
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId));
  const subtotal = lines.reduce((s, l) => s + Number(l.amountCents), 0);
  const total = Math.max(0, subtotal - Number(inv.discountCents));
  await db
    .update(invoices)
    .set({ subtotalCents: subtotal, totalCents: total, updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId));
}

/**
 * Re-sum the invoice's payments and move its status accordingly:
 *   paid_total >= total          → "paid"   (+ paidAt)
 *   0 < paid_total < total       → "partly_paid"
 *   paid_total == 0              → back to "sent" (if it had advanced)
 * Never touches "draft" or "void" invoices.
 */
export async function syncInvoicePaymentState(invoiceId: number): Promise<void> {
  const [inv] = await db
    .select({ status: invoices.status, totalCents: invoices.totalCents })
    .from(invoices)
    .where(eq(invoices.id, invoiceId));
  if (!inv) return;
  if (inv.status === "void") return;

  const [{ paid }] = await db
    .select({ paid: sql<number>`coalesce(sum(${invoicePayments.amountCents}), 0)` })
    .from(invoicePayments)
    .where(eq(invoicePayments.invoiceId, invoiceId));
  const paidCents = Number(paid);
  const total = Number(inv.totalCents);

  let status = inv.status;
  let paidAt: Date | null = null;
  if (paidCents <= 0) {
    // Drop back to "sent" only if it had previously advanced; leave drafts alone.
    if (inv.status === "paid" || inv.status === "partly_paid") status = "sent";
  } else if (paidCents >= total && total > 0) {
    status = "paid";
    paidAt = new Date();
  } else {
    status = "partly_paid";
  }

  await db
    .update(invoices)
    .set({ amountPaidCents: paidCents, status, paidAt, updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId));
}

/** Guard used by the matching engine: amounts already reconciled to invoices. */
export async function reconciledTransactionIds(): Promise<Set<number>> {
  const rows = await db
    .select({ transactionId: invoicePayments.transactionId })
    .from(invoicePayments)
    .where(isNotNull(invoicePayments.transactionId));
  return new Set(rows.map((r) => Number(r.transactionId)).filter((n) => Number.isInteger(n)));
}
