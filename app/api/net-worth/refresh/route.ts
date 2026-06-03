import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { getAccountBalance } from "@/lib/gocardless";
import { loadNetWorth, upsertCurrentSnapshot } from "@/lib/networth";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Pull live balances from GoCardless for every connected account and cache
 * them on the account rows, then re-stamp the current month's snapshot.
 * Best-effort per account — Spaces / sub-accounts and rate-limited accounts
 * 4xx; we skip those and keep the previously cached balance.
 */
export async function POST() {
  const accts = await db.select().from(accounts);
  if (accts.length === 0) {
    return NextResponse.json({ error: "no_accounts" }, { status: 400 });
  }

  const errors: string[] = [];
  let updated = 0;
  for (const acct of accts) {
    try {
      const bal = await getAccountBalance(acct.gocardlessId);
      if (bal) {
        await db
          .update(accounts)
          .set({ balanceCents: bal.cents, balanceUpdatedAt: new Date() })
          .where(eq(accounts.id, acct.id));
        updated++;
      }
    } catch (e) {
      const label = acct.displayName ?? acct.iban ?? acct.gocardlessId;
      errors.push(`${label}: ${e}`);
    }
  }

  const { accounts: accountsOut, entries, totals } = await loadNetWorth();
  await upsertCurrentSnapshot(totals, {
    accounts: accountsOut.map((a) => ({ id: a.id, name: a.name, balanceCents: a.balanceCents })),
    entries: entries.map((e) => ({ kind: e.kind, name: e.name, valueCents: e.valueCents })),
  });

  return NextResponse.json({ ok: true, updated, account_errors: errors });
}
