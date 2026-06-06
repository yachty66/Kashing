import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, invoiceLines, invoicePayments, invoices } from "@/lib/db/schema";
import { lineAmountCents } from "@/lib/invoices";
import { recalcInvoiceTotals, syncInvoicePaymentState } from "@/lib/invoice-server";

export const runtime = "nodejs";

type LineInput = { description?: string; details?: string; unit?: string; quantity?: string; unitPriceCents?: number };

async function idFrom(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await idFrom(ctx);
  if (id === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!invoice) return NextResponse.json({ error: "not found" }, { status: 404 });

  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, id))
    .orderBy(asc(invoiceLines.sortOrder));
  const payments = await db
    .select()
    .from(invoicePayments)
    .where(eq(invoicePayments.invoiceId, id))
    .orderBy(asc(invoicePayments.paidAt));
  const customer = invoice.customerId
    ? (await db.select().from(customers).where(eq(customers.id, invoice.customerId)))[0] ?? null
    : null;

  return NextResponse.json({ invoice, lines, payments, customer });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await idFrom(ctx);
  if (id === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const [existing] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    customerId?: number | null;
    customerName?: string | null;
    documentType?: string;
    issueDate?: string;
    dueDate?: string | null;
    currency?: string;
    notes?: string | null;
    headerText?: string | null;
    footer?: string | null;
    orderNumber?: string | null;
    servicePeriodStart?: string | null;
    servicePeriodEnd?: string | null;
    recurrenceKind?: string;
    recurrenceInterval?: string | null;
    recurrenceEndAt?: string | null;
    discountKind?: string;
    discountPercent?: number;
    discountCents?: number;
    lines?: LineInput[];
  } | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if ("customerId" in body) {
    if (typeof body.customerId === "number") {
      const [c] = await db.select().from(customers).where(eq(customers.id, body.customerId));
      patch.customerId = c ? c.id : null;
      patch.customerName = body.customerName?.trim() || c?.name || null;
    } else {
      patch.customerId = null;
      patch.customerName = body.customerName?.trim() || null;
    }
  } else if ("customerName" in body) {
    patch.customerName = body.customerName?.trim() || null;
  }

  if (typeof body.documentType === "string") patch.documentType = body.documentType === "credit_note" ? "credit_note" : "invoice";
  if (typeof body.issueDate === "string" && body.issueDate.trim()) patch.issueDate = body.issueDate.trim();
  if ("dueDate" in body) patch.dueDate = body.dueDate?.trim() || null;
  if (typeof body.currency === "string" && body.currency.trim()) patch.currency = body.currency.trim();
  if ("notes" in body) patch.notes = body.notes?.trim() || null;
  if ("headerText" in body) patch.headerText = body.headerText?.trim() || null;
  if ("footer" in body) patch.footer = body.footer?.trim() || null;
  if ("orderNumber" in body) patch.orderNumber = body.orderNumber?.trim() || null;
  if ("servicePeriodStart" in body) patch.servicePeriodStart = body.servicePeriodStart?.trim() || null;
  if ("servicePeriodEnd" in body) patch.servicePeriodEnd = body.servicePeriodEnd?.trim() || null;
  if (typeof body.recurrenceKind === "string") patch.recurrenceKind = body.recurrenceKind === "recurring" ? "recurring" : "one_off";
  if ("recurrenceInterval" in body) patch.recurrenceInterval = body.recurrenceInterval?.trim() || null;
  if ("recurrenceEndAt" in body) patch.recurrenceEndAt = body.recurrenceEndAt?.trim() || null;
  if (typeof body.discountKind === "string") {
    patch.discountKind = body.discountKind === "percent" ? "percent" : "amount";
    patch.discountPercent = body.discountKind === "percent" ? String(Number(body.discountPercent) || 0) : null;
  }
  if ("discountCents" in body) patch.discountCents = Math.max(0, Math.round(Number(body.discountCents) || 0));

  await db.update(invoices).set(patch).where(eq(invoices.id, id));

  // Replace line items wholesale when provided.
  if (Array.isArray(body.lines)) {
    await db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, id));
    const lines = body.lines.map((l, i) => {
      const quantity = (l.quantity ?? "1").toString();
      const unitPriceCents = Math.round(Number(l.unitPriceCents) || 0);
      return {
        invoiceId: id,
        description: (l.description ?? "").trim(),
        details: l.details?.trim() || null,
        unit: l.unit?.trim() || null,
        quantity,
        unitPriceCents,
        amountCents: lineAmountCents(quantity, unitPriceCents),
        sortOrder: i,
      };
    });
    if (lines.length) await db.insert(invoiceLines).values(lines);
  }

  await recalcInvoiceTotals(id);
  // Totals may have changed → re-evaluate paid/partly_paid against new total.
  await syncInvoicePaymentState(id);

  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
  return NextResponse.json({ invoice });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await idFrom(ctx);
  if (id === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  await db.delete(invoices).where(eq(invoices.id, id)); // cascades lines + payments
  return NextResponse.json({ ok: true });
}
