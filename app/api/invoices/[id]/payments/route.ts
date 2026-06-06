import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoicePayments, invoices } from "@/lib/db/schema";
import { syncInvoicePaymentState } from "@/lib/invoice-server";
import { todayISO } from "@/lib/invoices";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const rows = await db
    .select()
    .from(invoicePayments)
    .where(eq(invoicePayments.invoiceId, numId))
    .orderBy(asc(invoicePayments.paidAt));
  return NextResponse.json({ payments: rows });
}

/** POST { amountCents, paidAt?, method?, note? } — record a manual payment. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const [inv] = await db.select().from(invoices).where(eq(invoices.id, numId));
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    amountCents?: number;
    paidAt?: string;
    method?: string;
    note?: string;
  } | null;
  const amountCents = Math.round(Number(body?.amountCents) || 0);
  if (amountCents <= 0) return NextResponse.json({ error: "amountCents must be > 0" }, { status: 400 });

  await db.insert(invoicePayments).values({
    invoiceId: numId,
    amountCents,
    paidAt: body?.paidAt?.trim() || todayISO(),
    method: body?.method?.trim() || "manual",
    note: body?.note?.trim() || null,
  });

  // A payment on a draft implicitly issues it first.
  if (inv.status === "draft") {
    await db.update(invoices).set({ status: "sent", sentAt: new Date() }).where(eq(invoices.id, numId));
  }
  await syncInvoicePaymentState(numId);

  const [updated] = await db.select().from(invoices).where(eq(invoices.id, numId));
  return NextResponse.json({ invoice: updated }, { status: 201 });
}

/** DELETE ?paymentId= — remove a payment and re-evaluate status. */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const paymentId = Number(req.nextUrl.searchParams.get("paymentId"));
  if (!Number.isInteger(paymentId)) return NextResponse.json({ error: "missing paymentId" }, { status: 400 });

  await db.delete(invoicePayments).where(eq(invoicePayments.id, paymentId));
  await syncInvoicePaymentState(numId);
  const [updated] = await db.select().from(invoices).where(eq(invoices.id, numId));
  return NextResponse.json({ invoice: updated });
}
