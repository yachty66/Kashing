import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { manualEntries } from "@/lib/db/schema";

export const runtime = "nodejs";

/** Delete a manual asset/liability by id. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) {
    return NextResponse.json({ error: "bad_id" }, { status: 400 });
  }
  await db.delete(manualEntries).where(eq(manualEntries.id, numId));
  return NextResponse.json({ ok: true });
}
