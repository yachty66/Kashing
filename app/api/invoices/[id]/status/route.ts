import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * POST { action: "send" | "void" | "draft" } — explicit lifecycle moves the
 * payment flow doesn't cover. "send" stamps sentAt the first time.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action;
  if (!action || !["send", "void", "draft"].includes(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const [inv] = await db.select().from(invoices).where(eq(invoices.id, numId));
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (action === "send") {
    patch.status = "sent";
    if (!inv.sentAt) patch.sentAt = new Date();
  } else if (action === "void") {
    patch.status = "void";
  } else if (action === "draft") {
    patch.status = "draft";
    patch.sentAt = null;
  }

  const [row] = await db.update(invoices).set(patch).where(eq(invoices.id, numId)).returning();
  return NextResponse.json({ invoice: row });
}
