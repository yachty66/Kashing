# finance-app

A local-first personal finance dashboard. Dark monochrome UI, dashboard with
sidebar, two features at the moment:

1. **Subscription tracker** — connects to European banks via GoCardless (PSD2)
   and uses an LLM to surface every recurring charge. *(Bank connect ships in
   the next milestone — UI placeholder is in place.)*
2. **AI Chat** — talk to your finance data through any OpenRouter model.
   *(Transaction context will be wired alongside step 1.)*

This is the umbrella product that the masterplan calls "the Mac app." It's
intentionally **not** native macOS — it's a Next.js web app you run locally
(via `docker run` or `npm run dev`) and access in your browser. Same code
runs as a self-hosted instance for users who want full data ownership and as
a managed hosted product for everyone else.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript
- **Tailwind 4** for styling, strict black-and-white theme
- **Neon Postgres** + **Drizzle ORM**
- **Neon Auth** (Better Auth) — Google OAuth out of the box
- **OpenRouter** for LLM inference (BYO key)

## Local dev

```bash
cd ~/projects/personal-finance/finance-app
npm install
cp .env.example .env.local   # fill in the values (or use the already-populated .env.local)
npm run db:push              # push Drizzle schema to Neon
npm run dev                  # http://localhost:3001
```

The site runs on **port 3001** to avoid colliding with mysubs on 3000.

## Routes

- `/` — landing page with Google sign-in
- `/subscriptions` — subscription tracker
- `/chat` — AI chat (streams from OpenRouter)
- `/api/auth/[...path]` — Neon Auth proxy (cookies on this domain)
- `/api/chat` — server-side OpenRouter proxy (key never reaches the browser)
