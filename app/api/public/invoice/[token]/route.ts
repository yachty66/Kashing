import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessProfile, customers, invoiceLines, invoices } from "@/lib/db/schema";

export const runtime = "nodejs";

/** Read-only invoice view backing the shareable /invoice/[token] page. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token) return NextResponse.json({ error: "invalid token" }, { status: 400 });

  const [invoice] = await db.select().from(invoices).where(eq(invoices.publicToken, token));
  if (!invoice || invoice.status === "void") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoice.id))
    .orderBy(asc(invoiceLines.sortOrder));
  const [profile] = await db.select().from(businessProfile).limit(1);
  const customer = invoice.customerId
    ? (await db.select().from(customers).where(eq(customers.id, invoice.customerId)))[0] ?? null
    : null;

  return NextResponse.json({ invoice, lines, profile: profile ?? null, customer });
}
