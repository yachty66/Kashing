/**
 * A messaging channel the agent can send through, kept abstract so the agent
 * core never imports Twilio (or any specific provider). The WhatsApp webhook
 * supplies a Twilio-backed implementation; tests can supply a fake.
 */
export interface Channel {
  /** Send a text message (with optional public media URLs) to a phone in E.164. */
  send(toPhone: string, text: string, mediaUrls?: string[]): Promise<void>;
}

function baseUrl(): string {
  return (process.env.PUBLIC_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

/** Public URL where the QR PNG for an issuance is served (Twilio fetches it). */
export function qrMediaUrl(issuanceId: number): string {
  return `${baseUrl()}/api/qr/${issuanceId}`;
}

/** Public URL for an invoice's FPS QR PNG. */
export function invoiceQrMediaUrl(invoiceId: number): string {
  return `${baseUrl()}/api/invoices/${invoiceId}/qr`;
}
