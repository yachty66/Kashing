import { FPS } from "hkqr-fps";
import QRCode from "qrcode";

/**
 * Hong Kong FPS (轉數快) payment QR codes.
 *
 * `hkqr-fps` builds the EMVCo-compliant FPS *data string*; it deliberately
 * does not render an image, so we hand that string to `qrcode` to produce a
 * PNG. The merchant identifier is a demo FPS ID by default — set
 * FPS_MERCHANT_ID to a real 7/9-digit FPS ID (or use a mobile/email) to make
 * the QR resolve to a real account.
 */

const MERCHANT_FPS_ID = process.env.FPS_MERCHANT_ID || "1029384"; // demo 7-digit FPS ID

// FPS bill/reference fields accept a restricted charset (A-z0-9.@_+-) and no
// spaces, so squash anything else to a hyphen.
function fpsClean(s: string): string {
  return s.replace(/[^A-Za-z0-9.@_+-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 25);
}

/** Build the FPS EMVCo payload string for a fixed-amount QR. */
export function buildFpsPayload(opts: {
  amount: number; // HKD, major units
  billNumber?: string;
  reference?: string;
  // Receiving identity. Defaults to the demo merchant FPS ID if unset.
  proxyType?: "mobile" | "email" | "fpsid";
  proxyId?: string;
}): string {
  const fps = new FPS();
  const id = opts.proxyId || MERCHANT_FPS_ID;
  if (opts.proxyType === "mobile") fps.setMobile(id);
  else if (opts.proxyType === "email") fps.setEmail(id);
  else fps.setFPSId(id);
  fps.setHKD();
  fps.setAmount(opts.amount);
  const bill = opts.billNumber && fpsClean(opts.billNumber);
  const ref = opts.reference && fpsClean(opts.reference);
  if (bill) fps.setBillNumber(bill);
  if (ref) fps.setReference(ref);
  const res = fps.generate();
  if (typeof res.isError === "function" && res.isError()) {
    throw new Error(`FPS payload generation failed: ${res.message}`);
  }
  return String(res.data);
}

/** Render an FPS payload to a PNG buffer (for serving as WhatsApp media). */
export function qrPng(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, { width: 512, margin: 2, errorCorrectionLevel: "M" });
}

/** Render an FPS payload to a PNG data URL (for web previews). */
export function qrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { width: 512, margin: 2, errorCorrectionLevel: "M" });
}
