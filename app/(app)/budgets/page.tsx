"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type CategoryRow = {
  category: string;
  capCents: number | null;
  spentCents: number;
  suggestedCapCents: number;
};

type BudgetsResp =
  | { accounts: number; empty: true }
  | { accounts: number; empty: false; thisMonth: string; categories: CategoryRow[] };

const eur = (cents: number) =>
  new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const monthLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
};

export default function BudgetsPage() {
  const [data, setData] = useState<BudgetsResp | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/budgets");
    if (!r.ok) return;
    setData(await r.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function save(category: string, eurAmount: number) {
    setBusy(true);
    try {
      await fetch("/api/budgets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, monthlyCapCents: Math.round(eurAmount * 100) }),
      });
      await load();
      setEditing(null);
    } finally {
      setBusy(false);
    }
  }

  async function remove(category: string) {
    setBusy(true);
    try {
      await fetch(`/api/budgets?category=${encodeURIComponent(category)}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function applyAllSuggested() {
    if (!data || data.empty) return;
    const targets = data.categories.filter((c) => c.capCents == null && c.suggestedCapCents > 0);
    if (targets.length === 0) return;
    setBusy(true);
    try {
      for (const c of targets) {
        await fetch("/api/budgets", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: c.category, monthlyCapCents: c.suggestedCapCents }),
        });
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  const totals = useMemo(() => {
    if (!data || data.empty) return null;
    const withCap = data.categories.filter((c) => c.capCents != null);
    const totalCap = withCap.reduce((a, c) => a + (c.capCents ?? 0), 0);
    const totalSpent = withCap.reduce((a, c) => a + c.spentCents, 0);
    const overCount = withCap.filter((c) => (c.capCents ?? 0) > 0 && c.spentCents > (c.capCents ?? 0)).length;
    return { totalCap, totalSpent, overCount, setCount: withCap.length };
  }, [data]);

  if (data === null) {
    return <div className="p-8 text-muted text-sm">Loading budgets…</div>;
  }

  if (data.empty) {
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight mb-3">Budgets</h1>
        <p className="text-muted text-sm mb-6">
          {data.accounts === 0
            ? "Connect a bank first — budgets need transactions to track against."
            : "No transactions yet. Pull them from your connected account."}
        </p>
        <Link href="/subscriptions" className="btn btn-primary">
          {data.accounts === 0 ? "Connect a bank" : "Go to Subscriptions to pull"}
        </Link>
      </div>
    );
  }

  // Sort: budgets with caps first (over-budget first), then unbudgeted with spend, then empty
  const sorted = [...data.categories].sort((a, b) => {
    const aOver = a.capCents != null && a.spentCents > a.capCents ? 1 : 0;
    const bOver = b.capCents != null && b.spentCents > b.capCents ? 1 : 0;
    if (aOver !== bOver) return bOver - aOver;
    const aHas = a.capCents != null ? 1 : 0;
    const bHas = b.capCents != null ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return b.spentCents - a.spentCents;
  });

  const hasAnySuggested = sorted.some((c) => c.capCents == null && c.suggestedCapCents > 0);

  return (
    <div className="p-8 max-w-5xl w-full">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Budgets</h1>
          <p className="text-sm text-muted mt-1">
            {monthLabel(data.thisMonth)}
            {totals && totals.setCount > 0 && (
              <>
                {" · "}
                {eur(totals.totalSpent)} of {eur(totals.totalCap)} spent across {totals.setCount} categor
                {totals.setCount === 1 ? "y" : "ies"}
                {totals.overCount > 0 && <> · {totals.overCount} over</>}
              </>
            )}
          </p>
        </div>
        {hasAnySuggested && totals && totals.setCount === 0 && (
          <button onClick={applyAllSuggested} disabled={busy} className="btn btn-primary text-sm">
            Apply auto-suggested budgets
          </button>
        )}
      </header>

      <div className="space-y-3">
        {sorted.map((c) => (
          <BudgetRow
            key={c.category}
            row={c}
            editing={editing === c.category}
            draft={draft}
            busy={busy}
            onEdit={() => {
              setEditing(c.category);
              setDraft(
                c.capCents != null
                  ? String(c.capCents / 100)
                  : c.suggestedCapCents > 0
                    ? String(c.suggestedCapCents / 100)
                    : "",
              );
            }}
            onCancel={() => setEditing(null)}
            onDraftChange={setDraft}
            onSave={() => {
              const n = parseFloat(draft.replace(",", "."));
              if (!isFinite(n) || n < 0) return;
              save(c.category, n);
            }}
            onRemove={() => remove(c.category)}
            onAcceptSuggestion={() => save(c.category, c.suggestedCapCents / 100)}
          />
        ))}
      </div>

      <p className="text-xs text-muted mt-8 leading-relaxed max-w-2xl">
        Categories are inferred from merchant names. When LLM categorization
        lands, accuracy improves and the &quot;Other&quot; bucket shrinks. Budgets
        ignore incoming amounts and internal transfers.
      </p>
    </div>
  );
}

function BudgetRow({
  row,
  editing,
  draft,
  busy,
  onEdit,
  onCancel,
  onDraftChange,
  onSave,
  onRemove,
  onAcceptSuggestion,
}: {
  row: CategoryRow;
  editing: boolean;
  draft: string;
  busy: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onDraftChange: (v: string) => void;
  onSave: () => void;
  onRemove: () => void;
  onAcceptSuggestion: () => void;
}) {
  const hasBudget = row.capCents != null && row.capCents > 0;
  const pct = hasBudget ? Math.min(999, Math.round((row.spentCents / (row.capCents as number)) * 100)) : null;
  const over = hasBudget && row.spentCents > (row.capCents as number);
  const approaching = hasBudget && !over && pct !== null && pct >= 80;

  return (
    <div className={`card p-5 ${over ? "border-foreground/60" : ""}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="font-semibold">{row.category}</div>
          <div className="text-xs text-muted mt-1 tabular-nums">
            {hasBudget ? (
              <>
                {eur(row.spentCents)} of {eur(row.capCents as number)}
                {pct !== null && <> · {pct}%</>}
                {over && <> · over by {eur(row.spentCents - (row.capCents as number))}</>}
                {approaching && <> · approaching cap</>}
              </>
            ) : row.spentCents > 0 ? (
              <>{eur(row.spentCents)} spent · no budget set</>
            ) : (
              <>No spend this month</>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {!editing && row.capCents == null && row.suggestedCapCents > 0 && (
            <button onClick={onAcceptSuggestion} disabled={busy} className="text-xs text-foreground/80 underline">
              Suggest {eur(row.suggestedCapCents)}
            </button>
          )}
          {!editing ? (
            <button onClick={onEdit} className="text-xs text-foreground/80 underline">
              {hasBudget ? "Edit cap" : "Set cap"}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">€/mo</span>
              <input
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSave();
                  if (e.key === "Escape") onCancel();
                }}
                autoFocus
                inputMode="decimal"
                className="w-24 bg-transparent border border-line rounded px-2 py-1 text-sm tabular-nums"
                placeholder="300"
              />
              <button onClick={onSave} disabled={busy} className="btn btn-primary text-xs px-3 py-1">
                Save
              </button>
              <button onClick={onCancel} className="text-xs text-foreground/80 underline">
                Cancel
              </button>
              {hasBudget && (
                <button onClick={onRemove} disabled={busy} className="text-xs text-foreground/60 underline">
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {hasBudget && (
        <div className="mt-4">
          <div className="h-2 w-full bg-foreground/10 rounded overflow-hidden">
            <div
              className={`h-full ${over ? "bg-foreground" : "bg-foreground/70"}`}
              style={{ width: `${Math.min(100, pct ?? 0)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
