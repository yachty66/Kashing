import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, transactions } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET() {
  // Join transactions with their account so we can show the account name in
  // the table. Sort newest-first by booking date (falling back to value date).
  const rows = await db
    .select({
      id: transactions.id,
      bookingDate: transactions.bookingDate,
      valueDate: transactions.valueDate,
      amountCents: transactions.amountCents,
      currency: transactions.currency,
      creditorName: transactions.creditorName,
      debtorName: transactions.debtorName,
      memo: transactions.memo,
      status: transactions.status,
      accountName: accounts.displayName,
      accountIban: accounts.iban,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.accountId, accounts.id));

  rows.sort((a, b) => {
    const da = a.bookingDate ?? a.valueDate ?? "";
    const db_ = b.bookingDate ?? b.valueDate ?? "";
    return db_.localeCompare(da);
  });

  return NextResponse.json({ transactions: rows, count: rows.length });
}
