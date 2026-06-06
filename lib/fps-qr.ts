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

// hkqr-fps wants mobiles as "+<cc>-<number>" (e.g. +852-91234567). Normalize
// common shapes (+85291234567, 91234567, with spaces) to that.
function normalizeMobile(raw: string): string {
  const s = raw.replace(/\s+/g, "");
  if (/^\+\d{1,3}-\d+$/.test(s)) return s; // already +cc-number
  const withCc = s.match(/^\+(\d{1,3})(\d{6,})$/);
  if (withCc) return `+${withCc[1]}-${withCc[2]}`;
  if (/^\d{8}$/.test(s)) return `+852-${s}`; // bare HK 8-digit
  return s;
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
  const bill = opts.billNumber && fpsClean(opts.billNumber);
  const ref = opts.reference && fpsClean(opts.reference);

  const build = (setIdentity: (fps: FPS) => void): string => {
    const fps = new FPS();
    setIdentity(fps);
    fps.setHKD();
    fps.setAmount(opts.amount);
    if (bill) fps.setBillNumber(bill);
    if (ref) fps.setReference(ref);
    const res = fps.generate();
    if (typeof res.isError === "function" && res.isError()) {
      throw new Error(`FPS payload generation failed: ${res.message}`);
    }
    return String(res.data);
  };

  try {
    return build((fps) => {
      const id = opts.proxyId?.trim();
      if (opts.proxyType === "mobile" && id) fps.setMobile(normalizeMobile(id));
      else if (opts.proxyType === "email" && id) fps.setEmail(id);
      else fps.setFPSId(id || MERCHANT_FPS_ID);
    });
  } catch {
    // A malformed configured proxy must never break the QR — fall back to the
    // demo FPS ID so the code still renders and scans.
    return build((fps) => fps.setFPSId(MERCHANT_FPS_ID));
  }
}

/** Render an FPS payload to a PNG buffer (for serving as WhatsApp media). */
export function qrPng(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, { width: 512, margin: 2, errorCorrectionLevel: "M" });
}

/** Render an FPS payload to a PNG data URL (for web previews). */
export function qrDataUrl(payload: string): Promise<string> {
  return QRCode.toDataURL(payload, { width: 512, margin: 2, errorCorrectionLevel: "M" });
}
