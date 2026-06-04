# Jacob

Your personal AI CFO. Local-first.

Jacob is a dashboard for your money. It connects to European banks via
GoCardless (PSD2 open banking), pulls your transactions, finds every
contract you're paying for using an LLM (not regex), and lets you ask
questions about your finances in natural language. Named after Jakob
Fugger, the 16th-century Augsburg banker who financed half of Renaissance
Europe.

## Today

1. **Contracts.** Connect a bank, get a complete list of every recurring
   charge: subscriptions plus fixed obligations like rent, loans, and
   insurance. An LLM does the detection, so it catches what regex-based
   tools (Finanzguru et al.) miss: Amazon Prime under rotating IDs,
   FX-wobbling subs, Apple bundles.
2. **Transactions.** Searchable, filterable feed across every connected
   account, with rule-based + LLM-assisted categorization.
3. **AI Chat.** Talk to your finance data through any OpenRouter model.
   The chat sees your full transaction history, contracts, and account
   balances via a server-side system prompt.

Coming soon: deeper analysis (overview, categories, budgets, forecast,
net worth) and notifications (daily WhatsApp / Telegram briefs).

## No sign-in

In local-first mode there is no authentication. You own the machine, you
own the data. Open the app, you're in. A hosted version with Google
OAuth will ship later behind an `AUTH_MODE` flag.

## Stack

- **Next.js 16** (App Router), React 19, TypeScript
- **Tailwind 4**, strict black-and-white theme
- **Neon Postgres** + **Drizzle ORM** (SQLite swap planned once
  Docker / Tauri packaging lands)
- **GoCardless Bank Account Data API** for PSD2 bank connections
- **OpenRouter** for LLM inference (any model: Claude, GPT, Gemini,
  Deepseek, etc.)

## Local dev

```bash
git clone https://github.com/yachty66/jacob.git
cd jacob
npm install
cp .env.example .env.local   # fill in DATABASE_URL + OPENROUTER_API_KEY + GOCARDLESS_*
npm run db:push              # push Drizzle schema to Neon
npm run dev                  # http://localhost:3001
```

## Routes

- `/` redirects to `/subscriptions`
- `/subscriptions` contracts page (kept the legacy URL on purpose)
- `/transactions` transaction feed
- `/chat` AI chat (streams from OpenRouter)
- `/api/chat` server-side OpenRouter proxy (the key never reaches the browser)
