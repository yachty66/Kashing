<p align="center">
  <img src="public/logo.png" width="120" alt="Kashing" />
</p>

<h1 align="center">Kashing</h1>

<p align="center">
  Your personal AI CFO. Local-first.
</p>

Kashing is a dashboard for your money. It connects to European banks via GoCardless (PSD2 open banking), pulls your transactions, finds every contract you're paying for using an LLM (not regex), and lets you ask anything about your finances in natural language.

## Quickstart

You need three free accounts. None of them charge for the volume one user produces.

1. **Neon** for Postgres: [neon.tech](https://neon.tech). Free tier covers this easily.
2. **GoCardless Bank Account Data** for PSD2 bank access: [bankaccountdata.gocardless.com](https://bankaccountdata.gocardless.com). Free for up to fifty users per day.
3. **OpenRouter** for LLM calls: [openrouter.ai](https://openrouter.ai). Top up five dollars and you have months of headroom.

Then:

```bash
git clone https://github.com/yachty66/Kashing.git
cd Kashing
npm install
cp .env.example .env.local   # fill in the values below
npm run db:push              # create schema in your Neon DB
npm run dev                  # http://localhost:3001
```

Open the app, click **Connect a bank**, pick your bank, authorize at your bank, come back. Hit **Pull and analyze**. The first run pulls every transaction GoCardless can see (up to 90 days) and runs categorization plus subscription detection. Subsequent runs are incremental and finish in seconds.

## Environment

```env
DATABASE_URL=postgresql://USER:PASS@HOST/DB?sslmode=require
PUBLIC_BASE_URL=http://localhost:3001

GOCARDLESS_SECRET_ID=
GOCARDLESS_SECRET_KEY=

OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-sonnet-4.6   # optional, dropdown overrides per chat
```

`PUBLIC_BASE_URL` is where GoCardless redirects after bank consent. Set it to your public URL if you self-host on a server.

## Stack

- [Next.js 16](https://nextjs.org) (App Router), React 19, TypeScript
- [Tailwind 4](https://tailwindcss.com), strict black-and-white theme
- [Neon Postgres](https://neon.tech) with [Drizzle ORM](https://orm.drizzle.team)
- [GoCardless Bank Account Data](https://gocardless.com/bank-account-data/) for PSD2 bank access (every major EU and UK bank)
- [OpenRouter](https://openrouter.ai) for LLM inference, model picked per chat from the live top-weekly list

## How it works

1. **Bank connect.** You hit Connect a bank, the server creates a GoCardless requisition, you authorize at your bank, GoCardless redirects you back. Bank credentials never touch Kashing.
2. **Pull.** `POST /api/refresh` fetches up to ninety days of booked and pending transactions per linked account, upserts on `(account_id, gocardless_id)`.
3. **Categorize.** Keyword rules first (`lib/categories.ts`, covers transfers, salary, fees, the obvious merchants). Whatever rules don't match goes to an LLM batch via `app/api/categorize/route.ts`. Per-merchant user overrides are stored and win forever.
4. **Detect contracts.** Two passes. A heuristic looks for cadence plus amount stability. An LLM in `lib/detect.ts` catches what statistics miss: rotating transaction IDs, FX-varying foreign subs, Apple-bundle decomposition, PayPal-routed subs, single-occurrence-but-known.
5. **Compile context.** `lib/finance-context.ts` packs everything (transactions, contracts, balances, monthly summaries) into one system prompt.
6. **Chat.** The server holds the API key, streams from OpenRouter, the client only ever sees user and assistant turns. Top-weekly model list is fetched live from OpenRouter and cached for an hour.

## Roadmap

- Polish and surface the Analysis pages (Overview, Categories, Budgets, Forecast, Net worth) under the SOON tab
- Notifications channel: ship the Telegram and WhatsApp daily-brief side of the SOON tab
- Docker image for one-command self-host
- SQLite mode (no Neon required) for true offline local-first
- MCP server: the same context layer, queryable from Claude Desktop and Cursor
- iMessage and Slack as additional notification channels
- Mobile app (Germany first, then EU)
- Subscription cancellation flows

## Contributing

Pull requests welcome. For anything bigger than a typo, open an issue first so we can align on the shape before you spend hours on it.

Kashing is intentionally small. Each feature should fit in one head. If a change feels like it needs an architecture doc to explain, it's probably the wrong change for this repo.

## License

MIT. See [LICENSE](LICENSE).
