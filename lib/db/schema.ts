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
