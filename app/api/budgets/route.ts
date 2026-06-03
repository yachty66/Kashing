import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, budgets, transactions } from "@/lib/db/schema";
import { BUDGETABLE_CATEGORIES, type Category, ruleClassify } from "@/lib/categories";

export const runtime = "nodejs";

type TxRow = {
  bookingDate: string | null;
  valueDate: string | null;
  amountCents: number | string;
  creditorName: string | null;
  debtorName: string | null;
  memo: string | null;
};

function ymOf(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function txYM(t: TxRow): string | null {
  const d = t.bookingDate ?? t.valueDate;
  return d ? d.slice(0, 7) : null;
}

function isSpending(category: Category | null): category is Category {
  return category !== null && BUDGETABLE_CATEGORIES.includes(category);
}

/**
 * Returns: { thisMonth: "YYYY-MM", empty: bool, categories: [...] }
 * where each category row carries cap, spent-this-month, and a suggested
 * cap based on the median monthly spend over the last 3 completed months.
 */
export async function GET() {
  const acctCount = (await db.select().from(accounts)).length;
  if (acctCount === 0) {
    return NextResponse.json({ accounts: 0, empty: true });
  }

  const rows = (await db
    .select({
      bookingDate: transactions.bookingDate,
      valueDate: transactions.valueDate,
      amountCents: transactions.amountCents,
      creditorName: transactions.creditorName,
      debtorName: transactions.debtorName,
      memo: transactions.memo,
    })
    .from(transactions)) as TxRow[];

  const now = new Date();
  const thisYM = ymOf(now);
  const completedMonths: string[] = [];
  for (let i = 1; i <= 3; i++) {
    completedMonths.push(ymOf(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }

  // Spend per category per YM, in cents (absolute value of outgoing only).
  const spendByCatMonth = new Map<Category, Map<string, number>>();
  for (const t of rows) {
    const amt = Number(t.amountCents);
    if (amt >= 0) continue; // outgoing only
    const ym = txYM(t);
    if (!ym) continue;
    // Skip months we don't care about to keep the loop cheap.
    if (ym !== thisYM && !completedMonths.includes(ym)) continue;
    const cat = ruleClassify({ ...t, amountCents: amt }) ?? "Other";
    if (!isSpending(cat)) continue;
    const per = spendByCatMonth.get(cat) ?? new Map<string, number>();
    per.set(ym, (per.get(ym) ?? 0) + -amt);
    spendByCatMonth.set(cat, per);
  }

  const median = (xs: number[]): number => {
    if (xs.length === 0) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
  };
  const roundUpTo10 = (cents: number) => Math.ceil(cents / 1000) * 1000; // round to nearest 10 €

  const existing = await db.select().from(budgets);
  const capByCat = new Map<string, number>(existing.map((b) => [b.category, Number(b.monthlyCapCents)]));

  const out = BUDGETABLE_CATEGORIES.map((category) => {
    const monthMap = spendByCatMonth.get(category) ?? new Map<string, number>();
    const spentCents = monthMap.get(thisYM) ?? 0;
    const completedSpends = completedMonths.map((ym) => monthMap.get(ym) ?? 0);
    const hasAnyHistory = completedSpends.some((c) => c > 0);
    const suggestedCapCents = hasAnyHistory ? roundUpTo10(median(completedSpends.filter((c) => c > 0))) : 0;
    const capCents = capByCat.get(category) ?? null;
    return {
      category,
      capCents,
      spentCents,
      suggestedCapCents,
    };
  });

  return NextResponse.json({
    accounts: acctCount,
    empty: false,
    thisMonth: thisYM,
    categories: out,
  });
}

/** PUT body: { category: string, monthlyCapCents: number }. Upserts. */
export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    category?: string;
    monthlyCapCents?: number;
  } | null;
  if (!body?.category || typeof body.monthlyCapCents !== "number" || body.monthlyCapCents < 0) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!BUDGETABLE_CATEGORIES.includes(body.category as Category)) {
    return NextResponse.json({ error: "Unknown category" }, { status: 400 });
  }
  const cap = Math.round(body.monthlyCapCents);
  await db
    .insert(budgets)
    .values({ category: body.category, monthlyCapCents: cap })
    .onConflictDoUpdate({
      target: budgets.category,
      set: { monthlyCapCents: cap, updatedAt: sql`now()` },
    });
  return NextResponse.json({ ok: true });
}

/** DELETE ?category=Groceries — removes the cap. */
export async function DELETE(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category");
  if (!category) return NextResponse.json({ error: "Missing category" }, { status: 400 });
  await db.delete(budgets).where(eq(budgets.category, category));
  return NextResponse.json({ ok: true });
}
