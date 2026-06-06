import { NextResponse } from "next/server";
import { lt, isNotNull, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { suppliers, transactions } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Seed the supplier list from the bank feed: every distinct creditor name on an
 * outgoing transaction (money you paid) that isn't already a supplier becomes
 * one. Idempotent — re-running only adds new names.
 */
export async function POST() {
  const rows = await db
    .select({ creditorName: transactions.creditorName })
    .from(transactions)
    .where(and(lt(transactions.amountCents, 0), isNotNull(transactions.creditorName)));

  const existing = new Set(
    (await db.select({ normalizedName: suppliers.normalizedName }).from(suppliers))
      .map((s) => (s.normalizedName ?? "").trim())
      .filter(Boolean),
  );

  const seen = new Set<string>();
  const toAdd: { name: string; normalizedName: string }[] = [];
  for (const r of rows) {
    const name = (r.creditorName ?? "").trim();
    if (!name) continue;
    const norm = name.toLowerCase();
    if (existing.has(norm) || seen.has(norm)) continue;
    seen.add(norm);
    toAdd.push({ name, normalizedName: norm });
  }

  if (toAdd.length) await db.insert(suppliers).values(toAdd);
  return NextResponse.json({ added: toAdd.length });
}
