import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { manualEntries } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Create a manual asset or liability.
 * Body: { kind: 'asset' | 'liability', name, valueEur, category? }
 * valueEur is the human-entered amount (e.g. 12500.50) and is stored as a
 * positive magnitude in cents; `kind` decides the sign at sum time.
 */
export async function POST(req: NextRequest) {
  let body: { kind?: string; name?: string; valueEur?: number | string; category?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const kind = body.kind === "liability" ? "liability" : body.kind === "asset" ? "asset" : null;
  const name = (body.name ?? "").trim();
  const value = typeof body.valueEur === "string" ? parseFloat(body.valueEur) : body.valueEur;

  if (!kind) return NextResponse.json({ error: "kind must be 'asset' or 'liability'" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (value == null || !isFinite(value) || value < 0) {
    return NextResponse.json({ error: "valueEur must be a non-negative number" }, { status: 400 });
  }

  const [row] = await db
    .insert(manualEntries)
    .values({
      kind,
      name,
      valueCents: Math.round(value * 100),
      category: (body.category ?? "").trim() || null,
    })
    .returning({ id: manualEntries.id });

  return NextResponse.json({ ok: true, id: row.id });
}
