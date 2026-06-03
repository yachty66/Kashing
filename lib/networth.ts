/**
 * Net-worth math, shared between the GET route (read + snapshot) and any
 * place that needs the current totals. Net worth is a single signed sum:
 *
 *   net = Σ(bank balances) + Σ(manual assets) − Σ(manual liabilities)
 *
 * Bank balances can themselves be negative (an overdrawn or credit account),
 * in which case they simply pull the total down.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, manualEntries, netWorthSnapshots } from "@/lib/db/schema";

export type NetWorthTotals = {
  bankCents: number;
  manualAssetCents: number;
  liabilityCents: number;
  netCents: number;
};

export function currentYM(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export type AccountBalance = {
  id: number;
  name: string | null;
  iban: string | null;
  balanceCents: number | null;
  balanceUpdatedAt: string | null;
};

export type ManualEntry = {
  id: number;
  kind: string;
  name: string;
  valueCents: number;
  category: string | null;
};

export async function loadNetWorth(): Promise<{
  accounts: AccountBalance[];
  entries: ManualEntry[];
  totals: NetWorthTotals;
}> {
  const acctRows = await db
    .select({
      id: accounts.id,
      name: accounts.displayName,
      iban: accounts.iban,
      balanceCents: accounts.balanceCents,
      balanceUpdatedAt: accounts.balanceUpdatedAt,
    })
    .from(accounts);

  const entryRows = await db
    .select({
      id: manualEntries.id,
      kind: manualEntries.kind,
      name: manualEntries.name,
      valueCents: manualEntries.valueCents,
      category: manualEntries.category,
    })
    .from(manualEntries);

  const accountsOut: AccountBalance[] = acctRows.map((a) => ({
    id: a.id,
    name: a.name,
    iban: a.iban,
    balanceCents: a.balanceCents != null ? Number(a.balanceCents) : null,
    balanceUpdatedAt: a.balanceUpdatedAt ? a.balanceUpdatedAt.toISOString() : null,
  }));

  const entries: ManualEntry[] = entryRows.map((e) => ({
    id: e.id,
    kind: e.kind,
    name: e.name,
    valueCents: Number(e.valueCents),
    category: e.category,
  }));

  const bankCents = accountsOut.reduce((s, a) => s + (a.balanceCents ?? 0), 0);
  const manualAssetCents = entries
    .filter((e) => e.kind === "asset")
    .reduce((s, e) => s + e.valueCents, 0);
  const liabilityCents = entries
    .filter((e) => e.kind === "liability")
    .reduce((s, e) => s + e.valueCents, 0);
  const netCents = bankCents + manualAssetCents - liabilityCents;

  return {
    accounts: accountsOut,
    entries,
    totals: { bankCents, manualAssetCents, liabilityCents, netCents },
  };
}

/**
 * Upsert the current month's snapshot. Idempotent within a month: re-running
 * just overwrites the row, so the latest balances always win for the live
 * month while past months stay frozen.
 */
export async function upsertCurrentSnapshot(
  totals: NetWorthTotals,
  breakdown: unknown,
): Promise<void> {
  const ym = currentYM();
  await db
    .insert(netWorthSnapshots)
    .values({
      ym,
      bankCents: totals.bankCents,
      manualAssetCents: totals.manualAssetCents,
      liabilityCents: totals.liabilityCents,
      netCents: totals.netCents,
      breakdown: breakdown as object,
    })
    .onConflictDoUpdate({
      target: netWorthSnapshots.ym,
      set: {
        bankCents: totals.bankCents,
        manualAssetCents: totals.manualAssetCents,
        liabilityCents: totals.liabilityCents,
        netCents: totals.netCents,
        breakdown: breakdown as object,
        updatedAt: sql`now()`,
      },
    });
}
