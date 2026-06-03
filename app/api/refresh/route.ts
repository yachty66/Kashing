import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, analyses, transactions } from "@/lib/db/schema";
import { getAccountBalance, listTransactions } from "@/lib/gocardless";
import { detectHeuristic, detectLLM, writeBrief, type Tx } from "@/lib/detect";

export const runtime = "nodejs";
export const maxDuration = 300; // generous; LLM passes can take a while

export async function POST() {
  const accts = await db.select().from(accounts);
  if (accts.length === 0) {
    return NextResponse.json({ error: "no_accounts" }, { status: 400 });
  }

  const errors: string[] = [];

  // Pull + persist every account's transactions; skip ones that error out
  // (Spaces / sub-accounts often 4xx; we don't want the whole job to die).
  for (const acct of accts) {
    let tx;
    try {
      tx = await listTransactions(acct.gocardlessId);
    } catch (e) {
      const label = acct.displayName ?? acct.iban ?? acct.gocardlessId;
      errors.push(`${label}: ${e}`);
      continue;
    }
    const rows = [
      ...tx.booked.map((r) => ({ raw: r, status: "booked" as const })),
      ...tx.pending.map((r) => ({ raw: r, status: "pending" as const })),
    ];
    for (const { raw, status } of rows) {
      const gid = raw.transactionId ?? raw.internalTransactionId ?? null;
      if (gid) {
        const exists = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(eq(transactions.gocardlessId, gid))
          .limit(1);
        if (exists.length > 0) continue;
      }
      const amount = raw.transactionAmount?.amount ?? "0";
      const cents = Math.round(parseFloat(amount) * 100);
      const memo =
        raw.remittanceInformationUnstructured ??
        (raw.remittanceInformationUnstructuredArray ?? []).join(" ") ??
        null;
      await db.insert(transactions).values({
        accountId: acct.id,
        gocardlessId: gid ?? null,
        bookingDate: raw.bookingDate ?? null,
        valueDate: raw.valueDate ?? null,
        amountCents: cents,
        currency: raw.transactionAmount?.currency ?? "EUR",
        creditorName: raw.creditorName ?? null,
        debtorName: raw.debtorName ?? null,
        memo: memo || null,
        status,
        raw: raw as unknown as object,
      });
    }
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

  // Heuristic pass (cheap, deterministic) — store it for history
  const heuristic = detectHeuristic(txs);
  await db.insert(analyses).values({ kind: "heuristic", payload: heuristic });

  let llm;
  try {
    llm = await detectLLM(txs);
  } catch (e) {
    return NextResponse.json(
      { error: "llm_failed", detail: String(e), account_errors: errors },
      { status: 502 },
    );
  }
  await db.insert(analyses).values({ kind: "llm", payload: llm });

  let brief = "";
  try {
    brief = await writeBrief(llm);
  } catch (e) {
    // Brief failure shouldn't sink the whole response
    console.warn("brief failed", e);
  }
  await db.insert(analyses).values({ kind: "brief", payload: { text: brief } });

  // Categorize transactions in the same flow. Best-effort — if it fails,
  // surface a warning but don't lose the analysis we just generated.
  let categorized: { categorized: number; llm_calls: number } | null = null;
  try {
    const r = await fetch(
      `${(process.env.PUBLIC_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "")}/api/categorize`,
      { method: "POST" },
    );
    if (r.ok) categorized = await r.json();
  } catch (e) {
    console.warn("categorize step failed", e);
  }

  return NextResponse.json({
    ok: true,
    analysis: llm,
    brief,
    transactions: allTxRows.length,
    account_errors: errors,
    categorized,
  });
}
