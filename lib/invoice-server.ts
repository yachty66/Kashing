// Server-side invoice helpers (touch the DB). Imported only by API routes.
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessProfile, customers, invoiceLines, invoicePayments, invoices } from "@/lib/db/schema";

/** Today and date arithmetic as YYYY-MM-DD strings. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Create a one-line invoice in a single call (used by the WhatsApp agent).
 * Issues it as "sent" with a due date derived from the customer's credit terms
 * (or the passed default), and stamps a unique invoice number.
 */
export async function createSimpleInvoice(opts: {
  customerName: string;
  customerId?: number | null;
  amountCents: number;
  description: string;
  termsDays?: number;
}) {
  const profile = await getOrCreateBusinessProfile();
  let customerName = opts.customerName.trim();
  let customerId: number | null = opts.customerId ?? null;
  let termsDays = opts.termsDays ?? 30;
  if (customerId != null) {
    const [c] = await db.select().from(customers).where(eq(customers.id, customerId));
    if (c) {
      customerName = customerName || c.name;
      termsDays = opts.termsDays ?? c.creditTermsDays;
    } else {
      customerId = null;
    }
  }
  const number = await allocateInvoiceNumber();
  const amountCents = Math.max(0, Math.round(opts.amountCents));
  const [inv] = await db
    .insert(invoices)
    .values({
      number,
      customerId,
      customerName,
      issueDate: todayISO(),
      dueDate: addDaysISO(termsDays),
      currency: profile.defaultCurrency,
      status: "sent",
      subtotalCents: amountCents,
      discountCents: 0,
      totalCents: amountCents,
      sentAt: new Date(),
    })
    .returning();
  await db.insert(invoiceLines).values({
    invoiceId: inv.id,
    description: opts.description.trim() || "Services",
    quantity: "1",
    unitPriceCents: amountCents,
    amountCents,
    sortOrder: 0,
  });
  return inv;
}

const OPEN_STATUSES = ["sent", "partly_paid"] as const;

/** Open invoices with their outstanding balance and days overdue. */
export async function openReceivables() {
  const rows = await db
    .select()
    .from(invoices)
    .where(inArray(invoices.status, OPEN_STATUSES as unknown as string[]));
  const today = todayISO();
  return rows
    .map((inv) => {
      const outstandingCents = Number(inv.totalCents) - Number(inv.amountPaidCents);
      const daysOverdue = inv.dueDate && inv.dueDate < today
        ? Math.floor((Date.parse(today) - Date.parse(inv.dueDate)) / 86_400_000)
        : 0;
      return { inv, outstandingCents, daysOverdue };
    })
    .filter((r) => r.outstandingCents > 0);
}

/** AR aging buckets (outstanding cents) across all open invoices. */
export async function arAging() {
  const open = await openReceivables();
  const b = { current: 0, d1_30: 0, d31_60: 0, d60plus: 0, total: 0 };
  for (const { outstandingCents, daysOverdue } of open) {
    b.total += outstandingCents;
    if (daysOverdue <= 0) b.current += outstandingCents;
    else if (daysOverdue <= 30) b.d1_30 += outstandingCents;
    else if (daysOverdue <= 60) b.d31_60 += outstandingCents;
    else b.d60plus += outstandingCents;
  }
  return b;
}

/** Open invoices already past their due date, most overdue first. */
export async function overdueInvoices() {
  const open = await openReceivables();
  return open.filter((r) => r.daysOverdue > 0).sort((a, b) => b.daysOverdue - a.daysOverdue);
}

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

/**
 * Recompute subtotal/total from the invoice's lines + discount and persist.
 * For percent discounts the effective discountCents is re-derived from the
 * stored percentage against the fresh subtotal.
 */
export async function recalcInvoiceTotals(invoiceId: number): Promise<void> {
  const [inv] = await db
    .select({
      discountCents: invoices.discountCents,
      discountKind: invoices.discountKind,
      discountPercent: invoices.discountPercent,
    })
    .from(invoices)
    .where(eq(invoices.id, invoiceId));
  if (!inv) return;
  const lines = await db
    .select({ amountCents: invoiceLines.amountCents })
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId));
  const subtotal = lines.reduce((s, l) => s + Number(l.amountCents), 0);
  let discount = Number(inv.discountCents);
  if (inv.discountKind === "percent") {
    const pct = Math.max(0, Math.min(100, Number(inv.discountPercent) || 0));
    discount = Math.round((subtotal * pct) / 100);
  }
  const total = Math.max(0, subtotal - discount);
  await db
    .update(invoices)
    .set({ subtotalCents: subtotal, discountCents: discount, totalCents: total, updatedAt: new Date() })
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
