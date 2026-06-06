# Kashing — Invoices feature plan (HK-aware AR + FPS QR + reconciliation)

Add accounts-receivable to Kashing: create invoices, let customers pay by
scanning a **Hong Kong FPS QR code**, track `draft → sent → paid → overdue`,
and reconcile incoming payments against the bank transactions Kashing already
pulls.

## Context

Kashing today is **AP-only**: it reads your bank transactions (GoCardless
PSD2), LLM-categorizes them, finds subscriptions, and answers finance
questions. There is no way to **bill** anyone or track **who owes you**. This
feature adds the AR side, tailored to a Hong Kong SME per research:

- **No VAT/GST** — HK has none; invoices carry no tax lines (simpler than EU).
- **FPS QR to get paid** — the headline HK feature; standalone-generatable.
- **HKD-first, multi-currency** — matches Kashing's existing `currency` model.
- **BR number + issuer details** on the invoice (HK business documents).

### One honest constraint (read first)
Kashing's bank feed is **GoCardless = EU/UK banks only**. Two consequences:
- The **FPS QR** and **invoice tracking** are self-contained and HK-correct —
  they need no bank feed at all.
- **Auto-reconciliation** only works against banks the user actually connected
  (EU/UK today). For a HK shop with no GoCardless feed, reconciliation falls
  back to manual "mark paid" until a HK feed (HKMA Open API / Airwallex) is
  added later. The matching engine itself is bank-agnostic, so it lights up
  automatically if a HK feed ever exists.

---

## Reuse map (follow existing idioms exactly)

| Concern | Existing pattern to mirror | File |
|---|---|---|
| Schema | `serial` id, `timestamptz`, `bigint(mode:"number")` cents, `currency text default 'EUR'`, `uniqueIndex`, `onConflictDoUpdate` | [lib/db/schema.ts](Kashing/lib/db/schema.ts) |
| DB client | `db` from neon-http drizzle | [lib/db/index.ts](Kashing/lib/db/index.ts) |
| API route | `export const runtime = "nodejs"`, JSON in/out, **no auth**, `{ error }` 4xx | e.g. [app/api/budgets/route.ts](Kashing/app/api/budgets/route.ts) |
| LLM call | OpenRouter fetch helper, batch + cache, strip ``` fences, `JSON.parse` | [app/api/categorize/route.ts](Kashing/app/api/categorize/route.ts) |
| List page | client component, `useEffect` → `/api`, table in `.card`, sticky head, `tabular-nums`, status `.pill` | [app/(app)/transactions/page.tsx](Kashing/app/%28app%29/transactions/page.tsx) |
| Form | `Field` label wrapper, `.btn .btn-primary/.btn-ghost`, local validate → fetch | [components/AddSubscriptionModal.tsx](Kashing/components/AddSubscriptionModal.tsx) |
| Nav entry | `NAV` array, active = `pathname.startsWith` | [components/Sidebar.tsx](Kashing/components/Sidebar.tsx) |
| Theme | black/white CSS vars `--card/--line/--muted`, `.pill`, `focus:ring-foreground/20` | [app/globals.css](Kashing/app/globals.css) |
| Money fmt | inline `Intl.NumberFormat`, cents `/100` | every page |

**Greenfield (new deps):** no QR or PDF lib exists. Add **`qrcode`** (tiny, no
React dep) to render the FPS payload to SVG/data-URL. PDF starts as
**print-to-PDF via a print stylesheet** (zero deps); a `jspdf` download button
is an optional later add. The TLV+CRC payload itself is hand-written (no lib).

---

## Data model — add to [lib/db/schema.ts](Kashing/lib/db/schema.ts)

All money as `bigint(mode:"number")` cents; `currency text default 'HKD'`;
dates as `text` ISO `YYYY-MM-DD` (matches `transactions.bookingDate`).

1. **`businessProfile`** (single row — the issuer / "my shop"): `name`,
   `brNumber`, `addressLines`, `email`, `phone`, `defaultCurrency` ('HKD'),
   `invoicePrefix` ('INV'), `nextSeq`, FPS proxy fields
   (`fpsType` 'mobile'|'email'|'fpsid'|'account', `fpsProxyValue`,
   `fpsBankClearingCode?`, `fpsAccountNumber?`), `merchantCity` ('Hong Kong'),
   `footerNote`, `bilingual` bool.
2. **`customers`**: `name`, `email`, `addressLines`, `brNumber?`, `phone`,
   `defaultCurrency`, timestamps.
3. **`invoices`**: `number` (unique, `INV-2026-0001`), `customerId` FK,
   `issueDate`, `dueDate`, `currency`, `status`
   ('draft'|'sent'|'partly_paid'|'paid'|'overdue'|'void'),
   `subtotalCents`, `discountCents` (default 0), `totalCents`,
   `amountPaidCents` (default 0), `notes`, `footer`, `fpsQrPayload` (cached),
   `publicToken` (unguessable, for share link), `sentAt`, `paidAt`, timestamps.
   **No VAT columns** (HK).
4. **`invoiceLines`**: `invoiceId` FK cascade, `description`, `quantity`,
   `unitPriceCents`, `amountCents`, `sortOrder`.
5. **`invoicePayments`**: `invoiceId` FK, `transactionId` FK **nullable**
   (links to a bank `transactions` row when reconciled), `amountCents`,
   `paidAt`, `method` ('fps'|'bank'|'cash'|'reconciled'|'other'), `note`,
   `createdAt`. Enables partial payments + the reconciliation link.

---

## Core pieces

### FPS QR generation — `lib/fps-qr.ts` (the HK feature)
Build the **EMVCo merchant-presented** payload per HKMA "Common QR Code
Specification for Retail Payments in Hong Kong": TLV objects (00 format,
01 dynamic `12`, the FPS merchant-account-info template with proxy +
clearing/account, 52 MCC, **53 currency `344`=HKD**, 54 amount, 58 `HK`,
59 name, 60 city, 62 bill-number=invoice number) + **CRC-16/CCITT-FALSE** in
tag 63. Reference implementations to validate against:
`github.com/nessgor/fps-hk-qrcode`, `ijmacd/react-native-fps-hk-qrcode`.
Render the string with `qrcode`. **No licence required** — the app only encodes
the shop's own FPS proxy. ⚠️ Validate the payload against the official spec and
**test-scan with a real HK banking app** (HSBC/BOC/PayMe) before trusting it.

### Reconciliation — `lib/invoice-matching.ts`
Match incoming credits (`transactions.amountCents > 0`) to open invoices:
filter by currency + amount (exact/tolerance) + date window (`bookingDate ≥
issueDate`); score on amount, counterparty (`debtorName`/`creditorName` vs
customer), and **invoice number found in `memo`** (strong signal). Optionally
rank ambiguous cases with the OpenRouter LLM (reuse the categorize helper).
Surface as **suggested matches**; user confirms → insert `invoicePayments`
(with `transactionId`), bump `amountPaidCents`, flip status.

### Invoice numbering — `lib/invoices.ts`
`prefix-YYYY-NNNN` from `businessProfile.nextSeq` (or `max(number)+1`).
Single-user, so a simple read-increment is safe.

---

## API routes — `app/api/...` (Node runtime, JSON, no auth)
- `invoices/route.ts` — GET list (filters: status, customer, q) · POST create
- `invoices/[id]/route.ts` — GET · PUT · DELETE
- `invoices/[id]/status/route.ts` — POST issue/send/void
- `invoices/[id]/payments/route.ts` — POST record manual payment
- `invoices/[id]/qr/route.ts` — GET FPS payload + SVG/data-URL
- `invoices/[id]/match/route.ts` — GET suggestions · POST confirm
- `customers/route.ts` + `customers/[id]/route.ts` — CRUD
- `business-profile/route.ts` — GET · PUT
- `public/invoice/[token]/route.ts` — read-only (for the share page)
- Overdue is computed on read (`dueDate < today && unpaid`) — Kashing has no cron.

## UI — `app/(app)/invoices/...` (client components, black-and-white theme)
- Add **Invoices** to the `NAV` array in [components/Sidebar.tsx](Kashing/components/Sidebar.tsx).
- **`/invoices`** — table (number, customer, issue, due, total, status pill,
  paid) + filter header (mirror transactions) + summary cards
  (outstanding / overdue / paid-this-month).
- **`/invoices/new`** & **`/invoices/[id]/edit`** — customer picker (+ inline
  create), repeatable line-item rows, currency, dates, notes, **live total, no
  VAT field** (mirror `AddSubscriptionModal` styling).
- **`/invoices/[id]`** — detail: lines + totals, big **"Scan to pay (FPS)"**
  QR, actions (Mark sent · Record payment · Suggested matches · Copy share
  link · Print/PDF · Void).
- **`/invoices/p/[token]`** — minimal printable public invoice + QR.
- **`/invoices/settings`** — business profile + FPS proxy (Kashing has no
  settings page yet).

---

## Phasing
1. **Core AR** — schema + CRUD API + list/create/detail pages + manual mark-paid
   + numbering + nav. HKD, no VAT. *Deliverable: create & track invoices.*
2. **FPS QR** — `lib/fps-qr.ts` + `qrcode` render + QR on detail/public +
   FPS-proxy settings. *Deliverable: customer scans to pay.*
3. **Reconciliation** — matching engine + suggestions UI + confirm→payment +
   optional LLM ranking + outstanding/overdue dashboard. *Deliverable:
   payments tie to invoices.*
4. **Polish** — print/PDF download, shareable link, recurring invoices (reuse
   subscription cadence), bilingual EN/繁中 invoice template, overdue reminders.

## Verification
- `npm run db:push` then `npm run dev` (port 3001); create customer + invoice,
  check totals + sequential numbering.
- **FPS QR**: decode the payload with an EMVCo TLV parser, confirm CRC, and
  **test-scan with a real HK bank app** against a real FPS proxy (small live
  amount) before relying on it.
- **Reconciliation**: with a connected EU/UK test bank that has an incoming
  credit, confirm the matching invoice is suggested and confirming flips it to
  paid + links the transaction; confirm manual mark-paid works with no feed.
- No test harness exists — rely on `next build` (tsc) + manual checks.

## Risks / decisions
- **Geography mismatch**: GoCardless is EU/UK; HK auto-reconciliation is
  limited until a HK feed is added. FPS QR + tracking are unaffected.
- **FPS QR correctness** must be spec-validated + live-scanned before "done".
- **Public share link** is an unguessable token (security-by-obscurity) —
  acceptable for local/self-host, note it.
- **No FX**: multi-currency invoices stored in their own currency, like
  transactions.
