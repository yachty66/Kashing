import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bills } from "@/lib/db/schema";
import { normalizeIban, normalizeBic } from "@/lib/iban";

export const runtime = "nodejs";

async function idFrom(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

/** PUT — edit a bill, or flip status: { status: "paid"|"unpaid", booked: true } */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await idFrom(ctx);
  if (id === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof b.supplierName === "string") patch.supplierName = b.supplierName.trim();
  if (typeof b.invoiceNumber === "string") patch.invoiceNumber = b.invoiceNumber.trim() || null;
  if (typeof b.invoiceDate === "string") patch.invoiceDate = b.invoiceDate.trim() || null;
  if (typeof b.dueDate === "string") patch.dueDate = b.dueDate.trim() || null;
  if (typeof b.description === "string") patch.description = b.description.trim() || null;
  if (b.amountCents !== undefined) patch.amountCents = Math.round(Number(b.amountCents) || 0);
  if (typeof b.currency === "string") patch.currency = b.currency.trim() || "EUR";
  if ("paymentIban" in b) patch.paymentIban = normalizeIban(b.paymentIban);
  if ("paymentBic" in b) patch.paymentBic = normalizeBic(b.paymentBic);
  if (b.status === "paid" || b.status === "unpaid") {
    patch.status = b.status;
    patch.paidAt = b.status === "paid" ? new Date() : null;
  }
  if (b.booked === true) patch.bookedAt = new Date();
  if (b.booked === false) patch.bookedAt = null;

  const [row] = await db.update(bills).set(patch).where(eq(bills.id, id)).returning();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ bill: row });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await idFrom(ctx);
  if (id === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  await db.delete(bills).where(eq(bills.id, id));
  return NextResponse.json({ ok: true });
}
