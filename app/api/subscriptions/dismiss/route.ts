import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { subscriptionDismissals } from "@/lib/db/schema";

export const runtime = "nodejs";

/** Hide an LLM-detected subscription from the analysis. */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    name?: string;
    merchant_strings?: string[];
  };
  if (!body.name) return NextResponse.json({ error: "name required" }, { status: 400 });

  await db.insert(subscriptionDismissals).values({
    name: body.name.toLowerCase().trim(),
    merchantStrings: body.merchant_strings ?? [],
  });

  return NextResponse.json({ ok: true });
}

/** Restore a previously dismissed subscription (called via DELETE /api/subscriptions/dismiss?name=…) */
export async function DELETE(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  await db
    .delete(subscriptionDismissals)
    .where(sql`lower(${subscriptionDismissals.name}) = ${name.toLowerCase().trim()}`);

  return NextResponse.json({ ok: true });
}

/** List currently dismissed subscriptions (so the UI can show them in a "show dismissed" section). */
export async function GET() {
  const rows = await db.select().from(subscriptionDismissals);
  return NextResponse.json({
    dismissals: rows.map((r) => ({
      id: r.id,
      name: r.name,
      merchant_strings: r.merchantStrings,
      created_at: r.createdAt.toISOString(),
    })),
  });
}
