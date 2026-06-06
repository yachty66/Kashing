import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";

export const runtime = "nodejs";

async function idFrom(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await idFrom(ctx);
  if (id === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const [row] = await db.select().from(customers).where(eq(customers.id, id));
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ customer: row });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await idFrom(ctx);
  if (id === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as Record<string, string> | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  if ("name" in body && !body.name?.trim()) {
    return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
  }
  const required = new Set(["name", "defaultCurrency"]); // never blank these
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ["name", "email", "addressLines", "city", "brNumber", "vatId", "taxId", "phone", "defaultCurrency"]) {
    if (!(key in body)) continue;
    const v = body[key]?.trim() ?? "";
    if (required.has(key)) {
      if (v) patch[key] = v;
    } else {
      patch[key] = v || null;
    }
  }
  const [row] = await db.update(customers).set(patch).where(eq(customers.id, id)).returning();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ customer: row });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = await idFrom(ctx);
  if (id === null) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  await db.delete(customers).where(eq(customers.id, id));
  return NextResponse.json({ ok: true });
}
