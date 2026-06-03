/**
 * Forecast engine — turns the recurring subscription + recurring income streams
 * that already get detected on every pull into a day-by-day projected balance.
 *
 * Everything here is pure and deterministic (no DB, no network) so the API route
 * can unit-feed it and the numbers stay reproducible. The API supplies:
 *   - the starting balance (from GoCardless, cached on accounts.balanceCents)
 *   - the detected subscriptions (LLM analysis + overlay)
 *   - every stored transaction (to anchor each stream to its last real charge)
 */

import type { Tx } from "@/lib/detect";

export type Cadence = "weekly" | "monthly" | "yearly";

/** A single projected money movement on a specific future date. */
export type ForecastEvent = {
  date: string; // YYYY-MM-DD
  name: string;
  /** Signed: income is positive, an outgoing charge is negative. */
  amount_cents: number;
  kind: "subscription" | "income";
  cadence: Cadence;
  domain?: string;
};

export type RecurringIncome = {
  name: string;
  amount_eur: number; // per-occurrence
  monthly_amount_eur: number; // normalized, for display
  cadence: Cadence;
  last_date: string;
  merchant_strings: string[];
};

type SubLike = {
  name: string;
  merchant_strings?: string[];
  monthly_amount_eur: number;
  cadence?: string;
  domain?: string;
  manual?: boolean;
};

const DAY_MS = 86_400_000;

/** N26 / common internal-transfer markers — these are not real income/spend. */
const TRANSFER_MARKERS = [
  "von hauptkonto",
  "nach hauptkonto",
  "von tagesgeldkonto",
  "nach tagesgeldkonto",
  "von freelancer",
  "nach freelancer",
  "monatliche überweisung",
  "von gpu",
  "nach gpu",
  "von poker",
  "nach poker",
  "von porsche",
  "nach porsche",
  "umbuchung",
  "transfer to",
  "transfer from",
];

function looksInternal(t: Tx): boolean {
  const memo = (t.memo ?? "").toLowerCase();
  return TRANSFER_MARKERS.some((m) => memo.includes(m));
}

function toCadence(c: string | undefined): Cadence | null {
  if (c === "weekly" || c === "monthly" || c === "yearly") return c;
  return null;
}

/** Convert a stream's normalized monthly figure to its per-occurrence charge. */
export function perOccurrenceCents(monthlyEur: number, cadence: Cadence): number {
  const monthly = Math.round(monthlyEur * 100);
  if (cadence === "weekly") return Math.round((monthly * 12) / 52);
  if (cadence === "yearly") return monthly * 12;
  return monthly;
}

function stepNext(d: Date, cadence: Cadence): Date {
  const n = new Date(d);
  if (cadence === "weekly") n.setDate(n.getDate() + 7);
  else if (cadence === "monthly") n.setMonth(n.getMonth() + 1);
  else n.setFullYear(n.getFullYear() + 1);
  return n;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Walk a stream forward from its last real occurrence, emitting every date that
 * lands in (today, today+horizon]. `anchor` is the last date we actually saw the
 * charge; we always start projecting from the first occurrence strictly after
 * today so we never double-count a charge that already cleared.
 */
function projectDates(anchorISO: string, cadence: Cadence, todayMs: number, horizonMs: number): string[] {
  const out: string[] = [];
  let cur = new Date(anchorISO);
  // Fast-forward to the first occurrence after today.
  let guard = 0;
  while (cur.getTime() <= todayMs && guard < 1000) {
    cur = stepNext(cur, cadence);
    guard++;
  }
  while (cur.getTime() <= horizonMs && guard < 1000) {
    out.push(iso(cur));
    cur = stepNext(cur, cadence);
    guard++;
  }
  return out;
}

/**
 * Detect recurring *income* with the same spirit as the subscription heuristic,
 * but on the incoming side: group inflows by payer, require a stable cadence and
 * a reasonably stable amount, and drop internal transfers between own accounts.
 */
export function detectRecurringIncome(txs: Tx[]): RecurringIncome[] {
  const groups = new Map<string, { date: string; cents: number; memo: string }[]>();
  for (const t of txs) {
    if (t.amountCents <= 0) continue; // incoming only
    if (looksInternal(t)) continue;
    const d = t.bookingDate ?? t.valueDate;
    if (!d) continue;
    const payer = (t.debtorName ?? "").trim().toLowerCase();
    const key = payer || (t.memo ?? "").toLowerCase().split(/\s+/).slice(0, 4).join(" ");
    if (!key || key === "(unknown)") continue;
    const arr = groups.get(key) ?? [];
    arr.push({ date: d, cents: t.amountCents, memo: (t.memo ?? "").slice(0, 120) });
    groups.set(key, arr);
  }

  const incomes: RecurringIncome[] = [];
  for (const [key, items] of groups.entries()) {
    if (items.length < 2) continue;
    items.sort((a, b) => a.date.localeCompare(b.date));
    const times = items.map((i) => new Date(i.date).getTime());
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i++) gaps.push((times[i] - times[i - 1]) / DAY_MS);
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    let cadence: Cadence | null = null;
    if (avgGap >= 6 && avgGap <= 8) cadence = "weekly";
    else if (avgGap >= 25 && avgGap <= 35) cadence = "monthly";
    else if (avgGap >= 350 && avgGap <= 380) cadence = "yearly";
    if (!cadence) continue;

    const amounts = items.map((i) => i.cents);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (mean < 5000) continue; // ignore sub-€50 noise
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    // Income (esp. freelance) varies more than a subscription — allow 30%.
    if (max - min > Math.max(2000, 0.3 * mean)) continue;

    const monthlyMul = cadence === "weekly" ? 52 / 12 : cadence === "yearly" ? 1 / 12 : 1;
    const name = items.find((i) => i.memo)?.memo ?? key;
    incomes.push({
      name: name.length > 40 ? name.slice(0, 40) + "…" : name,
      amount_eur: Math.round(mean) / 100,
      monthly_amount_eur: Math.round(mean * monthlyMul) / 100,
      cadence,
      last_date: items[items.length - 1].date,
      merchant_strings: [key],
    });
  }
  incomes.sort((a, b) => b.monthly_amount_eur - a.monthly_amount_eur);
  return incomes;
}

/** Find the most recent outgoing tx matching a subscription's merchant strings. */
function lastChargeDate(sub: SubLike, txs: Tx[]): string | null {
  const needles = (sub.merchant_strings ?? [sub.name]).map((m) => m.toLowerCase()).filter(Boolean);
  if (needles.length === 0) return null;
  let latest: string | null = null;
  for (const t of txs) {
    if (t.amountCents >= 0) continue;
    const hay = `${(t.creditorName ?? "").toLowerCase()} ${(t.memo ?? "").toLowerCase()}`;
    if (!needles.some((n) => hay.includes(n))) continue;
    const d = t.bookingDate ?? t.valueDate;
    if (!d) continue;
    if (!latest || d > latest) latest = d;
  }
  return latest;
}

/**
 * Build every projected event (subscriptions + income) inside the horizon,
 * sorted by date. `todayISO` anchors the window so the result is deterministic.
 */
export function buildEvents(
  subs: SubLike[],
  incomes: RecurringIncome[],
  txs: Tx[],
  todayISO: string,
  horizonDays: number,
): ForecastEvent[] {
  const today = new Date(todayISO);
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  const horizonMs = todayMs + horizonDays * DAY_MS;
  const events: ForecastEvent[] = [];

  for (const s of subs) {
    const cadence = toCadence(s.cadence);
    if (!cadence) continue; // usage-based / unknown can't be placed on a date
    const anchor = lastChargeDate(s, txs) ?? (s.manual ? todayISO : null);
    if (!anchor) continue;
    const charge = perOccurrenceCents(s.monthly_amount_eur, cadence);
    for (const date of projectDates(anchor, cadence, todayMs, horizonMs)) {
      events.push({ date, name: s.name, amount_cents: -charge, kind: "subscription", cadence, domain: s.domain });
    }
  }

  for (const inc of incomes) {
    const charge = perOccurrenceCents(inc.monthly_amount_eur, inc.cadence);
    for (const date of projectDates(inc.last_date, inc.cadence, todayMs, horizonMs)) {
      events.push({ date, name: inc.name, amount_cents: charge, kind: "income", cadence: inc.cadence });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  return events;
}

/**
 * Average daily *discretionary* outflow — everything you spent that isn't one of
 * the recurring subscriptions, averaged over the lookback window. This is what
 * the projected line bleeds off each day (groceries, coffee, one-offs) on top of
 * the dated recurring events, and what the confidence band widens around.
 */
export function discretionaryDailyCents(txs: Tx[], recurringMonthlyEur: number, lookbackDays = 90): number {
  const cutoff = iso(new Date(Date.now() - lookbackDays * DAY_MS));
  let outflow = 0;
  for (const t of txs) {
    if (t.amountCents >= 0) continue;
    if (looksInternal(t)) continue;
    const d = t.bookingDate ?? t.valueDate ?? "";
    if (d < cutoff) continue;
    outflow += -t.amountCents;
  }
  const recurringOverWindow = Math.round(recurringMonthlyEur * 100) * (lookbackDays / 30);
  const discretionary = Math.max(0, outflow - recurringOverWindow);
  return Math.round(discretionary / lookbackDays);
}
