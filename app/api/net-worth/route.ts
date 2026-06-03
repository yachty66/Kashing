import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { netWorthSnapshots } from "@/lib/db/schema";
import { loadNetWorth, upsertCurrentSnapshot } from "@/lib/networth";

export const runtime = "nodejs";

/**
 * Full net-worth payload for the page: connected-account balances (cached),
 * manual assets & liabilities, current totals, and the monthly snapshot
 * series for the chart. Loading the page also stamps the current month's
 * snapshot so the chart gains a point even before the first manual refresh.
 */
export async function GET() {
  const { accounts, entries, totals } = await loadNetWorth();

  const hasData = accounts.length > 0 || entries.length > 0;
  if (hasData) {
    await upsertCurrentSnapshot(totals, {
      accounts: accounts.map((a) => ({ id: a.id, name: a.name, balanceCents: a.balanceCents })),
      entries: entries.map((e) => ({ kind: e.kind, name: e.name, valueCents: e.valueCents })),
    });
  }

  const snaps = await db
    .select({
      ym: netWorthSnapshots.ym,
      bankCents: netWorthSnapshots.bankCents,
      manualAssetCents: netWorthSnapshots.manualAssetCents,
      liabilityCents: netWorthSnapshots.liabilityCents,
      netCents: netWorthSnapshots.netCents,
    })
    .from(netWorthSnapshots)
    .orderBy(asc(netWorthSnapshots.ym));

  return NextResponse.json({
    empty: !hasData,
    accounts,
    assets: entries.filter((e) => e.kind === "asset"),
    liabilities: entries.filter((e) => e.kind === "liability"),
    totals,
    snapshots: snaps.map((s) => ({
      ym: s.ym,
      bankCents: Number(s.bankCents),
      manualAssetCents: Number(s.manualAssetCents),
      liabilityCents: Number(s.liabilityCents),
      netCents: Number(s.netCents),
    })),
  });
}
