import { getOrCreateBusinessProfile } from "@/lib/invoice-server";
import { buildFpsPayload } from "@/lib/fps-qr";

/**
 * A Hong Kong payment request bundle. We always send three ways to pay so the
 * client can pay from whatever app they have, including from the *same* phone
 * that received the request:
 *   - qrPayload  → rendered to an FPS QR (scan, or "scan from album" same-phone)
 *   - payMeLink  → one-tap PayMe (when the business has a PayMe-for-Business link)
 *   - copyText   → FPS proxy + amount + reference to paste manually (fallback)
 */
export type PaymentRequest = {
  amount: number; // HKD major units
  reference: string;
  qrPayload: string;
  payMeLink: string | null;
  copyText: string;
};

export async function buildPaymentRequest(opts: { amount: number; reference: string }): Promise<PaymentRequest> {
  const profile = await getOrCreateBusinessProfile();
  const proxyType = (profile.fpsProxyType as "mobile" | "email" | "fpsid" | null) ?? undefined;
  const proxyId = profile.fpsProxyId ?? undefined;

  const qrPayload = buildFpsPayload({
    amount: opts.amount,
    reference: opts.reference,
    billNumber: opts.reference,
    proxyType,
    proxyId,
  });

  const payMeLink = profile.payMeLink?.trim() || null;

  const lines = [`Pay HK$${opts.amount.toFixed(2)} to ${profile.name}`];
  if (proxyId) lines.push(`FPS ${proxyType ?? "ID"}: ${proxyId}`);
  lines.push(`Reference: ${opts.reference}`);
  if (payMeLink) lines.push(`PayMe: ${payMeLink}`);
  const copyText = lines.join("\n");

  return { amount: opts.amount, reference: opts.reference, qrPayload, payMeLink, copyText };
}
