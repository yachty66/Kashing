import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses, users } from "@/lib/db/schema";
import { getManager } from "@/lib/users";
import { paymentRail } from "@/lib/payment-rail";

export const runtime = "nodejs";

/** POST { action: "approve" | "reject" | "reimburse" } on one expense claim. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const expenseId = Number(id);
  if (!Number.isFinite(expenseId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const action = body?.action;

  const [exp] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!exp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "approve" || action === "reject") {
    const mgr = await getManager();
    await db
      .update(expenses)
      .set({ status: action === "approve" ? "approved" : "rejected", approvedBy: mgr?.id ?? null })
      .where(eq(expenses.id, expenseId));
    return NextResponse.json({ ok: true });
  }

  if (action === "reimburse") {
    if (exp.status !== "approved") return NextResponse.json({ error: "Only approved expenses can be reimbursed" }, { status: 400 });
    if (exp.amountCents == null) return NextResponse.json({ error: "Expense has no amount" }, { status: 400 });
    const [emp] = await db.select().from(users).where(eq(users.id, exp.submittedBy)).limit(1);
    const res = await paymentRail().payout({
      amountCents: exp.amountCents,
      currency: exp.currency,
      toProxyType: "mobile",
      toProxyId: emp?.phone ?? null,
      reference: `EXP-${exp.id}`,
      payeeName: emp?.name ?? null,
    });
    if (!res.ok) return NextResponse.json({ error: "Payout failed" }, { status: 500 });
    await db.update(expenses).set({ status: "reimbursed", reimbursedAt: new Date() }).where(eq(expenses.id, expenseId));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
