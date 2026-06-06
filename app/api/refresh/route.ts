import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, analyses, finverseIdentities, transactions } from "@/lib/db/schema";
import { getAccountBalance, listTransactions } from "@/lib/gocardless";
import {
  listTransactions as fvListTransactions,
  normalizeAmountCents as fvNormalizeAmountCents,
  type FinverseTransaction,
} from "@/lib/finverse";
import { detectHeuristic, detectLLM, writeBrief, type Tx } from "@/lib/detect";
import { autoReconcileExpenses, autoReconcileTransactions } from "@/lib/reconcile";

export const runtime = "nodejs";
export const maxDuration = 300; // generous; LLM passes can take a while

export async function POST() {
  const accts = await db.select().from(accounts);
  if (accts.length === 0) {
    return NextResponse.json({ error: "no_accounts" }, { status: 400 });
  }

  const errors: string[] = [];

  // Finverse returns transactions per login identity (covering all of its
  // accounts at once), so pre-fetch each identity's transactions and token
  // once rather than per account.
  const fvAcctRows = accts.filter((a) => a.provider === "finverse");
  const fvTxByIdentity = new Map<number, FinverseTransaction[]>();
  if (fvAcctRows.length > 0) {
    const identityIds = [
      ...new Set(fvAcctRows.map((a) => a.finverseIdentityId).filter((x): x is number => x != null)),
    ];
    for (const idid of identityIds) {
      const idRow = (
        await db.select().from(finverseIdentities).where(eq(finverseIdentities.id, idid)).limit(1)
      )[0];
      if (!idRow?.accessToken) {
        errors.push(`finverse identity ${idid}: no access token (reconnect needed)`);
        continue;
      }
      if (idRow.tokenExpiresAt && idRow.tokenExpiresAt.getTime() < Date.now()) {
        errors.push(`finverse identity ${idid}: token expired (reconnect needed)`);
        continue;
      }
      try {
        fvTxByIdentity.set(idid, await fvListTransactions(idRow.accessToken));
      } catch (e) {
        errors.push(`finverse identity ${idid}: ${e}`);
      }
    }
  }

  // Pull + persist every account's transactions in parallel. Each account
  // does a single bulk insert with ON CONFLICT DO NOTHING (deduped by the
  // uniq_account_tx index), instead of a per-transaction exists-check + insert.
  // Accounts that error out are skipped so one bad account can't sink the job.
  type NewTx = typeof transactions.$inferInsert;

  await Promise.all(
    accts.map(async (acct) => {
      // ---- Finverse (HK/Asia) ----
      if (acct.provider === "finverse") {
        const idid = acct.finverseIdentityId;
        const all = idid != null ? fvTxByIdentity.get(idid) ?? [] : [];
        const mine = all.filter((t) => t.account_id === acct.gocardlessId);
        const values: NewTx[] = mine.map((t) => ({
          accountId: acct.id,
          gocardlessId: t.transaction_id ?? null,
          bookingDate: t.posted_date ?? null,
          valueDate: t.posted_date ?? null,
          amountCents: fvNormalizeAmountCents(t),
          currency: t.amount?.currency ?? "HKD",
          creditorName: t.description ?? null,
          debtorName: null,
          memo: t.description ?? null,
          status: t.is_pending ? "pending" : "booked",
          raw: t as unknown as object,
        }));
        if (values.length) await db.insert(transactions).values(values).onConflictDoNothing();
        await db.update(accounts).set({ lastPullAt: new Date() }).where(eq(accounts.id, acct.id));
        return;
      }

      // ---- GoCardless (EU/UK, default) ----
      let tx;
      try {
        tx = await listTransactions(acct.gocardlessId);
      } catch (e) {
        const label = acct.displayName ?? acct.iban ?? acct.gocardlessId;
        errors.push(`${label}: ${e}`);
        return;
      }
      const rows = [
        ...tx.booked.map((r) => ({ raw: r, status: "booked" as const })),
        ...tx.pending.map((r) => ({ raw: r, status: "pending" as const })),
      ];
      const values: NewTx[] = rows.map(({ raw, status }) => {
        const cents = Math.round(parseFloat(raw.transactionAmount?.amount ?? "0") * 100);
        const memo =
          raw.remittanceInformationUnstructured ??
          (raw.remittanceInformationUnstructuredArray ?? []).join(" ") ??
          null;
        return {
          accountId: acct.id,
          gocardlessId: raw.transactionId ?? raw.internalTransactionId ?? null,
          bookingDate: raw.bookingDate ?? null,
          valueDate: raw.valueDate ?? null,
          amountCents: cents,
          currency: raw.transactionAmount?.currency ?? "EUR",
          creditorName: raw.creditorName ?? null,
          debtorName: raw.debtorName ?? null,
          memo: memo || null,
          status,
          raw: raw as unknown as object,
        };
      });
      if (values.length) await db.insert(transactions).values(values).onConflictDoNothing();

      // Cache the live balance too (best-effort) so the Net worth page has
      // fresh numbers without its own GoCardless round-trip.
      let balanceCents: number | null = null;
      try {
        const bal = await getAccountBalance(acct.gocardlessId);
        if (bal) balanceCents = bal.cents;
      } catch {
        // ignore — keep the previously cached balance
      }
      await db
        .update(accounts)
        .set({
          lastPullAt: new Date(),
          ...(balanceCents != null ? { balanceCents, balanceUpdatedAt: new Date() } : {}),
        })
        .where(eq(accounts.id, acct.id));
    }),
  );

  // Auto-reconcile incoming credits against open invoices (tier-1: invoice
  // number in memo + exact outstanding amount). Best-effort.
  let reconciledCount = 0;
  try {
    reconciledCount = (await autoReconcileTransactions()).length;
    await autoReconcileExpenses();
  } catch (e) {
    console.warn("auto-reconcile failed", e);
  }

  // Load every transaction for analysis
  const allTxRows = await db.select().from(transactions);
  if (allTxRows.length === 0) {
    return NextResponse.json(
      { error: "no_transactions", account_errors: errors },
      { status: 502 },
    );
  }
  const txs: Tx[] = allTxRows.map((t) => ({
    amountCents: Number(t.amountCents),
    bookingDate: t.bookingDate,
    valueDate: t.valueDate,
    creditorName: t.creditorName,
    memo: t.memo,
  }));

  // Heuristic pass (cheap, deterministic) — store it for history. Kick off the
  // insert without blocking the LLM work below.
  const heuristic = detectHeuristic(txs);
  const heuristicInsert = db.insert(analyses).values({ kind: "heuristic", payload: heuristic });

  // Detection (detect -> brief) and categorization are independent, so run
  // them concurrently. Wall time becomes the max of the two, not the sum.
  const detectBranch = (async () => {
    const llm = await detectLLM(txs);
    await db.insert(analyses).values({ kind: "llm", payload: llm });
    let brief = "";
    try {
      brief = await writeBrief(llm);
    } catch (e) {
      // Brief failure shouldn't sink the whole response
      console.warn("brief failed", e);
    }
    await db.insert(analyses).values({ kind: "brief", payload: { text: brief } });
    return { llm, brief };
  })();

  // Categorize transactions in the same flow. Best-effort.
  const categorizeBranch = (async () => {
    try {
      const r = await fetch(
        `${(process.env.PUBLIC_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api/categorize`,
        { method: "POST" },
      );
      if (r.ok) return (await r.json()) as { categorized: number; llm_calls: number };
    } catch (e) {
      console.warn("categorize step failed", e);
    }
    return null;
  })();

  let llm, brief;
  try {
    ({ llm, brief } = await detectBranch);
  } catch (e) {
    await categorizeBranch.catch(() => {}); // don't leave it dangling
    return NextResponse.json(
      { error: "llm_failed", detail: String(e), account_errors: errors },
      { status: 502 },
    );
  }
  const categorized = await categorizeBranch;
  await heuristicInsert;

  return NextResponse.json({
    ok: true,
    analysis: llm,
    brief,
    transactions: allTxRows.length,
    reconciled: reconciledCount,
    account_errors: errors,
    categorized,
  });
}
