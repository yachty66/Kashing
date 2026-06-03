"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CATEGORIES } from "@/lib/categories";

type CategoryRow = {
  name: string;
  monthly_cents: Record<string, number>;
  total_6mo_cents: number;
};

type CategoriesResp = {
  months: string[];
  categories: CategoryRow[];
  uncategorized_count: number;
};

type TxRow = {
  id: number;
  bookingDate: string | null;
  valueDate: string | null;
  amountCents: number;
  currency: string;
  creditorName: string | null;
  debtorName: string | null;
  memo: string | null;
  status: string;
  category: string | null;
  accountName: string | null;
};

const eur = (cents: number) =>
  new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const eurDetail = (cents: number) =>
  new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
    signDisplay: "always",
  }).format(cents / 100);

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short" });
};

// We don't show Income, Transfers, or Loans & Fees in the spending bars —
// they're separate concerns (income tracking, internal moves, fee tracking).
const NON_SPEND = new Set(["Income", "Transfers", "Loans & Fees"]);

function merchantKeyClient(t: { creditorName: string | null; debtorName: string | null; memo: string | null }) {
  const cred = (t.creditorName ?? "").trim().toLowerCase();
  if (cred) return cred;
  const deb = (t.debtorName ?? "").trim().toLowerCase();
  if (deb) return deb;
  const memo = (t.memo ?? "").toLowerCase().split(/\s+/).slice(0, 4).join(" ");
  return memo || "(unknown)";
}

export default function CategoriesPage() {
  const [data, setData] = useState<CategoriesResp | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [txs, setTxs] = useState<TxRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/categories");
    if (!r.ok) return;
    setData(await r.json());
  }, []);

  const loadTxs = useCallback(async () => {
    const r = await fetch("/api/transactions");
    if (!r.ok) return;
    const d = await r.json();
    setTxs(d.transactions);
  }, []);

  useEffect(() => {
    load();
    loadTxs();
  }, [load, loadTxs]);

  async function categorizeNow() {
    setBusy(true);
    try {
      const r = await fetch("/api/categorize", { method: "POST" });
      if (!r.ok) {
        alert(await r.text());
        return;
      }
      await Promise.all([load(), loadTxs()]);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return <div className="p-8 text-muted text-sm">Loading categories…</div>;
  }

  const currentMonth = data.months[0];
  const prevMonth = data.months[1];
  const spending = data.categories.filter((c) => !NON_SPEND.has(c.name));
  const nonSpend = data.categories.filter((c) => NON_SPEND.has(c.name) && c.total_6mo_cents > 0);

  const maxThisMonth = Math.max(1, ...spending.map((c) => c.monthly_cents[currentMonth] ?? 0));
  const totalThisMonth = spending.reduce((s, c) => s + (c.monthly_cents[currentMonth] ?? 0), 0);
  const totalLastMonth = spending.reduce((s, c) => s + (c.monthly_cents[prevMonth] ?? 0), 0);

  const txsInSelected =
    selected && txs
      ? txs
          .filter((t) => t.category === selected)
          .filter((t) => {
            const ym = (t.bookingDate ?? t.valueDate ?? "").slice(0, 7);
            return ym === currentMonth;
          })
          .sort((a, b) => (b.bookingDate ?? "").localeCompare(a.bookingDate ?? ""))
      : [];

  return (
    <div className="p-8 w-full">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
          <p className="text-sm text-muted mt-1">
            {monthLabel(currentMonth)} spending:{" "}
            <span className="text-foreground tabular-nums">{eur(totalThisMonth)}</span>
            {totalLastMonth > 0 && (
              <>
                {" "}
                · {monthLabel(prevMonth)} was{" "}
                <span className="tabular-nums">{eur(totalLastMonth)}</span>
              </>
            )}
            {data.uncategorized_count > 0 && (
              <> · {data.uncategorized_count} transactions not yet categorized</>
            )}
          </p>
        </div>
        <div className="flex gap-3 items-center">
          {data.uncategorized_count > 0 && (
            <button onClick={categorizeNow} disabled={busy} className="btn btn-primary disabled:opacity-60">
              {busy ? "Categorizing…" : "Categorize uncategorized"}
            </button>
          )}
        </div>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
        <section className="card p-6 min-w-0">
          <h2 className="text-lg font-semibold mb-4">This month</h2>
          {spending.every((c) => (c.monthly_cents[currentMonth] ?? 0) === 0) ? (
            <p className="text-muted text-sm">
              No spending yet this month. Pull & analyze on the Subscriptions page if you
              just connected a bank.
            </p>
          ) : (
            <ul className="space-y-2">
              {spending.map((c) => {
                const cents = c.monthly_cents[currentMonth] ?? 0;
                const prev = c.monthly_cents[prevMonth] ?? 0;
                const pct = (cents / maxThisMonth) * 100;
                const delta = prev > 0 ? ((cents - prev) / prev) * 100 : null;
                const isSelected = selected === c.name;
                return (
                  <li key={c.name}>
                    <button
                      onClick={() => setSelected(isSelected ? null : c.name)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition ${
                        isSelected ? "bg-card border border-foreground/40" : "hover:bg-card/60"
                      } ${cents === 0 ? "opacity-50" : ""}`}
                    >
                      <div className="flex items-center justify-between text-sm gap-3">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="flex items-center gap-3 shrink-0 text-xs">
                          {delta !== null && Math.abs(delta) >= 1 && (
                            <span className="text-muted tabular-nums">
                              {delta > 0 ? "+" : ""}
                              {delta.toFixed(0)}%
                            </span>
                          )}
                          <span className="tabular-nums font-medium text-foreground">{eur(cents)}</span>
                        </div>
                      </div>
                      <div className="mt-2 h-1 bg-line rounded-full overflow-hidden">
                        <div
                          className="h-full bg-foreground transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {nonSpend.length > 0 && (
            <>
              <h3 className="text-xs uppercase tracking-wide text-muted mt-6 mb-3">Money flow</h3>
              <ul className="space-y-1">
                {nonSpend.map((c) => (
                  <li
                    key={c.name}
                    className="flex items-center justify-between text-sm px-3 py-1.5 text-muted"
                  >
                    <span>{c.name}</span>
                    <span className="tabular-nums">{eur(c.monthly_cents[currentMonth] ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card p-6 min-w-0">
          {selected ? (
            <CategoryDrilldown
              category={selected}
              months={data.months}
              txs={txsInSelected}
              monthlySeries={data.categories.find((c) => c.name === selected)?.monthly_cents ?? {}}
              onChanged={async () => {
                await load();
                await loadTxs();
              }}
              onClose={() => setSelected(null)}
            />
          ) : (
            <div className="text-muted text-sm">
              Pick a category on the left to see its transactions and adjust where
              individual merchants are bucketed.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function CategoryDrilldown({
  category,
  months,
  txs,
  monthlySeries,
  onChanged,
  onClose,
}: {
  category: string;
  months: string[];
  txs: TxRow[];
  monthlySeries: Record<string, number>;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  // Group transactions in the visible month by merchant key
  const byMerchant = useMemo(() => {
    const m = new Map<string, { label: string; total: number; count: number; sampleTx: TxRow }>();
    for (const t of txs) {
      const key = merchantKeyClient(t);
      const label = t.creditorName ?? t.debtorName ?? t.memo ?? "(unknown)";
      const existing = m.get(key);
      const charge = t.amountCents < 0 ? -t.amountCents : t.amountCents;
      if (existing) {
        existing.total += charge;
        existing.count += 1;
      } else {
        m.set(key, { label, total: charge, count: 1, sampleTx: t });
      }
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [txs]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">{category}</h2>
        <button onClick={onClose} className="btn btn-ghost text-sm" aria-label="Close">✕</button>
      </div>

      {/* Sparkline-style mini history across the 6 months */}
      <div className="grid grid-cols-6 gap-2 mb-6">
        {[...months].reverse().map((m) => {
          const v = monthlySeries[m] ?? 0;
          const max = Math.max(1, ...months.map((mm) => monthlySeries[mm] ?? 0));
          return (
            <div key={m} className="flex flex-col items-center">
              <div className="w-full h-14 flex items-end">
                <div
                  className="w-full bg-foreground rounded-sm"
                  style={{ height: `${(v / max) * 100}%` }}
                />
              </div>
              <div className="text-[10px] text-muted mt-1 uppercase tracking-wide">{monthLabel(m)}</div>
              <div className="text-[10px] text-foreground/80 tabular-nums">{eur(v)}</div>
            </div>
          );
        })}
      </div>

      <h3 className="text-xs uppercase tracking-wide text-muted mb-3">Merchants this month</h3>
      {byMerchant.length === 0 ? (
        <p className="text-muted text-sm">Nothing this month.</p>
      ) : (
        <ul className="space-y-1">
          {byMerchant.map(([key, info]) => (
            <MerchantRow
              key={key}
              merchantKey={key}
              label={info.label}
              total={info.total}
              count={info.count}
              currentCategory={category}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function MerchantRow({
  merchantKey,
  label,
  total,
  count,
  currentCategory,
  onChanged,
}: {
  merchantKey: string;
  label: string;
  total: number;
  count: number;
  currentCategory: string;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function changeTo(newCat: string) {
    if (newCat === currentCategory) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/categories/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: merchantKey, category: newCat }),
      });
      if (!r.ok) {
        alert(await r.text());
        return;
      }
      await onChanged();
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center justify-between text-sm px-3 py-2 rounded hover:bg-card/60 group">
      <div className="min-w-0 flex-1 mr-3">
        <div className="truncate" title={label}>
          {label}
        </div>
        <div className="text-xs text-muted">
          {count} charge{count !== 1 ? "s" : ""}
        </div>
      </div>
      {editing ? (
        <select
          autoFocus
          defaultValue={currentCategory}
          disabled={busy}
          onChange={(e) => changeTo(e.target.value)}
          onBlur={() => !busy && setEditing(false)}
          className="px-2 py-1 rounded border border-line bg-card text-xs"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      ) : (
        <>
          <div className="tabular-nums whitespace-nowrap mr-3 text-foreground">{eur(total)}</div>
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-foreground transition px-1.5 py-0.5"
            title="Move to a different category"
          >
            Move ↓
          </button>
        </>
      )}
    </li>
  );
}
