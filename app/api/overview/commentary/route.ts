import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { overviewCommentaries } from "@/lib/db/schema";

export const runtime = "nodejs";

const SYSTEM = `You are a personal finance assistant looking at one user's month-so-far data.

You'll be given:
  - This month's spent / received / net (in EUR cents — divide by 100)
  - Last month's same numbers, for context
  - A short list of "attention" transactions this week (largest, first-time merchant, anomaly)

Write 2-3 short paragraphs. No bullet points, no markdown headers, no preamble.
Lead with the biggest delta vs. last month. Then comment on something specific
about the attention items if any look notable. End with one concrete next
action the user could take.

Be direct, specific, and honest. Mention real EUR amounts and merchant names.
Don't be sycophantic. Don't say "based on the data" — just say the thing.`;

/**
 * Build a stable fingerprint of the overview payload. Only the fields that
 * actually influence the commentary content go into the hash, so cosmetic
 * changes (e.g. a different `last_pull_at` timestamp on an unchanged
 * dataset) don't bust the cache.
 */
function fingerprintOf(payload: unknown): string {
  const p = payload as {
    month?: { ym?: string; spent_cents?: number; received_cents?: number; net_cents?: number };
    prev_month?: { ym?: string; spent_cents?: number; received_cents?: number; net_cents?: number };
    attention?: { type?: string; reason?: string; transaction?: { id?: number } }[];
  };
  const seed = {
    m: p.month ?? null,
    p: p.prev_month ?? null,
    a: (p.attention ?? []).map((a) => ({
      t: a.type,
      r: a.reason,
      tx: a.transaction?.id ?? null,
    })),
  };
  return createHash("sha256").update(JSON.stringify(seed)).digest("hex");
}

async function generate(payload: unknown): Promise<string> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not set");
  const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.PUBLIC_BASE_URL ?? "http://localhost:3001",
      "X-Title": "Kashing overview",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5",
      max_tokens: 800,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: "Overview data:\n\n" + JSON.stringify(payload, null, 2) },
      ],
    }),
  });
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${await r.text()}`);
  const j = (await r.json()) as { choices: { message: { content: string } }[] };
  return j.choices[0].message.content.trim();
}

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const fingerprint = fingerprintOf(payload);

  const cached = await db
    .select()
    .from(overviewCommentaries)
    .where(eq(overviewCommentaries.fingerprint, fingerprint))
    .limit(1);

  if (cached.length > 0) {
    return NextResponse.json({
      text: cached[0].text,
      cached: true,
      generated_at: cached[0].createdAt.toISOString(),
    });
  }

  let text: string;
  try {
    text = await generate(payload);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }

  await db.insert(overviewCommentaries).values({ fingerprint, text });

  return NextResponse.json({ text, cached: false, generated_at: new Date().toISOString() });
}
