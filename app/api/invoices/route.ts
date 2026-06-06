import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, invoiceLines, invoices } from "@/lib/db/schema";
import { allocateInvoiceNumber, getOrCreateBusinessProfile } from "@/lib/invoice-server";
import { lineAmountCents, todayISO } from "@/lib/invoices";

export const runtime = "nodejs";

type LineInput = { description?: string; details?: string; unit?: string; quantity?: string; unitPriceCents?: number };

export async function GET() {
  const rows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      customerName: invoices.customerName,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      currency: invoices.currency,
      status: invoices.status,
      totalCents: invoices.totalCents,
      amountPaidCents: invoices.amountPaidCents,
      createdAt: invoices.createdAt,
    })
    .from(invoices)
    .orderBy(desc(invoices.createdAt));
  return NextResponse.json({ invoices: rows });
}

/** Map line drafts → DB rows with computed amounts. */
function mapLines(input: LineInput[]) {
  return input.map((l, i) => {
    const quantity = (l.quantity ?? "1").toString();
    const unitPriceCents = Math.round(Number(l.unitPriceCents) || 0);
    return {
      description: (l.description ?? "").trim(),
      details: l.details?.trim() || null,
      unit: l.unit?.trim() || null,
      quantity,
      unitPriceCents,
      amountCents: lineAmountCents(quantity, unitPriceCents),
      sortOrder: i,
    };
  });
}

/** Resolve the effective discount (cents) from kind + raw value. */
function effectiveDiscount(
  subtotalCents: number,
  kind: string,
  discountCents: number,
  discountPercent: number,
) {
  if (kind === "percent") {
    const pct = Math.max(0, Math.min(100, discountPercent));
    return Math.round((subtotalCents * pct) / 100);
  }
  return Math.max(0, Math.round(discountCents));
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    customerId?: number | null;
    customerName?: string;
    documentType?: string;
    issueDate?: string;
    dueDate?: string | null;
    currency?: string;
    notes?: string;
    headerText?: string;
    footer?: string;
    orderNumber?: string;
    servicePeriodStart?: string | null;
    servicePeriodEnd?: string | null;
    recurrenceKind?: string;
    recurrenceInterval?: string | null;
    recurrenceEndAt?: string | null;
    discountKind?: string;
    discountPercent?: number;
    discountCents?: number;
    status?: "draft" | "sent";
    lines?: LineInput[];
  } | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const profile = await getOrCreateBusinessProfile();

  let customerName = body.customerName?.trim() || null;
  let customerId: number | null = null;
  if (typeof body.customerId === "number") {
    const [c] = await db.select().from(customers).where(eq(customers.id, body.customerId));
    if (c) {
      customerId = c.id;
      customerName = customerName ?? c.name;
    }
  }

  const lines = mapLines(body.lines ?? []);
  const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const discountKind = body.discountKind === "percent" ? "percent" : "amount";
  const discountPercent = Number(body.discountPercent) || 0;
  const discountCents = effectiveDiscount(subtotalCents, discountKind, Number(body.discountCents) || 0, discountPercent);
  const totalCents = Math.max(0, subtotalCents - discountCents);

  const status = body.status === "sent" ? "sent" : "draft";
  const number = await allocateInvoiceNumber();

  const [inv] = await db
    .insert(invoices)
    .values({
      number,
      customerId,
      customerName,
      documentType: body.documentType === "credit_note" ? "credit_note" : "invoice",
      issueDate: body.issueDate?.trim() || todayISO(),
      dueDate: body.dueDate?.trim() || null,
      currency: body.currency?.trim() || profile.defaultCurrency,
      status,
      subtotalCents,
      discountKind,
      discountPercent: discountKind === "percent" ? String(discountPercent) : null,
      discountCents,
      totalCents,
      recurrenceKind: body.recurrenceKind === "recurring" ? "recurring" : "one_off",
      recurrenceInterval: body.recurrenceInterval?.trim() || null,
      recurrenceEndAt: body.recurrenceEndAt?.trim() || null,
      servicePeriodStart: body.servicePeriodStart?.trim() || null,
      servicePeriodEnd: body.servicePeriodEnd?.trim() || null,
      orderNumber: body.orderNumber?.trim() || null,
      headerText: body.headerText?.trim() || null,
      notes: body.notes?.trim() || null,
      footer: body.footer?.trim() || profile.footerNote || null,
      sentAt: status === "sent" ? new Date() : null,
    })
    .returning();

  if (lines.length) {
    await db.insert(invoiceLines).values(lines.map((l) => ({ ...l, invoiceId: inv.id })));
  }

  return NextResponse.json({ invoice: inv }, { status: 201 });
}
