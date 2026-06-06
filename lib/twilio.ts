import twilio from "twilio";
import { type Channel } from "@/lib/agent/channel";

/**
 * Twilio-backed WhatsApp channel. Credentials come from env:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 * TWILIO_WHATSAPP_FROM is the sandbox/sender, e.g. "whatsapp:+14155238886".
 */

function withWhatsApp(addr: string): string {
  return addr.startsWith("whatsapp:") ? addr : `whatsapp:${addr}`;
}

let client: ReturnType<typeof twilio> | null = null;
function getClient() {
  if (!client) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set");
    client = twilio(sid, token);
  }
  return client;
}

export function twilioChannel(): Channel {
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from) throw new Error("TWILIO_WHATSAPP_FROM not set");
  return {
    async send(toPhone, text, mediaUrls) {
      await getClient().messages.create({
        from: withWhatsApp(from),
        to: withWhatsApp(toPhone),
        body: text,
        ...(mediaUrls && mediaUrls.length > 0 ? { mediaUrl: mediaUrls } : {}),
      });
    },
  };
}

/**
 * Fetch an inbound Twilio media item (receipt photo) — these require basic
 * auth — and return it as a data URL for the vision model.
 */
export async function fetchTwilioMediaAsDataUrl(mediaUrl: string, contentType: string): Promise<string> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set");
  const res = await fetch(mediaUrl, {
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch Twilio media: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = contentType || res.headers.get("content-type") || "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}
