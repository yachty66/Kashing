import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, analyses, transactions } from "@/lib/db/schema";
import { applyOverlay } from "@/lib/subscription-overlay";
import { getAccountBalance } from "@/lib/gocardless";
import {
  buildEvents,
  detectRecurringIncome,
  discretionaryDailyCents,
  type RecurringIncome,
} from "@/lib/forecast";
import type { Tx } from "@/lib/detect";

export const runtime = "nodejs";
export const maxDuration = 60;

type Sub = {
  name: string;
  merchant_strings?: string[];
  monthly_amount_eur: number;
  cadence?: string;
  domain?: string;
  manual?: boolean;
};

/**
 * GET /api/forecast?days=30[&balance=1234.56][&refresh=1]
 *
 * Returns the raw ingredients for a day-by-day balance projection. The client
 * assembles the actual line (and folds in any what-if hypotheticals) so that
 * toggling a scenario is instant and never round-trips.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.min(180, Math.max(7, Number(url.searchParams.get("days")) || 30));
  const balanceOverride = url.searchParams.get("balance");
  const wantRefresh = url.searchParams.get("refresh") === "1";

  const accts = await db.select().from(accounts);
  if (accts.length === 0) {
    return NextResponse.json({ accounts: 0, empty: true });
  }

  const allTxRows = await db.select().from(transactions);
  if (allTxRows.length === 0) {
    return NextResponse.json({ accounts: accts.length, empty: true });
  }
  const txs: Tx[] = allTxRows.map((t) => ({
    amountCents: Number(t.amountCents),
    bookingDate: t.bookingDate,
    valueDate: t.valueDate,
    creditorName: t.creditorName,
    memo: t.memo,
  }));

  // ----- starting balance -----
  // Priority: explicit manual override → live/cached GoCardless balance.
  let startCents: number | null = null;
  let balanceSource: "manual" | "live" | "cached" | "unknown" = "unknown";
  let balanceUpdatedAt: string | null = null;

  if (balanceOverride !== null && balanceOverride !== "") {
    const v = parseFloat(balanceOverride);
    if (Number.isFinite(v)) {
      startCents = Math.round(v * 100);
      balanceSource = "manual";
    }
  }

  if (startCents === null) {
    const cachedTotal = accts.reduce((sum, a) => sum + (a.balanceCents ?? 0), 0);
    const haveCached = accts.some((a) => a.balanceCents != null);
    const needsLive = wantRefresh || !haveCached;

    if (needsLive) {
      let any = false;
      for (const a of accts) {
        try {
          const bal = await getAccountBalance(a.gocardlessId);
          if (bal) {
            await db
              .update(accounts)
              .set({ balanceCents: bal.cents, balanceUpdatedAt: new Date() })
              .where(eq(accounts.id, a.id));
            any = true;
          }
        } catch {
          // Rate-limited or sub-account 4xx — fall through to cached.
        }
      }
      if (any) {
        const refreshed = await db.select().from(accounts);
        startCents = refreshed.reduce((sum, a) => sum + (a.balanceCents ?? 0), 0);
        balanceSource = "live";
        balanceUpdatedAt =
          refreshed
            .map((a) => a.balanceUpdatedAt)
            .filter((d): d is Date => d != null)
            .sort((x, y) => y.getTime() - x.getTime())[0]
            ?.toISOString() ?? null;
      }
    }

    if (startCents === null && haveCached) {
      startCents = cachedTotal;
      balanceSource = "cached";
      balanceUpdatedAt =
        accts
          .map((a) => a.balanceUpdatedAt)
          .filter((d): d is Date => d != null)
          .sort((x, y) => y.getTime() - x.getTime())[0]
          ?.toISOString() ?? null;
    }
  }

  // ----- recurring streams -----
  const llmRows = await db
    .select()
    .from(analyses)
    .where(eq(analyses.kind, "llm"))
    .orderBy(desc(analyses.createdAt))
    .limit(1);
  const llmSubs: Sub[] =
    (llmRows[0]?.payload as { subscriptions?: Sub[] } | undefined)?.subscriptions ?? [];
  const subs = (await applyOverlay(llmSubs)) as Sub[];

  const incomes: RecurringIncome[] = detectRecurringIncome(txs);

  const todayISO = new Date().toISOString().slice(0, 10);
  const events = buildEvents(subs, incomes, txs, todayISO, days);

  const recurringMonthlyEur = subs
    .filter((s) => s.cadence === "monthly")
    .reduce((acc, s) => acc + s.monthly_amount_eur, 0);
  const dailyBurn = discretionaryDailyCents(txs, recurringMonthlyEur);

  const incomeTotal = events
    .filter((e) => e.kind === "income")
    .reduce((s, e) => s + e.amount_cents, 0);
  const outgoingTotal = events
    .filter((e) => e.kind === "subscription")
    .reduce((s, e) => s + e.amount_cents, 0); // negative

  return NextResponse.json({
    empty: false,
    accounts: accts.length,
    today: todayISO,
    horizon_days: days,
    starting_balance_cents: startCents,
    balance_source: balanceSource,
    balance_updated_at: balanceUpdatedAt,
    daily_burn_cents: dailyBurn,
    events,
    incomes,
    summary: {
      recurring_income_cents: incomeTotal,
      recurring_outgoing_cents: outgoingTotal,
      discretionary_over_horizon_cents: dailyBurn * days,
      income_streams: incomes.length,
      subscription_count: subs.filter((s) => s.cadence && s.cadence !== "usage-based").length,
    },
  });
}
