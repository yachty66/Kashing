"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

// The system prompt — including all the user's transactions, subscriptions,
// and account context — is built and injected by the server in /api/chat.
// The client only sends user/assistant turns.

export function ChatUI() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;

    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setStreaming(true);

    // Placeholder assistant message we'll fill in token-by-token.
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
        }),
      });

      if (!r.ok || !r.body) {
        const errText = await r.text();
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: `Error: ${errText}` };
          return copy;
        });
        return;
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // OpenRouter streams SSE: "data: {...}\n\n" with [DONE] sentinel.
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const evt = JSON.parse(payload);
            const delta: string = evt.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = {
                  role: "assistant",
                  content: copy[copy.length - 1].content + delta,
                };
                return copy;
              });
            }
          } catch {
            // ignore parse errors on partial chunks
          }
        }
      }
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-8 py-5 border-b border-line">
        <h1 className="text-lg font-semibold tracking-tight">AI Chat</h1>
        <p className="text-xs text-muted mt-1">
          OpenRouter · {process.env.NEXT_PUBLIC_MODEL ?? "anthropic/claude-sonnet-4.5"}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-muted text-sm space-y-3">
              <p>
                Ask anything about your finances. The model has live access to
                every transaction, your detected subscriptions, your account
                balances, and monthly summaries.
              </p>
              <div className="text-foreground/80 text-xs uppercase tracking-wide mt-4">
                Try
              </div>
              <ul className="space-y-1.5 text-foreground/80">
                {[
                  "How much did I spend on groceries last month?",
                  "What's my biggest subscription, and is it worth it?",
                  "Show me every charge from Amazon in the last 30 days.",
                  "Did I receive my paycheck this month?",
                  "Which of my subscriptions look forgotten?",
                ].map((q, i) => (
                  <li key={i}>· {q}</li>
                ))}
              </ul>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i}>
              <div className="text-xs text-muted mb-1.5 uppercase tracking-wide">
                {m.role === "user" ? "You" : "Assistant"}
              </div>
              <div className="whitespace-pre-wrap leading-relaxed text-foreground">
                {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      <form onSubmit={onSubmit} className="border-t border-line px-8 py-4">
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything…"
            disabled={streaming}
            className="flex-1 px-4 py-2.5 rounded-lg border border-line bg-card focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="btn btn-primary disabled:opacity-60"
          >
            {streaming ? "…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
