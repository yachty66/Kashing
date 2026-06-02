import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscriptionAdditions } from "@/lib/db/schema";

export const runtime = "nodejs";

/** Delete a manually-added subscription by id. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  await db.delete(subscriptionAdditions).where(eq(subscriptionAdditions.id, numId));
  return NextResponse.json({ ok: true });
}
