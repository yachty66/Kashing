"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ForecastChart,
  type ForecastMarker,
  type ForecastPoint,
} from "@/components/ForecastChart";

type ApiEvent = {
  date: string;
  name: string;
  amount_cents: number;
  kind: "subscription" | "income";
  cadence: string;
  domain?: string;
};

type ForecastData = {
  empty: false;
  accounts: number;
  today: string;
  horizon_days: number;
  starting_balance_cents: number | null;
  balance_source: "manual" | "live" | "cached" | "unknown";
  balance_updated_at: string | null;
  daily_burn_cents: number;
  events: ApiEvent[];
  incomes: { name: string; monthly_amount_eur: number; cadence: string }[];
  summary: {
    recurring_income_cents: number;
    recurring_outgoing_cents: number;
    discretionary_over_horizon_cents: number;
    income_streams: number;
    subscription_count: number;
  };
};

type Api = { accounts: number; empty: true } | ForecastData;

type Hypo = {
  id: string;
  label: string;
  amountEur: number;
  date: string;
  direction: "expense" | "income";
};

const eur0 = (cents: number) =>
  new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    cents / 100,
  );
const eur2 = (cents: number) =>
  new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(
    cents / 100,
  );
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

const HYPO_KEY = "forecast.hypotheticals";
const BAL_KEY = "forecast.manualBalanceEur";

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function nextFriday(fromISO: string): string {
  const d = new Date(fromISO);
  const delta = (5 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default function ForecastPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Api | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingBal, setRefreshingBal] = useState(false);
  const [hypos, setHypos] = useState<Hypo[]>([]);
  const [manualBalance, setManualBalance] = useState<string>("");

  // Restore client-only state.
  useEffect(() => {
    try {
      const h = localStorage.getItem(HYPO_KEY);
      if (h) setHypos(JSON.parse(h));
      const b = localStorage.getItem(BAL_KEY);
      if (b) setManualBalance(b);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(HYPO_KEY, JSON.stringify(hypos));
  }, [hypos]);

  async function load(opts?: { refreshBalance?: boolean }) {
    const params = new URLSearchParams({ days: String(days) });
    if (opts?.refreshBalance) params.set("refresh", "1");
    const r = await fetch(`/api/forecast?${params}`);
    if (r.ok) setData(await r.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  async function refreshBalance() {
    setRefreshingBal(true);
    await load({ refreshBalance: true });
    setRefreshingBal(false);
  }

  const loaded = data && !data.empty ? (data as ForecastData) : null;

  // Effective starting balance: server value wins; otherwise the user's manual figure.
  const manualCents =
    manualBalance.trim() !== "" && Number.isFinite(parseFloat(manualBalance))
      ? Math.round(parseFloat(manualBalance) * 100)
      : null;
  const startCents = loaded?.starting_balance_cents ?? manualCents;

  const { points, markers, dip } = useMemo(() => {
    if (!loaded || startCents === null) return { points: [], markers: [], dip: null as string | null };

    const dayNet = new Map<string, number>();
    const dayMarkers: ForecastMarker[] = [];
    for (const e of loaded.events) {
      dayNet.set(e.date, (dayNet.get(e.date) ?? 0) + e.amount_cents);
      dayMarkers.push({ date: e.date, name: e.name, amountCents: e.amount_cents, kind: e.kind });
    }
    for (const h of hypos) {
      if (h.date < loaded.today || h.date > addDays(loaded.today, loaded.horizon_days)) continue;
      const signed = Math.round(h.amountEur * 100) * (h.direction === "income" ? 1 : -1);
      dayNet.set(h.date, (dayNet.get(h.date) ?? 0) + signed);
      dayMarkers.push({ date: h.date, name: h.label || "Hypothetical", amountCents: signed, kind: "hypothetical" });
    }

    const burn = loaded.daily_burn_cents;
    const bandVol = Math.max(burn, 500);
    const pts: ForecastPoint[] = [];
    let running = startCents;
    let dipDate: string | null = null;
    for (let i = 0; i <= loaded.horizon_days; i++) {
      const date = addDays(loaded.today, i);
      if (i > 0) running -= burn;
      running += dayNet.get(date) ?? 0;
      if (dipDate === null && running < 0) dipDate = date;
      const band = Math.round(bandVol * Math.sqrt(i) * 0.9);
      pts.push({ date, balanceCents: running, lowerCents: running - band, upperCents: running + band });
    }
    return { points: pts, markers: dayMarkers, dip: dipDate };
  }, [loaded, startCents, hypos]);

  const endBalance = points.length ? points[points.length - 1].balanceCents : null;
  const low = points.length
    ? points.reduce((m, p) => (p.balanceCents < m.balanceCents ? p : m), points[0])
    : null;

  // ---------- render states ----------
  if (loading) {
    return <div className="p-8 text-muted text-sm">Loading forecast…</div>;
  }

  if (!loaded) {
    const accts = data && data.empty ? data.accounts : 0;
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight mb-3">Forecast</h1>
        <p className="text-muted text-sm mb-6">
          {accts === 0
            ? "No bank connected yet. The forecast needs a balance and some transaction history."
            : "No transactions yet. Pull them in first, then come back to see your projection."}
        </p>
        <Link href="/subscriptions" className="btn btn-primary">
          {accts === 0 ? "Connect a bank" : "Go to Subscriptions to pull"}
        </Link>
      </div>
    );
  }

  const needsBalance = startCents === null;

  return (
    <div className="p-8 max-w-6xl w-full">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Forecast</h1>
          <p className="text-sm text-muted mt-1">
            Your projected balance, day by day, for the next {loaded.horizon_days} days —{" "}
            {loaded.summary.subscription_count} recurring charge
            {loaded.summary.subscription_count !== 1 ? "s" : ""} and{" "}
            {loaded.summary.income_streams} income stream
            {loaded.summary.income_streams !== 1 ? "s" : ""} detected.
          </p>
        </div>
        <div className="flex items-center gap-1 card p-1">
          {[30, 60, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-md text-sm transition ${
                days === d ? "bg-accent text-black font-semibold" : "text-muted hover:text-foreground"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </header>

      {/* Dip warning */}
      {dip && (
        <div className="card p-4 mb-6 border-foreground/40">
          <div className="text-sm">
            <span className="font-semibold">Heads up —</span> on current trajectory your balance dips
            below <span className="tabular-nums">€0</span> on{" "}
            <span className="font-semibold">{shortDate(dip)}</span>
            {low && (
              <>
                {" "}
                (low point {eur0(low.balanceCents)} on {shortDate(low.date)})
              </>
            )}
            .
          </div>
        </div>
      )}

      {/* Balance source / manual entry */}
      {needsBalance ? (
        <div className="card p-5 mb-6">
          <div className="text-sm font-semibold mb-1">Set your current balance</div>
          <p className="text-xs text-muted mb-3">
            We couldn’t read a live balance from your bank. Enter today’s total balance to anchor the
            projection (kept locally, never sent anywhere except to redraw the line).
          </p>
          <div className="flex items-center gap-2">
            <span className="text-muted">€</span>
            <input
              type="number"
              inputMode="decimal"
              placeholder="2500"
              value={manualBalance}
              onChange={(e) => setManualBalance(e.target.value)}
              onBlur={() => localStorage.setItem(BAL_KEY, manualBalance)}
              className="px-3 py-2 rounded-lg border text-sm w-40 tabular-nums"
            />
            <button className="btn btn-ghost text-sm" onClick={refreshBalance} disabled={refreshingBal}>
              {refreshingBal ? "Checking bank…" : "Try bank again"}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted mb-3 flex items-center gap-3 flex-wrap">
          <span>
            Starting balance <span className="text-foreground tabular-nums">{eur0(startCents!)}</span>{" "}
            {loaded.balance_source === "manual"
              ? "(entered by you)"
              : loaded.balance_source === "live"
                ? "(live from your bank)"
                : loaded.balance_updated_at
                  ? `(as of ${new Date(loaded.balance_updated_at).toLocaleDateString()})`
                  : ""}
          </span>
          <button onClick={refreshBalance} disabled={refreshingBal} className="btn btn-ghost text-xs">
            {refreshingBal ? "Updating…" : "Update from bank"}
          </button>
        </div>
      )}

      {/* Chart */}
      {!needsBalance && (
        <section className="mb-6">
          <ForecastChart points={points} markers={markers} dipDate={dip} />
          <p className="text-[11px] text-muted mt-2 leading-relaxed">
            The line is your starting balance plus every projected income deposit, minus recurring
            charges on their due dates and your typical day-to-day spend ({eur0(loaded.daily_burn_cents)}/day
            from the last 90 days). The shaded band widens further out — the projection gets less certain
            the further it reaches.
          </p>
        </section>
      )}

      {/* Summary stats */}
      {!needsBalance && (
        <section className="grid sm:grid-cols-4 gap-4 mb-8">
          <Stat label="Today" value={eur0(startCents!)} />
          <Stat
            label={`In ${loaded.horizon_days} days`}
            value={endBalance != null ? eur0(endBalance) : "—"}
          />
          <Stat
            label="Expected income"
            value={eur0(loaded.summary.recurring_income_cents)}
            hint={`${loaded.summary.income_streams} stream${loaded.summary.income_streams !== 1 ? "s" : ""}`}
          />
          <Stat
            label="Recurring charges"
            value={eur0(-loaded.summary.recurring_outgoing_cents)}
            hint={`${loaded.summary.subscription_count} sub${loaded.summary.subscription_count !== 1 ? "s" : ""}`}
          />
        </section>
      )}

      {/* What-if */}
      <section className="mb-8">
        <h2 className="text-sm uppercase tracking-wide text-muted mb-3">What if?</h2>
        <HypoEditor today={loaded.today} hypos={hypos} setHypos={setHypos} />
      </section>

      {/* Agenda */}
      {!needsBalance && (
        <section>
          <h2 className="text-sm uppercase tracking-wide text-muted mb-3">
            Upcoming over the next {loaded.horizon_days} days
          </h2>
          <Agenda
            events={loaded.events}
            hypos={hypos}
            horizonEnd={addDays(loaded.today, loaded.horizon_days)}
            today={loaded.today}
          />
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="text-2xl font-semibold tracking-tight mt-2 tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
    </div>
  );
}

function HypoEditor({
  today,
  hypos,
  setHypos,
}: {
  today: string;
  hypos: Hypo[];
  setHypos: (h: Hypo[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(nextFriday(today));
  const [direction, setDirection] = useState<"expense" | "income">("expense");

  function add() {
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setHypos([
      ...hypos,
      {
        id: `${date}-${label}-${amount}-${hypos.length}`,
        label: label.trim() || (direction === "expense" ? "One-off purchase" : "One-off income"),
        amountEur: amt,
        date,
        direction,
      },
    ]);
    setLabel("");
    setAmount("");
  }

  return (
    <div className="card p-5">
      <p className="text-xs text-muted mb-3">
        Drop a one-off onto the timeline and watch the line react. e.g. “buy a €1,200 laptop next
        Friday” — does it push you below zero?
      </p>
      <div className="flex flex-wrap items-end gap-2 mb-4">
        <Field label="What">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Laptop"
            className="px-3 py-2 rounded-lg border text-sm w-40"
          />
        </Field>
        <Field label="Amount (€)">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1200"
            className="px-3 py-2 rounded-lg border text-sm w-28 tabular-nums"
          />
        </Field>
        <Field label="Date">
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm"
          />
        </Field>
        <Field label="Type">
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as "expense" | "income")}
            className="px-3 py-2 rounded-lg border text-sm"
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </Field>
        <button onClick={add} className="btn btn-primary text-sm">
          Add
        </button>
      </div>

      {hypos.length > 0 && (
        <ul className="space-y-2">
          {hypos.map((h) => (
            <li
              key={h.id}
              className="flex items-center justify-between text-sm border-t border-line pt-2 first:border-t-0 first:pt-0"
            >
              <span className="truncate">
                <span className="text-foreground/90">{h.label}</span>{" "}
                <span className="text-muted">· {shortDate(h.date)}</span>
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums">
                  {h.direction === "income" ? "+" : "−"}
                  {eur2(Math.round(h.amountEur * 100))}
                </span>
                <button
                  onClick={() => setHypos(hypos.filter((x) => x.id !== h.id))}
                  className="text-muted hover:text-foreground"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

function Agenda({
  events,
  hypos,
  horizonEnd,
  today,
}: {
  events: ApiEvent[];
  hypos: Hypo[];
  horizonEnd: string;
  today: string;
}) {
  const items = [
    ...events.map((e) => ({ date: e.date, name: e.name, amount: e.amount_cents, kind: e.kind as string })),
    ...hypos
      .filter((h) => h.date >= today && h.date <= horizonEnd)
      .map((h) => ({
        date: h.date,
        name: h.label,
        amount: Math.round(h.amountEur * 100) * (h.direction === "income" ? 1 : -1),
        kind: "hypothetical",
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  if (items.length === 0) {
    return <div className="card p-6 text-sm text-muted">Nothing recurring projected in this window.</div>;
  }

  return (
    <div className="card divide-y divide-line">
      {items.map((it, i) => (
        <div key={i} className="flex items-center justify-between px-5 py-3 text-sm">
          <span className="flex items-center gap-3 min-w-0">
            <span className="text-muted tabular-nums w-14 shrink-0">{shortDate(it.date)}</span>
            <span className="truncate text-foreground/90">{it.name}</span>
            {it.kind === "hypothetical" && <span className="pill pill-low">what-if</span>}
            {it.kind === "income" && <span className="pill">income</span>}
          </span>
          <span className="tabular-nums shrink-0">
            {it.amount >= 0 ? "+" : "−"}
            {eur2(Math.abs(it.amount))}
          </span>
        </div>
      ))}
    </div>
  );
}
