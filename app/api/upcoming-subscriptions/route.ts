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

  const payload = llmRows[0]?.payload as
    | { subscriptions?: Sub[]; recurring_obligations?: { name: string; monthly_amount_eur: number; type?: string }[] }
    | undefined;
  const llmSubs: Sub[] = payload?.subscriptions ?? [];
  const obligations = payload?.recurring_obligations ?? [];

  // Subscriptions go through the user-override overlay; obligations don't (yet).
  // We treat both as monthly-cadence recurring charges for projection.
  const subs = (await applyOverlay(llmSubs)) as Sub[];
  const allContracts: Sub[] = [
    ...subs,
    ...obligations.map((o) => ({
      name: o.name,
      monthly_amount_eur: o.monthly_amount_eur,
      cadence: "monthly" as const,
      // obligations have no merchant_strings from the LLM; we'll fuzzy-match
      // by the obligation's name keywords against transactions.
    })),
  ];

  if (allContracts.length === 0) {
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

  for (const s of allContracts) {
    if (!s.cadence || s.cadence === "usage-based") continue;

    // For subs we have explicit merchant_strings; for obligations we fall
    // back to keywords pulled from the obligation's display name.
    const baseNeedles = s.merchant_strings && s.merchant_strings.length > 0
      ? s.merchant_strings
      : nameToNeedles(s.name);
    const needles = baseNeedles.map((m) => m.toLowerCase()).filter(Boolean);
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

    // Roll the cadence forward from the last seen charge until it reaches
    // today, then collect every occurrence inside the horizon. This keeps
    // projections correct even when the latest matching transaction is old
    // (e.g. a gap in the data), instead of projecting into the past.
    const stepMonths = s.cadence === "monthly" ? 1 : s.cadence === "yearly" ? 12 : 0;
    if (stepMonths > 0) {
      const next = new Date(last);
      while (next.getTime() < now.getTime()) next.setMonth(next.getMonth() + stepMonths);
      while (next.getTime() <= horizonMs) {
        candidates.push(new Date(next));
        next.setMonth(next.getMonth() + stepMonths);
      }
    } else if (s.cadence === "weekly") {
      const next = new Date(last);
      while (next.getTime() < now.getTime()) next.setTime(next.getTime() + 7 * 86_400_000);
      while (next.getTime() <= horizonMs) {
        candidates.push(new Date(next));
        next.setTime(next.getTime() + 7 * 86_400_000);
      }
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

/**
 * For obligations the LLM gives a name like "Rent (Mikhail Ushakov)" or
 * "AOK Plus Health Insurance" — pick out the words most likely to appear in
 * transaction memos / creditor names. Strip parens, common filler words,
 * and short tokens.
 */
function nameToNeedles(name: string): string[] {
  const STOPWORDS = new Set([
    "the", "and", "of", "for", "to", "in", "monthly", "yearly",
    "premium", "subscription", "membership", "service", "services",
    "plan", "plans", "fee", "fees", "insurance", "health", "rent",
    "loan", "repayment", "card",
  ]);
  const cleaned = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ") // drop parenthetical context
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
  const tokens = cleaned.split(/\s+/).filter((t) => t.length > 2 && !STOPWORDS.has(t));
  return tokens.length > 0 ? tokens : [cleaned.trim()];
}
