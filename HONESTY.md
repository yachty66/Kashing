# HONESTY.md

An honest accounting of what Kashing is, what we forked, what we adapted, and what we built during the hackathon. Where something is mocked or incomplete, we say so plainly.

## TL;DR

Kashing is a business finance app for Hong Kong SMBs. Connect your bank (Hong Kong via Finverse, EU/UK via GoCardless) and it handles invoicing with FPS-QR, accounts receivable and payable, auto-reconciliation, dunning, expense management with receipt OCR, and a WhatsApp CFO agent.

Two pre-existing codebases fed into this, and we are explicit about both:
1. We forked an existing open-source personal-finance app (`jacob`) and converted it into a business finance product during the hack.
2. We adapted the invoicing/bookkeeping layer from a team member's prior project (`VSQ_Invoice`).

Everything else (Hong Kong bank support, the WhatsApp agent, FPS payments, reconciliation, dunning, expenses, team management) was built during the hackathon.

## What already existed before the hackathon

### 1. jacob (the fork base)

Kashing is forked from `github.com/yachty66/jacob`, an open-source, local-first personal finance dashboard built before the hackathon. Commits dated 2026-06-02 to 2026-06-04 are this base. From jacob we inherited:

- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4 app shell
- Neon Postgres + Drizzle ORM data layer
- GoCardless Bank Account Data integration (EU/UK PSD2): connect a bank, pull transactions and balances
- LLM transaction categorization via OpenRouter (rule, then cache, then LLM)
- LLM subscription/contract detection (heuristic pass + LLM pass)
- AI chat over your financial data, with a model picker
- Pages: contracts/subscriptions, transactions, overview with LLM commentary, categories, budgets, forecast, net worth, chat
- Manual subscription overrides (add/dismiss) and a subscription calendar

### 2. VSQ_Invoice (adapted prior work)

The invoicing and bookkeeping layer (invoice creation, customers and suppliers master data, the invoice document and wizard, and the SEPA export) was adapted and ported from `VSQ_Invoice`, a prior project by a team member. We did not build the invoicing engine from scratch during the hack. We ported it, localized it for Hong Kong, translated the UI to English, and rewired it onto Kashing's data model and live bank data. Commits labelled "ported from VSQ_Invoice" / "like VSQ_Invoice" mark this work.

## What we built during the hackathon

Everything from 2026-06-06 onward (the Jacob to Kashing rebrand and after). This is the pivot from a personal finance tool into a Hong Kong business finance app.

Built new during the hack:

- **Finverse integration for Hong Kong / Asia banks** as a second bank-data provider alongside GoCardless: new API client (`lib/finverse.ts`), the hosted-Link connect flow, a CORS-aware callback, a multi-provider schema (a `provider` tag on accounts and a `finverse_identities` table), and per-provider transaction ingestion.
- **WhatsApp CFO agent** over Twilio plus OpenRouter tool-calling: role-based (manager/employee) expense and AR/AP workflow with real database-backed tools (approve/reject expenses, issue FPS QR, create invoices, AR aging, chase overdue, reimburse, set allowance, pay supplier).
- **Receipt OCR** via a vision model: extracts amount, merchant, date, category, and the Hong Kong Business Registration Number from a photo, and creates an expense.
- **FPS-QR generation** (Hong Kong Faster Payment System) for invoices and payment requests.
- **Auto-reconciliation**: match incoming credits to open invoices (invoice number + amount) and outgoing debits to approved expenses.
- **Dunning**: escalating WhatsApp payment reminders with an attached FPS QR.
- **Expense / accounts-payable loop**: reimbursements, per-employee allowances, supplier payments.
- **Team management**, an **audit log** of agent conversations, a **4-week cash-flow forecast**, and an **Incoming/Outgoing** UX restructure with overview wealth boxes.
- Light/dark theme and the 動力 brand and logo.
- Performance work on Pull & analyze (bulk inserts, parallel account pulls, parallel LLM passes) and a fix to the upcoming-charges projection.

Adapted during the hack (from VSQ_Invoice, see above): invoices, customers, suppliers, bookkeeping views, the invoice document/wizard, and SEPA export.

## What is fully functional vs what is mocked

We tested these end to end. Where something needs a key or external service, it is noted.

### Fully functional (real)

- **GoCardless bank ingestion** (EU/UK). Requires `GOCARDLESS_SECRET_ID` / `GOCARDLESS_SECRET_KEY`.
- **Finverse bank ingestion** (HK/Asia). Requires `FINVERSE_CLIENT_ID` / `FINVERSE_CLIENT_SECRET`. Verified end to end. See the Finverse note below for an important caveat about real vs test banks.
- **LLM subscription detection, categorization, and overview commentary** (OpenRouter). Requires `OPENROUTER_API_KEY`.
- **WhatsApp CFO agent and its tool-calling** (real database reads and writes). Inbound/outbound messaging requires Twilio credentials (`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM`); without them the agent logic still runs but messages are not delivered.
- **Receipt vision OCR** (including BRN extraction), wired into expense creation.
- **Invoices, customers, suppliers, bookkeeping**: real Postgres-backed CRUD, including a working public invoice link.
- **FPS-QR generation**: produces real EMVCo-compliant Hong Kong FPS QR codes. Uses a demo merchant FPS ID unless `FPS_MERCHANT_ID` is set.
- **Auto-reconciliation, dunning, cash-flow forecast, team and allowance controls**: real logic over real database state.

### Mocked or simulated (called out honestly)

- **Outbound payments are mocked.** `lib/payment-rail.ts` returns a simulated success and does not move money. Every decision around a payout (approval, allowance check, reconciliation, and the resulting database state changes) is real, but the actual fund transfer is stubbed. The reason: our bank connections (GoCardless, Finverse) are read-only aggregation and do not grant payment-initiation rights. A production rail (for example Airwallex) is where this would plug in. This affects expense reimbursement and supplier payment.
- **SEPA export is generation-only.** It produces a valid `pain.001` XML file for manual bank upload. It is not transmitted to a bank API.
- **Demo dataset is seeded test data.** `scripts/seed-demo.ts` creates a fictional Hong Kong company ("Kowloon Trading Co.") with sample customers, suppliers, invoices, and transactions for the demo. It is not real data, and the app runs fine without it (an empty database works).

### Finverse: real vs test bank

The Finverse integration is fully built and verified end to end, currently against Finverse's sandbox **test bank**. Our Finverse credentials are a "Test app", which by Finverse policy can only link Finverse's test bank, not real banks. Connecting real Hong Kong banks (HSBC, DBS, Bank of China, and others) requires Finverse to enable real-bank access on our app, which is a Finverse-side approval and is pending. This is an account-provisioning gate, not a code limitation: the same flow runs unchanged against real banks once enabled.

## Known limitations

- **Single-tenant / local-first**: there is no end-user authentication layer (inherited from jacob). It is intended to run as a single business instance.
- **Bank connections are read-only**, which is why outbound payments are mocked (see above).
- **Detection quality** depends on the chosen LLM model (`OPENROUTER_MODEL`).

## Repo hygiene

- **Secrets**: no credentials are committed. `.env.local` is gitignored (`.env*.local`) and has never been in git history; only `.env.example` (placeholders) is tracked. We verified this across the full history.
- **.gitignore** covers `node_modules/`, `.next/`, build artifacts, `.env*.local`, and `drizzle/`.
- **Required environment variables** are documented in `.env.example` and the README.
