import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { buildPaymentRequest } from "@/lib/payment-request";
import { qrPng } from "@/lib/fps-qr";

export const runtime = "nodejs";

/**
 * Static FPS QR for an invoice. Amount = outstanding balance (falls back to
 * total); reference = the invoice number so the incoming credit self-identifies
 * for auto-reconciliation.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const invoiceId = Number(id);
  if (!Number.isFinite(invoiceId)) return new Response("Bad id", { status: 400 });

  const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!inv) return new Response("Not found", { status: 404 });

  const outstanding = Number(inv.totalCents) - Number(inv.amountPaidCents);
  const amountCents = outstanding > 0 ? outstanding : Number(inv.totalCents);
  const pr = await buildPaymentRequest({ amount: amountCents / 100, reference: inv.number });
  const png = await qrPng(pr.qrPayload);
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
