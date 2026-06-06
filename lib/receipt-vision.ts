/**
 * Receipt parsing via a vision model on OpenRouter. Gemini is strong and
 * cheap at reading receipts; override with VISION_MODEL. Takes an image as a
 * data URL and returns structured fields plus the raw model output.
 */

const VISION_MODEL = process.env.VISION_MODEL || "google/gemini-2.5-flash";

export type ParsedReceipt = {
  amount: number | null; // major units (e.g. HKD)
  currency: string; // ISO 4217, defaults HKD
  merchant: string | null;
  date: string | null; // 'YYYY-MM-DD'
  raw: unknown;
};

const PROMPT = `You are reading a payment receipt. Extract these fields and reply with ONLY a JSON object, no prose, no markdown fence:
{"amount": number|null, "currency": string, "merchant": string|null, "date": "YYYY-MM-DD"|null}
- amount: the grand total actually paid, as a number (no currency symbol).
- currency: ISO 4217 code; if a HK$ / HKD receipt, use "HKD". Default "HKD" if unclear.
- merchant: the shop/restaurant name.
- date: the transaction date in YYYY-MM-DD, or null if not visible.`;

/** Pull the first JSON object out of a model response (handles ``` fences). */
function extractJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function parseReceipt(imageDataUrl: string): Promise<ParsedReceipt> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not set");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.PUBLIC_BASE_URL ?? "http://localhost:3001",
      "X-Title": "Jacob receipt OCR",
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Vision model error ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content) ?? {};

  const amountRaw = parsed.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string" && amountRaw.trim() !== "" && !isNaN(Number(amountRaw))
        ? Number(amountRaw)
        : null;

  return {
    amount,
    currency: typeof parsed.currency === "string" ? parsed.currency : "HKD",
    merchant: typeof parsed.merchant === "string" ? parsed.merchant : null,
    date: typeof parsed.date === "string" ? parsed.date : null,
    raw: content,
  };
}
