import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, invoiceLines, invoices } from "@/lib/db/schema";
import { allocateInvoiceNumber, getOrCreateBusinessProfile } from "@/lib/invoice-server";
import { lineAmountCents, todayISO } from "@/lib/invoices";

export const runtime = "nodejs";

type LineInput = { description?: string; quantity?: string; unitPriceCents?: number };

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

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    customerId?: number | null;
    customerName?: string;
    issueDate?: string;
    dueDate?: string | null;
    currency?: string;
    notes?: string;
    footer?: string;
    discountCents?: number;
    status?: "draft" | "sent";
    lines?: LineInput[];
  } | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const profile = await getOrCreateBusinessProfile();

  // Resolve a customer name snapshot (from id, explicit name, or blank).
  let customerName = body.customerName?.trim() || null;
  let customerId: number | null = null;
  if (typeof body.customerId === "number") {
    const [c] = await db.select().from(customers).where(eq(customers.id, body.customerId));
    if (c) {
      customerId = c.id;
      customerName = customerName ?? c.name;
    }
  }

  const lines = (body.lines ?? []).map((l, i) => {
    const quantity = (l.quantity ?? "1").toString();
    const unitPriceCents = Math.round(Number(l.unitPriceCents) || 0);
    return {
      description: (l.description ?? "").trim(),
      quantity,
      unitPriceCents,
      amountCents: lineAmountCents(quantity, unitPriceCents),
      sortOrder: i,
    };
  });

  const discountCents = Math.max(0, Math.round(Number(body.discountCents) || 0));
  const subtotalCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const totalCents = Math.max(0, subtotalCents - discountCents);

  const status = body.status === "sent" ? "sent" : "draft";
  const number = await allocateInvoiceNumber();

  const [inv] = await db
    .insert(invoices)
    .values({
      number,
      customerId,
      customerName,
      issueDate: body.issueDate?.trim() || todayISO(),
      dueDate: body.dueDate?.trim() || null,
      currency: body.currency?.trim() || profile.defaultCurrency,
      status,
      subtotalCents,
      discountCents,
      totalCents,
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
