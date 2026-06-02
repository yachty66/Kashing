import { NextRequest } from "next/server";

export const runtime = "nodejs";

/**
 * Proxy to OpenRouter's chat completions endpoint with streaming.
 * The browser POSTs `{ messages: [{role, content}, ...] }`; we forward to
 * OpenRouter using server-side env credentials and stream the SSE response
 * straight back. Never exposes the key.
 */
export async function POST(req: NextRequest) {
  const { messages } = (await req.json()) as {
    messages: { role: "user" | "assistant" | "system"; content: string }[];
  };

  if (!process.env.OPENROUTER_API_KEY) {
    return new Response("OPENROUTER_API_KEY not set", { status: 500 });
  }

  const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3001",
      "X-Title": "finance-app",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4.5",
      messages,
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
