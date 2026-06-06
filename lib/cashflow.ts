import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, bills, expenses, invoices } from "@/lib/db/schema";

/**
 * Simple 4-week cash-flow forecast: starting cash (cached bank balances) plus,
 * week by week, expected inbound (open invoices by due date) minus expected
 * outbound (unpaid bills by due date + approved-but-unreimbursed expenses).
 * Expenses with no date and undated bills land in week 0 (treat as imminent).
 */
export type CashflowWeek = {
  label: string; // 'YYYY-MM-DD' week start
  inCents: number;
  outCents: number;
  netCents: number;
  runningCents: number;
};
export type Cashflow = {
  currentCashCents: number;
  weeks: CashflowWeek[];
};

function weekIndex(dateISO: string | null, today: Date): number {
  if (!dateISO) return 0;
  const d = Date.parse(dateISO);
  if (Number.isNaN(d)) return 0;
  const diffDays = Math.floor((d - today.getTime()) / 86_400_000);
  if (diffDays < 0) return 0; // overdue / due now → week 0
  return Math.min(3, Math.floor(diffDays / 7));
}

export async function forecastCashflow(): Promise<Cashflow> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const accts = await db.select({ balanceCents: accounts.balanceCents }).from(accounts);
  const currentCashCents = accts.reduce((s, a) => s + (a.balanceCents ?? 0), 0);

  const inWeeks = [0, 0, 0, 0];
  const outWeeks = [0, 0, 0, 0];

  // Inbound: outstanding on open invoices.
  const openInv = await db.select().from(invoices).where(inArray(invoices.status, ["sent", "partly_paid"]));
  for (const inv of openInv) {
    const outstanding = Number(inv.totalCents) - Number(inv.amountPaidCents);
    if (outstanding > 0) inWeeks[weekIndex(inv.dueDate, today)] += outstanding;
  }

  // Outbound: unpaid supplier bills (by due date).
  const unpaidBills = await db.select().from(bills).where(eq(bills.status, "unpaid"));
  for (const b of unpaidBills) outWeeks[weekIndex(b.dueDate, today)] += Number(b.amountCents);

  // Outbound: approved expenses not yet reimbursed (imminent → week 0).
  const owed = await db.select().from(expenses).where(eq(expenses.status, "approved"));
  for (const e of owed) outWeeks[0] += e.amountCents ?? 0;

  let running = currentCashCents;
  const weeks: CashflowWeek[] = [];
  for (let i = 0; i < 4; i++) {
    const start = new Date(today);
    start.setDate(today.getDate() + i * 7);
    const net = inWeeks[i] - outWeeks[i];
    running += net;
    weeks.push({
      label: start.toISOString().slice(0, 10),
      inCents: inWeeks[i],
      outCents: outWeeks[i],
      netCents: net,
      runningCents: running,
    });
  }
  return { currentCashCents, weeks };
}
