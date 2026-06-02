import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { analyses, transactions } from "@/lib/db/schema";
import { applyOverlay } from "@/lib/subscription-overlay";

export const runtime = "nodejs";

type Sub = {
  name: string;
  merchant_strings?: string[];
  monthly_amount_eur: number;
  cadence?: "monthly" | "weekly" | "yearly" | "usage-based" | string;
  domain?: string;
  manual?: boolean;
};

/**
 * For each detected subscription, find its most recent matching transaction
 * and project the next charge date(s) within a 60-day horizon, based on the
 * cadence the LLM assigned.
 */
export async function GET() {
  const llmRows = await db
    .select()
    .from(analyses)
    .where(eq(analyses.kind, "llm"))
    .orderBy(desc(analyses.createdAt))
    .limit(1);

  const llmSubs: Sub[] =
    (llmRows[0]?.payload as { subscriptions?: Sub[] } | undefined)?.subscriptions ?? [];
  const subs = (await applyOverlay(llmSubs)) as Sub[];

  if (subs.length === 0) {
    return NextResponse.json({ upcoming: [], summary: { total_eur: 0, count: 0 } });
  }

  const txs = await db.select().from(transactions);

  const now = new Date();
  // Anchor "today" at start-of-day so a charge dated today still counts.
  now.setHours(0, 0, 0, 0);
  const horizonMs = now.getTime() + 60 * 86_400_000;

  type Upcoming = {
    date: string; // YYYY-MM-DD
    name: string;
    amount_eur: number;
    cadence: string;
    domain?: string;
  };
  const upcoming: Upcoming[] = [];

  for (const s of subs) {
    if (!s.cadence || s.cadence === "usage-based") continue;

    const needles = (s.merchant_strings ?? [s.name])
      .map((m) => m.toLowerCase())
      .filter(Boolean);
    if (needles.length === 0) continue;

    // Find the latest transaction whose creditor name OR memo contains any
    // of the merchant strings the LLM assigned to this subscription.
    let latestDate: string | null = null;
    for (const t of txs) {
      if (Number(t.amountCents) >= 0) continue; // outgoing only
      const haystack = `${(t.creditorName ?? "").toLowerCase()} ${(t.memo ?? "").toLowerCase()}`;
      if (!needles.some((n) => haystack.includes(n))) continue;
      const d = t.bookingDate ?? t.valueDate;
      if (!d) continue;
      if (!latestDate || d > latestDate) latestDate = d;
    }
    // Manual additions don't have transactions to anchor against — start the
    // projection at today so they still show up in the agenda.
    if (!latestDate) {
      if (!s.manual) continue;
      latestDate = new Date().toISOString().slice(0, 10);
    }

    const last = new Date(latestDate);
    const candidates: Date[] = [];

    if (s.cadence === "monthly") {
      for (let i = 1; i <= 3; i++) {
        const next = new Date(last);
        next.setMonth(next.getMonth() + i);
        candidates.push(next);
      }
    } else if (s.cadence === "weekly") {
      for (let i = 1; i <= 9; i++) {
        candidates.push(new Date(last.getTime() + i * 7 * 86_400_000));
      }
    } else if (s.cadence === "yearly") {
      const next = new Date(last);
      next.setFullYear(next.getFullYear() + 1);
      candidates.push(next);
    }

    for (const c of candidates) {
      const t = c.getTime();
      if (t < now.getTime() || t > horizonMs) continue;
      upcoming.push({
        date: c.toISOString().slice(0, 10),
        name: s.name,
        amount_eur: s.monthly_amount_eur,
        cadence: s.cadence,
        domain: s.domain,
      });
    }
  }

  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  const total = upcoming.reduce((sum, u) => sum + u.amount_eur, 0);

  return NextResponse.json({
    upcoming,
    summary: { total_eur: Math.round(total * 100) / 100, count: upcoming.length },
  });
}
