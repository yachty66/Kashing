import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transactions } from "@/lib/db/schema";
import { CATEGORIES } from "@/lib/categories";

export const runtime = "nodejs";

/**
 * Returns spending aggregates by category for the last 6 months.
 * Income / Transfers / Loans & Fees are returned too, but the UI can
 * filter or visually separate them since they're not "spending."
 */
export async function GET() {
  const rows = await db
    .select({
      bookingDate: transactions.bookingDate,
      valueDate: transactions.valueDate,
      amountCents: transactions.amountCents,
      category: transactions.category,
    })
    .from(transactions);

  const now = new Date();
  const months: string[] = []; // YYYY-MM, current first then 5 back
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const monthSet = new Set(months);

  // category → ym → cents
  const grid = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const d = r.bookingDate ?? r.valueDate;
    if (!d) continue;
    const ym = d.slice(0, 7);
    if (!monthSet.has(ym)) continue;
    const cat = r.category ?? "Other";
    const amt = Number(r.amountCents);
    // For spending categories we track outgoing (abs amount). Income/Transfers
    // we track signed so the UI can show "earned" or "moved."
    const isSpend =
      cat !== "Income" && cat !== "Transfers" && cat !== "Loans & Fees";
    const contribution = isSpend ? (amt < 0 ? -amt : 0) : Math.abs(amt);
    if (contribution === 0) continue;

    if (!grid.has(cat)) grid.set(cat, new Map());
    const inner = grid.get(cat)!;
    inner.set(ym, (inner.get(ym) ?? 0) + contribution);
  }

  // Build response: every known category, even if currently empty
  const all = [...new Set([...CATEGORIES, ...grid.keys()])];
  const categories = all.map((name) => {
    const byMonth: Record<string, number> = {};
    for (const m of months) byMonth[m] = grid.get(name)?.get(m) ?? 0;
    const total6mo = months.reduce((s, m) => s + byMonth[m], 0);
    return { name, monthly_cents: byMonth, total_6mo_cents: total6mo };
  });

  // Sort by current-month spend desc (the month-0 entry)
  categories.sort((a, b) => (b.monthly_cents[months[0]] ?? 0) - (a.monthly_cents[months[0]] ?? 0));

  const uncategorizedCount = rows.filter((r) => !r.category).length;

  return NextResponse.json({
    months,
    categories,
    uncategorized_count: uncategorizedCount,
  });
}
