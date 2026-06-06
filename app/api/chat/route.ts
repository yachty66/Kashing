import { NextRequest } from "next/server";
import { buildFinanceContext } from "@/lib/finance-context";
import { DEFAULT_MODEL } from "@/lib/models";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Streaming chat. The client sends only user/assistant turns; the server
 * loads the user's live financial data and prepends it as the system
 * prompt so every answer is grounded in real numbers.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    messages: { role: "user" | "assistant" | "system"; content: string }[];
    model?: string;
  };

  // Strip any system messages from the client — only the server controls
  // the system prompt. Keeps the data layer trusted.
  const turns = (body.messages ?? []).filter((m) => m.role !== "system");
  const model = body.model?.trim() || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;

  if (!process.env.OPENROUTER_API_KEY) {
    return new Response("OPENROUTER_API_KEY not set", { status: 500 });
  }

  let systemPrompt: string;
  try {
    systemPrompt = await buildFinanceContext();
  } catch (e) {
    return new Response(`Failed to load financial context: ${e}`, { status: 500 });
  }

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.PUBLIC_BASE_URL ?? "http://localhost:3001",
      "X-Title": "Kashing chat",
    },
    // max_tokens cap matters: without it OpenRouter reserves the model's
    // full max (often 64k+) against your credit balance and 402s if your
    // hold can't cover it. 4096 is plenty for a chat answer.
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: systemPrompt }, ...turns],
      max_tokens: 4096,
      stream: true,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(`Upstream error: ${upstream.status} ${await upstream.text()}`, {
      status: upstream.status,
    });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
