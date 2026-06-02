import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subscriptionAdditions } from "@/lib/db/schema";

export const runtime = "nodejs";

/** Add a subscription the LLM missed. */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    name?: string;
    monthly_amount_eur?: number;
    cadence?: string;
    category?: string;
    domain?: string;
    evidence?: string;
  };
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (body.monthly_amount_eur == null || !Number.isFinite(body.monthly_amount_eur)) {
    return NextResponse.json({ error: "monthly_amount_eur required" }, { status: 400 });
  }

  const [row] = await db
    .insert(subscriptionAdditions)
    .values({
      name: body.name.trim(),
      monthlyAmountEur: String(body.monthly_amount_eur),
      cadence: (body.cadence ?? "monthly").toLowerCase(),
      category: body.category?.trim() || null,
      domain: body.domain?.trim().toLowerCase() || null,
      evidence: body.evidence?.trim() || null,
    })
    .returning();

  return NextResponse.json({ ok: true, id: row.id });
}
