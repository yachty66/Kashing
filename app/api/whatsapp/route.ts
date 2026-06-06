import { NextRequest } from "next/server";
import { getUserByPhone, normalizePhone } from "@/lib/users";
import { respond, handleReceipt } from "@/lib/agent/respond";
import { twilioChannel, fetchTwilioMediaAsDataUrl } from "@/lib/twilio";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Empty TwiML — we send all replies via the REST API, not inline. */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
function twiml() {
  return new Response(EMPTY_TWIML, { headers: { "Content-Type": "text/xml" } });
}

/**
 * Twilio WhatsApp inbound webhook. One shared bot number; the sender's phone
 * is their identity. Text → role-aware agent; a photo → receipt submission.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const from = normalizePhone(String(form.get("From") ?? ""));
  const body = String(form.get("Body") ?? "").trim();
  const numMedia = Number(form.get("NumMedia") ?? "0");

  if (!from) return twiml();

  const channel = twilioChannel();

  const user = await getUserByPhone(from);
  if (!user) {
    // Best-effort; ignore failures (e.g. sender hasn't joined the sandbox) so
    // we always return 200 and Twilio doesn't retry.
    try {
      await channel.send(from, "You're not registered with the Jacob CFO agent. Ask your manager to add your number.");
    } catch (e) {
      console.error("failed to notify unregistered sender:", e);
    }
    return twiml();
  }

  try {
    if (numMedia > 0) {
      const mediaUrl = String(form.get("MediaUrl0") ?? "");
      const contentType = String(form.get("MediaContentType0") ?? "");
      if (mediaUrl && contentType.startsWith("image/")) {
        const imageDataUrl = await fetchTwilioMediaAsDataUrl(mediaUrl, contentType);
        const reply = await handleReceipt(user, { imageDataUrl, mediaUrl }, channel);
        await channel.send(from, reply.text);
        return twiml();
      }
      await channel.send(from, "I can only read photo receipts right now — please send the receipt as an image.");
      return twiml();
    }

    if (!body) return twiml();
    const reply = await respond(user, body, channel);
    await channel.send(from, reply.text);
  } catch (e) {
    console.error("whatsapp webhook error:", e);
    await channel.send(from, "Something went wrong on my end — please try again in a moment.");
  }
  return twiml();
}
