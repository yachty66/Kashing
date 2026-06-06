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

/**
 * Finverse login identity = one bank-consent flow result for HK/Asia banks.
 * The Finverse equivalent of a GoCardless requisition. We insert a PENDING
 * row keyed by `state` when minting the Link URL, then fill in the login
 * identity id + access token on the callback once the user has linked.
 */
export const finverseIdentities = pgTable("finverse_identities", {
  id: serial("id").primaryKey(),
  state: text("state").notNull().unique(),
  loginIdentityId: text("login_identity_id"),
  institutionName: text("institution_name"),
  accessToken: text("access_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  status: text("status").notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Bank accounts returned after consent. `provider` distinguishes GoCardless
 * (EU/UK) from Finverse (HK/Asia). For backward compatibility the unique
 * external account id is still stored in `gocardless_id` for both providers.
 * For Finverse rows it holds the Finverse account_id. Finverse accounts also
 * link back to their login identity via `finverse_identity_id`.
 */
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  gocardlessId: text("gocardless_id").notNull().unique(),
  provider: text("provider").notNull().default("gocardless"), // 'gocardless' | 'finverse'
  finverseIdentityId: integer("finverse_identity_id").references(() => finverseIdentities.id, { onDelete: "cascade" }),
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

// ── Invoicing (accounts receivable) ─────────────────────────────────────────
// Kashing reads your bank transactions (AP). These tables add the other side:
// invoices you issue to customers, tracked draft → sent → paid, and reconciled
// against the bank transactions already pulled. Hong-Kong-flavoured: HKD-first,
// no VAT/GST lines (HK has none). All money is integer cents, like everywhere
// else in this schema.

/**
 * The issuing business — a single row that renders as the "from" block on
 * every invoice. `nextSeq` drives sequential invoice numbering;
 * `paymentInstructions` is free text shown to the customer (bank account / FPS
 * proxy / however they should pay).
 */
export const businessProfile = pgTable("business_profile", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default("My Business"),
  brNumber: text("br_number"), // Hong Kong Business Registration number
  addressLines: text("address_lines"),
  email: text("email"),
  phone: text("phone"),
  paymentInstructions: text("payment_instructions"),
  // SEPA debtor (the single paying entity) — used to generate SEPA credit
  // transfers that pay incoming supplier bills.
  iban: text("iban"),
  bic: text("bic"),
  // FPS receiving identity (HK). The proxy we put into payment QR codes so
  // money lands in our account, plus an optional PayMe-for-Business link for
  // one-tap same-phone payment.
  fpsProxyType: text("fps_proxy_type"), // 'mobile' | 'email' | 'fpsid'
  fpsProxyId: text("fps_proxy_id"),
  payMeLink: text("payme_link"),
  defaultCurrency: text("default_currency").notNull().default("HKD"),
  invoicePrefix: text("invoice_prefix").notNull().default("INV"),
  nextSeq: integer("next_seq").notNull().default(1),
  footerNote: text("footer_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Customers you bill (accounts-receivable counterparties). */
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  addressLines: text("address_lines"),
  city: text("city"),
  brNumber: text("br_number"),
  vatId: text("vat_id"), // USt-ID / VAT number (shown as UST-ID)
  taxId: text("tax_id"),
  phone: text("phone"),
  defaultCurrency: text("default_currency").notNull().default("HKD"),
  // Credit profile for B2B terms: due date = issue date + creditTermsDays.
  creditTermsDays: integer("credit_terms_days").notNull().default(30),
  creditLimitCents: bigint("credit_limit_cents", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Suppliers / vendors (Lieferanten) — accounts-payable counterparties you pay.
 * Mirrors VSQ_Invoice's supplier master: name, address, tax id, banking. Can
 * be auto-seeded from bank-transaction creditor names. IBAN/BIC feed SEPA.
 */
export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name"),
  taxId: text("tax_id"), // Steuer-ID / USt-IdNr
  addressLines: text("address_lines"),
  postalCode: text("postal_code"),
  city: text("city"),
  country: text("country"),
  email: text("email"),
  iban: text("iban"),
  bic: text("bic"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Incoming supplier bills (Eingangsrechnungen / AP). What SEPA Export pays and
 * Buchhaltung books. EUR-first (SEPA is euro-only). `status` tracks payment;
 * `sepaFileId` links the bill to the SEPA batch it was paid in;
 * `bookedAt` marks it exported to bookkeeping.
 */
export const bills = pgTable("bills", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
  supplierName: text("supplier_name"), // snapshot
  invoiceNumber: text("invoice_number"),
  invoiceDate: text("invoice_date"), // YYYY-MM-DD
  dueDate: text("due_date"),
  description: text("description"),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
  currency: text("currency").notNull().default("EUR"),
  paymentIban: text("payment_iban"),
  paymentBic: text("payment_bic"),
  status: text("status").notNull().default("unpaid"), // unpaid | paid
  sepaFileId: integer("sepa_file_id"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  bookedAt: timestamp("booked_at", { withTimezone: true }), // exported to bookkeeping (Buchhaltung)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Generated SEPA Credit Transfer files (pain.001.001.03). One file bundles the
 * selected unpaid bills into a single bank upload; the XML is stored inline for
 * re-download. `entityName` is the debtor (the single business profile).
 */
export const sepaFiles = pgTable("sepa_files", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  entityName: text("entity_name").notNull(),
  debtorIban: text("debtor_iban").notNull(),
  count: integer("count").notNull().default(0),
  totalCents: bigint("total_cents", { mode: "number" }).notNull().default(0),
  status: text("status").notNull().default("generated"),
  xml: text("xml").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Sales invoices. `status` is the stored lifecycle
 * (draft | sent | partly_paid | paid | void); "overdue" is derived at read
 * time from dueDate, not stored. `amountPaidCents` is the running sum of
 * invoicePayments. `publicToken` backs an unguessable read-only share link.
 */
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  customerName: text("customer_name"), // snapshot, survives customer deletion
  issueDate: text("issue_date").notNull(), // YYYY-MM-DD
  dueDate: text("due_date"), // YYYY-MM-DD
  currency: text("currency").notNull().default("HKD"),
  status: text("status").notNull().default("draft"),
  subtotalCents: bigint("subtotal_cents", { mode: "number" }).notNull().default(0),
  discountCents: bigint("discount_cents", { mode: "number" }).notNull().default(0),
  totalCents: bigint("total_cents", { mode: "number" }).notNull().default(0),
  amountPaidCents: bigint("amount_paid_cents", { mode: "number" }).notNull().default(0),
  notes: text("notes"),
  footer: text("footer"),
  publicToken: text("public_token").notNull().unique().$defaultFn(() => crypto.randomUUID()),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Line items on an invoice. quantity is text to preserve decimals (e.g. 1.5h). */
export const invoiceLines = pgTable("invoice_lines", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull().default(""),
  quantity: text("quantity").notNull().default("1"),
  unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull().default(0),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

/**
 * Payments recorded against an invoice. `transactionId` links to a bank
 * transaction when the payment was reconciled from the bank feed; it's null
 * for manual ("mark paid") entries. Supports partial payments.
 */
export const invoicePayments = pgTable("invoice_payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  transactionId: integer("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  paidAt: text("paid_at").notNull(), // YYYY-MM-DD
  method: text("method").notNull().default("manual"), // manual | bank | cash | fps | reconciled | other
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
