import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses, users } from "@/lib/db/schema";

export const runtime = "nodejs";

/** All expense claims with the submitting employee's name (for the audit vault). */
export async function GET() {
  const rows = await db
    .select({
      id: expenses.id,
      employee: users.name,
      amountCents: expenses.amountCents,
      currency: expenses.currency,
      merchant: expenses.merchant,
      brNumber: expenses.brNumber,
      category: expenses.category,
      expenseDate: expenses.expenseDate,
      receiptUrl: expenses.receiptUrl,
      paymentType: expenses.paymentType,
      status: expenses.status,
      reimbursementTxId: expenses.reimbursementTxId,
      createdAt: expenses.createdAt,
    })
    .from(expenses)
    .leftJoin(users, eq(expenses.submittedBy, users.id))
    .orderBy(desc(expenses.createdAt));
  return NextResponse.json({ expenses: rows });
}
