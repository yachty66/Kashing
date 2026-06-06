import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers, invoices } from "@/lib/db/schema";
import { buildPaymentRequest } from "@/lib/payment-request";
import { invoiceQrMediaUrl } from "@/lib/agent/channel";
import { twilioChannel } from "@/lib/twilio";
import { money } from "@/lib/money";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Send an invoice to its customer over WhatsApp (Twilio) with the FPS QR +
 * pay details attached. Requires a phone on the customer record.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const invoiceId = Number(id);
  if (!Number.isFinite(invoiceId)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  let phone: string | null = null;
  if (inv.customerId) {
    const [c] = await db.select().from(customers).where(eq(customers.id, inv.customerId)).limit(1);
    phone = c?.phone ?? null;
  }
  if (!phone) {
    return NextResponse.json({ error: "No WhatsApp number on file for this customer — add a phone on the customer record." }, { status: 400 });
  }

  const outstanding = Number(inv.totalCents) - Number(inv.amountPaidCents);
  const amount = outstanding > 0 ? outstanding : Number(inv.totalCents);
  const pr = await buildPaymentRequest({ amount: amount / 100, reference: inv.number });
  const msg = `Invoice ${inv.number} — ${money(amount, inv.currency)}${inv.dueDate ? ` due ${inv.dueDate}` : ""}. Pay instantly:\n${pr.copyText}`;

  try {
    await twilioChannel().send(phone, msg, [invoiceQrMediaUrl(inv.id)]);
  } catch (e) {
    return NextResponse.json({ error: `Send failed: ${e}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, to: inv.customerName ?? phone });
}
