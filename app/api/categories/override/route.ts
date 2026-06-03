import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { merchantCategories, transactions } from "@/lib/db/schema";
import { CATEGORIES, type Category, merchantKey } from "@/lib/categories";

export const runtime = "nodejs";

/**
 * Override a merchant's category. Writes to merchant_categories with
 * source='user' and cascades the new category onto every existing
 * transaction that resolves to the same merchant key.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { key?: string; category?: string };
  if (!body.key) return NextResponse.json({ error: "key required" }, { status: 400 });
  if (!body.category || !CATEGORIES.includes(body.category as Category)) {
    return NextResponse.json({ error: "invalid category" }, { status: 400 });
  }
  const key = body.key.toLowerCase().trim();
  const category = body.category as Category;

  await db
    .insert(merchantCategories)
    .values({ key, category, source: "user", updatedAt: new Date() })
    .onConflictDoUpdate({
      target: merchantCategories.key,
      set: { category, source: "user", updatedAt: new Date() },
    });

  // Cascade onto matching transactions. We re-evaluate merchantKey() per row
  // since the column doesn't exist; do it in JS for correctness.
  const candidates = await db
    .select({
      id: transactions.id,
      creditorName: transactions.creditorName,
      debtorName: transactions.debtorName,
      memo: transactions.memo,
      amountCents: transactions.amountCents,
    })
    .from(transactions);

  let updated = 0;
  for (const c of candidates) {
    if (merchantKey(c) === key) {
      await db.update(transactions).set({ category }).where(eq(transactions.id, c.id));
      updated++;
    }
  }

  return NextResponse.json({ ok: true, updated });
}
