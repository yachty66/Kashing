import { NextResponse } from "next/server";
import { autoReconcileExpenses, autoReconcileTransactions } from "@/lib/reconcile";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Run reconciliation only (no bank pull, no LLM) — fast, for a "reconcile now"
 * demo button. Tier-1 matches incoming credits to invoices and reimbursement
 * debits to claims, and pings the manager on auto-settled invoices.
 */
export async function POST() {
  try {
    const invoices = await autoReconcileTransactions();
    const expenses = await autoReconcileExpenses();
    return NextResponse.json({ invoices_reconciled: invoices.length, invoices, expenses_reconciled: expenses.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
