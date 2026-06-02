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
  },
  (t) => ({
    uniqAccountTx: uniqueIndex("uniq_account_tx").on(t.accountId, t.gocardlessId),
  }),
);

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
