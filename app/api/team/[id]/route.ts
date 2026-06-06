import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const runtime = "nodejs";

// HKD number → cents, or null to clear (0/empty/null clears the limit).
function toCents(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const set: Partial<typeof users.$inferInsert> = {};
  if (typeof b.name === "string" && b.name.trim()) set.name = b.name.trim();
  if (b.role === "manager" || b.role === "employee") set.role = b.role;
  if ("monthlyAllowanceHkd" in b) set.monthlyAllowanceCents = toCents(b.monthlyAllowanceHkd);
  if ("maxSingleQrHkd" in b) set.maxSingleQrCents = toCents(b.maxSingleQrHkd);
  if ("autoApproveUnderHkd" in b) set.autoApproveUnderCents = toCents(b.autoApproveUnderHkd);
  if (Object.keys(set).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const [row] = await db.update(users).set(set).where(eq(users.id, userId)).returning();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ user: row });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  await db.delete(users).where(eq(users.id, userId));
  return NextResponse.json({ ok: true });
}
