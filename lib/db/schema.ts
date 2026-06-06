import { pgTable, serial, text, timestamp, integer, bigint, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

/** GoCardless requisition = a single bank-consent flow result. */
export const requisitions = pgTable("requisitions", {
  id: serial("id").primaryKey(),
  gocardlessId: text("gocardless_id").notNull().unique(),
  institutionId: text("institution_id").notNull(),
  reference: text("reference").notNull(),
  status: text("status").notNull().default("CR"),
  link: text("link").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Bank accounts returned by GoCardless after consent. */
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  gocardlessId: text("gocardless_id").notNull().unique(),
  institutionId: text("institution_id"),
  iban: text("iban"),
  displayName: text("display_name"),
  lastPullAt: timestamp("last_pull_at", { withTimezone: true }),
  // Latest live balance pulled from GoCardless (/accounts/{id}/balances/).
  // Cached here because GoCardless rate-limits balance calls hard — the
  // net-worth page reads this cached value and only re-pulls on demand.
  balanceCents: bigint("balance_cents", { mode: "number" }),
  balanceUpdatedAt: timestamp("balance_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Booked + pending transactions from each connected account. */
export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    gocardlessId: text("gocardless_id"),
    bookingDate: text("booking_date"),
    valueDate: text("value_date"),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("EUR"),
    creditorName: text("creditor_name"),
    debtorName: text("debtor_name"),
    memo: text("memo"),
    status: text("status").notNull().default("booked"),
    raw: jsonb("raw").notNull(),
    category: text("category"),
  },
  (t) => ({
    uniqAccountTx: uniqueIndex("uniq_account_tx").on(t.accountId, t.gocardlessId),
  }),
);

/**
 * Per-merchant category assignments. Serves two purposes:
 *   - LLM cache: once the LLM has categorized a merchant, we don't ask again
 *     on subsequent pulls (source = 'llm')
 *   - User override: when the user changes a merchant's category, the
 *     override wins forever (source = 'user')
 *
 * `key` is the normalized merchant identifier — see lib/categories.ts.
 */
export const merchantCategories = pgTable("merchant_categories", {
  key: text("key").primaryKey(),
  category: text("category").notNull(),
  source: text("source").notNull(), // 'llm' | 'user' | 'rule'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Snapshot of each analysis run — kind = 'heuristic' | 'llm' | 'brief'. */
export const analyses = pgTable("analyses", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Subscriptions the user has explicitly dismissed from the LLM analysis.
 * We match by either the lowercased name OR any merchant_string overlap so
 * that small renames between LLM runs ("Apple Services" → "Apple Services
 * Bundle") still keep the dismissal in effect.
 */
export const subscriptionDismissals = pgTable("subscription_dismissals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  merchantStrings: jsonb("merchant_strings").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Subscriptions the user added by hand (LLM missed them). */
export const subscriptionAdditions = pgTable("subscription_additions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  monthlyAmountEur: text("monthly_amount_eur").notNull(), // stored as text to preserve precise decimals
  cadence: text("cadence").notNull().default("monthly"),
  category: text("category"),
  domain: text("domain"),
  evidence: text("evidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Cached LLM commentary for the /overview page. Keyed by a SHA-256
 * fingerprint of the structured overview data we sent to the model — same
 * fingerprint = same text, no need to regenerate. New month, new pull, or
 * different attention items change the fingerprint and trigger a refresh.
 */
export const overviewCommentaries = pgTable("overview_commentaries", {
  id: serial("id").primaryKey(),
  fingerprint: text("fingerprint").notNull().unique(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Per-category monthly spending cap. One row per category. UI shows a
 * progress bar; the sidebar can later surface a badge when any category
 * is over. `category` matches the string Category type from lib/categories.
 */
export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),
  category: text("category").notNull().unique(),
  monthlyCapCents: bigint("monthly_cap_cents", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Manual assets the bank API can't see — cash, brokerage accounts, crypto,
 * property, a car. `kind` lets the same table back both assets and
 * liabilities so the net-worth math is a single signed sum:
 *   kind = 'asset'     → adds to net worth
 *   kind = 'liability' → subtracts (credit-card debt, mortgage, loans)
 * valueCents is always stored as a positive magnitude; the kind decides sign.
 */
export const manualEntries = pgTable("manual_entries", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(), // 'asset' | 'liability'
  name: text("name").notNull(),
  valueCents: bigint("value_cents", { mode: "number" }).notNull(),
  category: text("category"), // free-form: savings, investment, property, mortgage, loan…
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * One net-worth snapshot per calendar month (ym = 'YYYY-MM', unique). The
 * current month's row is upserted every time the net-worth page loads, so
 * the chart keeps its memory even if the user later disconnects a bank.
 * `breakdown` keeps the per-account / per-entry detail for that point in
 * time so history stays meaningful after balances change.
 */
export const netWorthSnapshots = pgTable("net_worth_snapshots", {
  id: serial("id").primaryKey(),
  ym: text("ym").notNull().unique(), // 'YYYY-MM'
  bankCents: bigint("bank_cents", { mode: "number" }).notNull().default(0),
  manualAssetCents: bigint("manual_asset_cents", { mode: "number" }).notNull().default(0),
  liabilityCents: bigint("liability_cents", { mode: "number" }).notNull().default(0),
  netCents: bigint("net_cents", { mode: "number" }).notNull(),
  breakdown: jsonb("breakdown").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Chat conversations (already existed). */
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// WhatsApp CFO agent — multi-user, role-based expense workflow.
//
// One shared bot number; the sender's phone number is their identity. A
// manager (the CFO) issues FPS QR codes to employees, employees pay and send
// receipts, the agent parses them by vision, and the manager approves. The
// existing accounts/transactions above are the company's bank books that the
// manager can also query. Only these new tables are user-scoped — the bank
// schema stays single-dataset on purpose (see design notes).
// ---------------------------------------------------------------------------

/** Team members who talk to the CFO agent over WhatsApp. Phone = identity. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  // E.164 with no whatsapp: prefix, e.g. "+85291234567".
  phone: text("phone").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(), // 'manager' | 'employee'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * An FPS QR code the manager issues so an employee can pay on the company's
 * behalf. `payload` is the EMVCo FPS string (rendered to a PNG when sent).
 */
export const qrIssuances = pgTable("qr_issuances", {
  id: serial("id").primaryKey(),
  issuedBy: integer("issued_by").references(() => users.id), // manager (null if employee-requested + auto)
  employeeId: integer("employee_id").notNull().references(() => users.id), // who can spend it
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("HKD"),
  purpose: text("purpose"),
  payload: text("payload").notNull(), // FPS QR data string
  status: text("status").notNull().default("issued"), // 'issued' | 'paid'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Receipts submitted by employees. Parsed by a vision model into
 * amount/merchant/date, then approved or rejected by the manager.
 */
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  submittedBy: integer("submitted_by").notNull().references(() => users.id),
  qrIssuanceId: integer("qr_issuance_id").references(() => qrIssuances.id),
  amountCents: bigint("amount_cents", { mode: "number" }), // null until parsed
  currency: text("currency").notNull().default("HKD"),
  merchant: text("merchant"),
  expenseDate: text("expense_date"), // 'YYYY-MM-DD'
  receiptUrl: text("receipt_url"),
  rawParse: jsonb("raw_parse"), // full vision output for debugging
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'rejected'
  approvedBy: integer("approved_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Short rolling chat history per user so the agent can hold a conversation. */
export const agentMessages = pgTable("agent_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
