import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { finverseIdentities } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Lightweight poll target for the connect popup. Given the `state` from
 * /api/connect/finverse, reports whether the Finverse callback has completed
 * (status flips to CONNECTED once accounts are upserted).
 */
export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get("state");
  if (!state) return NextResponse.json({ error: "state required" }, { status: 400 });
  const rows = await db
    .select({ status: finverseIdentities.status })
    .from(finverseIdentities)
    .where(eq(finverseIdentities.state, state))
    .limit(1);
  return NextResponse.json({ status: rows[0]?.status ?? "UNKNOWN" });
}
