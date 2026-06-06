import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { normalizeIban, normalizeBic } from "@/lib/iban";

export const runtime = "nodejs";

async function idFrom(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await idFrom(ctx);
  if (id === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const [row] = await db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ supplier: row });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await idFrom(ctx);
  if (id === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const b = (await req.json().catch(() => null)) as Record<string, string> | null;
  if (!b) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  if ("name" in b && !b.name?.trim()) return NextResponse.json({ error: "Name darf nicht leer sein" }, { status: 400 });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (b.name !== undefined) { patch.name = b.name.trim(); patch.normalizedName = b.name.trim().toLowerCase(); }
  for (const k of ["taxId", "addressLines", "postalCode", "city", "country", "email"]) {
    if (k in b) patch[k] = b[k]?.trim() || null;
  }
  if ("iban" in b) patch.iban = normalizeIban(b.iban);
  if ("bic" in b) patch.bic = normalizeBic(b.bic);

  const [row] = await db.update(suppliers).set(patch).where(eq(suppliers.id, id)).returning();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ supplier: row });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await idFrom(ctx);
  if (id === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  await db.delete(suppliers).where(eq(suppliers.id, id));
  return NextResponse.json({ ok: true });
}
