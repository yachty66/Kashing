"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { NetWorthChart, type SnapshotPoint } from "@/components/NetWorthChart";

type Account = {
  id: number;
  name: string | null;
  iban: string | null;
  balanceCents: number | null;
  balanceUpdatedAt: string | null;
};
type Entry = { id: number; kind: string; name: string; valueCents: number; category: string | null };
type Snapshot = {
  ym: string;
  bankCents: number;
  manualAssetCents: number;
  liabilityCents: number;
  netCents: number;
};
type Totals = { bankCents: number; manualAssetCents: number; liabilityCents: number; netCents: number };
type Data = {
  empty: boolean;
  accounts: Account[];
  assets: Entry[];
  liabilities: Entry[];
  totals: Totals;
  snapshots: Snapshot[];
};

const eur = (cents: number) =>
  new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100);
const eur2 = (cents: number) =>
  new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(cents / 100);
const eurSigned = (cents: number) =>
  new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
    signDisplay: "always",
  }).format(cents / 100);

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
};

export default function NetWorthPage() {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | "asset" | "liability">(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/net-worth");
    if (!r.ok) return;
    setData(await r.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refreshBalances() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/net-worth/refresh", { method: "POST" });
      if (!r.ok) {
        setError(`Refresh failed: ${await r.text()}`);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteEntry(id: number) {
    await fetch(`/api/net-worth/items/${id}`, { method: "DELETE" });
    await load();
  }

  if (data === null) {
    return <div className="p-8 text-muted text-sm">Loading net worth…</div>;
  }

  // delta vs the previous month's snapshot (chart memory)
  const snaps = data.snapshots;
  const prev = snaps.length >= 2 ? snaps[snaps.length - 2] : null;
  const delta = prev ? data.totals.netCents - prev.netCents : null;
  const points: SnapshotPoint[] = snaps.map((s) => ({ ym: s.ym, netCents: s.netCents }));

  const hasBank = data.accounts.length > 0;

  return (
    <div className="p-8 max-w-6xl w-full">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Net worth</h1>
          <p className="text-sm text-muted mt-1">
            Every account balance plus what you own and owe, plotted over time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasBank && (
            <button onClick={refreshBalances} disabled={busy} className="btn btn-ghost border border-line disabled:opacity-60">
              {busy ? "Refreshing…" : "Refresh balances"}
            </button>
          )}
          <button onClick={() => setModal("asset")} className="btn btn-ghost border border-line">
            + Asset
          </button>
          <button onClick={() => setModal("liability")} className="btn btn-ghost border border-line">
            + Liability
          </button>
        </div>
      </header>

      {error && (
        <div className="card p-4 mb-6 text-sm text-foreground/90 border-foreground/30">{error}</div>
      )}

      {data.empty ? (
        <div className="card p-8 text-center">
          <h2 className="text-lg font-semibold">Nothing to total up yet</h2>
          <p className="text-muted text-sm mt-2 max-w-md mx-auto">
            Connect a bank to pull live balances, or add an asset or liability by hand. Even one
            checking account already draws the first point on your chart.
          </p>
          <div className="flex items-center justify-center gap-3 mt-5">
            <Link href="/subscriptions" className="btn btn-primary">
              Connect a bank
            </Link>
            <button onClick={() => setModal("asset")} className="btn btn-ghost border border-line">
              Add an asset
            </button>
          </div>
        </div>
      ) : (
        <>
          <section className="grid sm:grid-cols-3 gap-4 mb-8">
            <div className="card p-5">
              <div className="text-xs uppercase tracking-wide text-muted">Net worth</div>
              <div className="text-3xl font-semibold tracking-tight mt-2 tabular-nums">
                {eur(data.totals.netCents)}
              </div>
              <div className="mt-2 text-xs text-muted">
                {delta != null ? (
                  <>
                    <span className="text-foreground/80 tabular-nums">{eurSigned(delta)}</span> vs{" "}
                    {prev && monthLabel(prev.ym)}
                  </>
                ) : (
                  "First snapshot — come back next month to see the change."
                )}
              </div>
            </div>
            <div className="card p-5">
              <div className="text-xs uppercase tracking-wide text-muted">Assets</div>
              <div className="text-3xl font-semibold tracking-tight mt-2 tabular-nums">
                {eur(data.totals.bankCents + data.totals.manualAssetCents)}
              </div>
              <div className="mt-2 text-xs text-muted">
                {eur(data.totals.bankCents)} bank · {eur(data.totals.manualAssetCents)} manual
              </div>
            </div>
            <div className="card p-5">
              <div className="text-xs uppercase tracking-wide text-muted">Liabilities</div>
              <div className="text-3xl font-semibold tracking-tight mt-2 tabular-nums">
                {eur(data.totals.liabilityCents)}
              </div>
              <div className="mt-2 text-xs text-muted">
                {data.liabilities.length} entr{data.liabilities.length === 1 ? "y" : "ies"}
              </div>
            </div>
          </section>

          <section className="card p-6 mb-8">
            <h2 className="text-sm uppercase tracking-wide text-muted mb-4">Net worth over time</h2>
            <NetWorthChart points={points} />
          </section>

          <section className="grid lg:grid-cols-3 gap-6">
            <Panel title="Bank accounts" empty="No banks connected.">
              {data.accounts.map((a) => (
                <Row
                  key={a.id}
                  name={a.name ?? a.iban ?? `Account ${a.id}`}
                  sub={
                    a.balanceUpdatedAt
                      ? `updated ${new Date(a.balanceUpdatedAt).toLocaleDateString()}`
                      : a.balanceCents == null
                        ? "no balance yet — hit Refresh"
                        : undefined
                  }
                  value={a.balanceCents != null ? eur2(a.balanceCents) : "—"}
                />
              ))}
            </Panel>

            <Panel title="Assets" empty="No manual assets yet.">
              {data.assets.map((e) => (
                <Row
                  key={e.id}
                  name={e.name}
                  sub={e.category ?? undefined}
                  value={eur2(e.valueCents)}
                  onDelete={() => deleteEntry(e.id)}
                />
              ))}
            </Panel>

            <Panel title="Liabilities" empty="No liabilities yet.">
              {data.liabilities.map((e) => (
                <Row
                  key={e.id}
                  name={e.name}
                  sub={e.category ?? undefined}
                  value={`−${eur2(e.valueCents)}`}
                  onDelete={() => deleteEntry(e.id)}
                />
              ))}
            </Panel>
          </section>
        </>
      )}

      {modal && (
        <AddEntryModal
          kind={modal}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function Panel({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const items = Array.isArray(children) ? children : [children];
  const hasItems = items.some(Boolean) && items.length > 0;
  return (
    <div className="card p-5">
      <h3 className="text-sm uppercase tracking-wide text-muted mb-3">{title}</h3>
      {hasItems ? <div className="space-y-1">{children}</div> : <div className="text-sm text-muted">{empty}</div>}
    </div>
  );
}

function Row({
  name,
  sub,
  value,
  onDelete,
}: {
  name: string;
  sub?: string;
  value: string;
  onDelete?: () => void;
}) {
  return (
    <div className="group flex items-center justify-between gap-3 py-2 border-b border-line last:border-0">
      <div className="min-w-0">
        <div className="text-sm truncate" title={name}>
          {name}
        </div>
        {sub && <div className="text-xs text-muted truncate">{sub}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-sm tabular-nums">{value}</span>
        {onDelete && (
          <button
            onClick={onDelete}
            className="text-muted hover:text-foreground opacity-0 group-hover:opacity-100 transition text-xs"
            title="Delete"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function AddEntryModal({
  kind,
  onClose,
  onSaved,
}: {
  kind: "asset" | "liability";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const suggestions =
    kind === "asset"
      ? ["Savings", "Investment", "Property", "Crypto", "Cash", "Vehicle"]
      : ["Credit card", "Mortgage", "Loan", "Other debt"];

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/net-worth/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, name, valueEur: value, category }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? "Could not save");
        return;
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const canSave = name.trim() && value.trim() && isFinite(parseFloat(value)) && parseFloat(value) >= 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1">Add {kind}</h2>
        <p className="text-xs text-muted mb-4">
          {kind === "asset"
            ? "Something you own that the bank API can't see."
            : "Something you owe — counts against your net worth."}
        </p>

        <label className="block text-xs uppercase tracking-wide text-muted mb-1">Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={kind === "asset" ? "e.g. Trade Republic portfolio" : "e.g. Amex balance"}
          className="w-full rounded-lg border border-line px-3 py-2 text-sm mb-4"
        />

        <label className="block text-xs uppercase tracking-wide text-muted mb-1">Value (EUR)</label>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          className="w-full rounded-lg border border-line px-3 py-2 text-sm tabular-nums mb-4"
        />

        <label className="block text-xs uppercase tracking-wide text-muted mb-1">Category</label>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="optional"
          className="w-full rounded-lg border border-line px-3 py-2 text-sm mb-2"
        />
        <div className="flex flex-wrap gap-1.5 mb-4">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setCategory(s)}
              className={`pill ${category === s ? "pill-high" : ""}`}
            >
              {s}
            </button>
          ))}
        </div>

        {err && <div className="text-sm text-foreground/90 mb-3">{err}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={!canSave || saving} className="btn btn-primary disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
