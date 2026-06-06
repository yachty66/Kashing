import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoicePayments, invoices, transactions } from "@/lib/db/schema";
import { suggestMatchesForInvoice } from "@/lib/invoice-matching";
import { syncInvoicePaymentState } from "@/lib/invoice-server";

export const runtime = "nodejs";

/** GET — suggested bank transactions that look like payment of this invoice. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const suggestions = await suggestMatchesForInvoice(numId);
  return NextResponse.json({ suggestions });
}

/**
 * POST { transactionId, amountCents? } — reconcile a bank transaction as
 * payment of this invoice. Records an invoicePayment linked to the transaction.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const [inv] = await db.select().from(invoices).where(eq(invoices.id, numId));
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { transactionId?: number; amountCents?: number } | null;
  const txId = Number(body?.transactionId);
  if (!Number.isInteger(txId)) return NextResponse.json({ error: "transactionId required" }, { status: 400 });

  const [tx] = await db.select().from(transactions).where(eq(transactions.id, txId));
  if (!tx) return NextResponse.json({ error: "transaction not found" }, { status: 404 });

  // Default to the transaction's own amount; allow an explicit override (e.g.
  // a lump payment covering several invoices — apply only part here).
  const amountCents = Math.round(Number(body?.amountCents) || Number(tx.amountCents));
  if (amountCents <= 0) return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });

  await db.insert(invoicePayments).values({
    invoiceId: numId,
    transactionId: txId,
    amountCents,
    paidAt: tx.bookingDate ?? tx.valueDate ?? new Date().toISOString().slice(0, 10),
    method: "reconciled",
    note: tx.debtorName ?? tx.creditorName ?? null,
  });

  if (inv.status === "draft") {
    await db.update(invoices).set({ status: "sent", sentAt: new Date() }).where(eq(invoices.id, numId));
  }
  await syncInvoicePaymentState(numId);

  const [updated] = await db.select().from(invoices).where(eq(invoices.id, numId));
  return NextResponse.json({ invoice: updated }, { status: 201 });
}
