"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { AddSubscriptionModal } from "@/components/AddSubscriptionModal";
import { BankPicker } from "@/components/BankPicker";
import { Logo } from "@/components/Logo";
import { SubscriptionCalendar } from "@/components/SubscriptionCalendar";

type Account = { id: number; iban: string | null; name: string | null; last_pull_at: string | null };
type Subscription = {
  name: string;
  merchant_strings?: string[];
  monthly_amount_eur: number;
  cadence?: string;
  confidence?: "high" | "medium" | "low";
  evidence?: string;
  category?: string;
  domain?: string;
  manual?: boolean;
  manual_id?: number;
};
type Obligation = { name: string; monthly_amount_eur: number; type: string; evidence?: string };
type Analysis = {
  subscriptions: Subscription[];
  recurring_obligations: Obligation[];
  summary: {
    monthly_subscription_total_eur: number;
    monthly_obligation_total_eur: number;
    subscription_count: number;
  };
};
type AnalysisResp = {
  accounts: Account[];
  analysis: Analysis | null;
  brief: string | null;
  generated_at: string | null;
};

const eur = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n || 0);

const eur0 = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-EU", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n || 0);

/** Relative-ish timestamp for the "last synced" line — short and unambiguous. */
function syncedAt(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const ms = now.getTime() - then.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24 && now.getDate() === then.getDate()) return `today at ${then.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SubscriptionsPage() {
  const [data, setData] = useState<AnalysisResp | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<null | "refresh" | "disconnect">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleExpand(name: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const load = useCallback(async () => {
    const r = await fetch("/api/analysis");
    if (!r.ok) return;
    setData(await r.json());
  }, []);

  useEffect(() => {
    load();
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected")) setNotice("Bank connected. Hit Pull & analyze.");
    const err = params.get("error");
    if (err) setError(err);
    if (params.get("connected") || err) {
      // clear the query string so refreshing doesn't keep showing it
      window.history.replaceState({}, "", "/subscriptions");
    }
  }, [load]);

  async function refresh() {
    setBusy("refresh");
    setError(null);
    try {
      const r = await fetch("/api/refresh", { method: "POST" });
      if (!r.ok) {
        setError(`Refresh failed: ${await r.text()}`);
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function dismissSub(s: Subscription) {
    if (s.manual && s.manual_id != null) {
      // Manual addition — delete the row entirely
      await fetch(`/api/subscriptions/added/${s.manual_id}`, { method: "DELETE" });
    } else {
      await fetch("/api/subscriptions/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: s.name, merchant_strings: s.merchant_strings ?? [] }),
      });
    }
    await load();
  }

  async function disconnect() {
    if (!confirm("Disconnect every bank and wipe all transactions?")) return;
    setBusy("disconnect");
    try {
      await fetch("/api/disconnect", { method: "POST" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const accounts = data?.accounts ?? [];
  const a = data?.analysis;
  const hasAccounts = accounts.length > 0;

  return (
    <div className="p-8 w-full">
      {notice && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-card border border-line text-foreground text-sm">{notice}</div>
      )}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-card border border-foreground text-foreground text-sm">
          {error === "not_linked"
            ? "Consent wasn't completed at your bank. Try Connect again."
            : `Error: ${error}`}
        </div>
      )}

      {!hasAccounts ? (
        <section className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Contracts</h1>
          <p className="text-muted text-sm mb-6 leading-relaxed">
            Connect a European bank to import transactions. We use Claude to
            surface every recurring charge — subscriptions, rent, loans,
            insurance — including the ones bank apps and Finanzguru miss.
            Read-only via GoCardless; your bank password never touches this app.
          </p>
          <button onClick={() => setPickerOpen(true)} className="btn btn-primary">
            Connect a bank
          </button>
        </section>
      ) : (
        <>
          <header className="mb-8 flex items-end justify-between flex-wrap gap-6">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.14em] text-muted">Your contracts</div>
              <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                <span className="text-4xl font-semibold tracking-tight tabular-nums">
                  {eur(
                    (a?.summary?.monthly_subscription_total_eur ?? 0) +
                      (a?.summary?.monthly_obligation_total_eur ?? 0),
                  )}
                </span>
                <span className="text-muted text-sm">/ month committed</span>
              </div>
              <div className="mt-3 text-xs text-muted flex items-center gap-2 flex-wrap">
                {a && (
                  <>
                    <span>
                      <span className="text-foreground/90 tabular-nums">{eur0(a.summary?.monthly_subscription_total_eur)}</span>{" "}
                      subscriptions
                    </span>
                    {(a.summary?.monthly_obligation_total_eur ?? 0) > 0 && (
                      <>
                        <Dot />
                        <span>
                          <span className="text-foreground/90 tabular-nums">{eur0(a.summary?.monthly_obligation_total_eur)}</span>{" "}
                          fixed (rent, loans, insurance)
                        </span>
                      </>
                    )}
                    <Dot />
                  </>
                )}
                <span>
                  <span className="text-foreground/90 tabular-nums">{accounts.length}</span>{" "}
                  account{accounts.length !== 1 ? "s" : ""}
                </span>
                {data?.generated_at && (
                  <>
                    <Dot />
                    <span>synced {syncedAt(data.generated_at)}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2 items-center shrink-0">
              <button onClick={refresh} disabled={busy === "refresh"} className="btn btn-primary disabled:opacity-60">
                {busy === "refresh" ? "Analyzing…" : "Pull & analyze"}
              </button>
              <button onClick={() => setAddOpen(true)} className="btn btn-ghost text-sm">+ Contract</button>
              <button onClick={() => setPickerOpen(true)} className="btn btn-ghost text-sm">+ Bank</button>
              <button onClick={disconnect} disabled={busy === "disconnect"} className="btn btn-ghost text-sm">
                Disconnect
              </button>
            </div>
          </header>

          {!a ? (
            <div className="card p-8 text-foreground/80">
              No analysis yet. Hit <strong>Pull &amp; analyze</strong> to fetch transactions and run the detector.
              <span className="block mt-2 text-sm text-muted">First run can take up to ~5 minutes.</span>
            </div>
          ) : (
            <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-6 w-full">
              <div className="card p-6 min-w-0 overflow-hidden">
                <h2 className="text-lg font-semibold mb-3">All contracts</h2>
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead>
                    <tr className="text-muted text-left">
                      <th className="font-medium pb-3 pr-6">Contract</th>
                      <th className="font-medium pb-3 pr-6 text-right whitespace-nowrap">€/mo</th>
                      <th className="font-medium pb-3 pr-6">Type</th>
                      <th className="font-medium pb-3 w-8" aria-label="row actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ...a.subscriptions.map((s) => ({ ...s, _kind: "subscription" as const })),
                      ...a.recurring_obligations.map((o) => ({
                        name: o.name,
                        monthly_amount_eur: o.monthly_amount_eur,
                        category: o.type,
                        confidence: "high" as const,
                        evidence: o.evidence,
                        merchant_strings: undefined as string[] | undefined,
                        domain: undefined as string | undefined,
                        manual: false,
                        manual_id: undefined as number | undefined,
                        _kind: "obligation" as const,
                      })),
                    ]
                      .sort((x, y) => (y.monthly_amount_eur || 0) - (x.monthly_amount_eur || 0))
                      .map((s, i) => {
                        const isObligation = s._kind === "obligation";
                        const isOpen = expanded.has(s.name);
                        const evidence = s.evidence?.replace(/\s*[—–]\s*/g, ", ");
                        const hasDetail = !!evidence || (s.merchant_strings && s.merchant_strings.length > 0);
                        return (
                          <Fragment key={`${s._kind}-${i}`}>
                            <tr
                              className={`align-top group ${hasDetail ? "cursor-pointer hover:bg-foreground/[0.03]" : ""}`}
                              onClick={(e) => {
                                if (!hasDetail) return;
                                if ((e.target as HTMLElement).closest('[data-row-action]')) return;
                                toggleExpand(s.name);
                              }}
                            >
                              <td className="py-3 pr-6 border-t border-line">
                                <div className="flex items-center gap-3">
                                  <Logo domain={s.domain} name={s.name} size={28} />
                                  <div className="min-w-0">
                                    <div className="font-semibold truncate flex items-center gap-2">
                                      {s.name}
                                      {s.manual && (
                                        <span className="pill text-[9px] leading-tight">manual</span>
                                      )}
                                    </div>
                                    <div className="text-muted text-xs mt-0.5">
                                      {isObligation ? "fixed obligation" : "subscription"}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 pr-6 border-t border-line text-right tabular-nums font-medium whitespace-nowrap">
                                {eur(s.monthly_amount_eur)}
                              </td>
                              <td className="py-3 pr-6 border-t border-line whitespace-nowrap">
                                <span className="pill text-[10px]">{s.category ?? "other"}</span>
                              </td>
                              <td className="py-3 border-t border-line text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1">
                                  {!isObligation && (
                                    <button
                                      data-row-action
                                      onClick={(e) => { e.stopPropagation(); dismissSub(s as Subscription); }}
                                      title={s.manual ? "Remove" : "Dismiss"}
                                      aria-label={s.manual ? "Remove subscription" : "Dismiss subscription"}
                                      className="text-muted opacity-0 group-hover:opacity-100 hover:text-foreground transition px-1.5 py-1 text-sm"
                                    >
                                      ✕
                                    </button>
                                  )}
                                  {hasDetail && (
                                    <svg
                                      width="14"
                                      height="14"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      aria-hidden
                                      className={`text-foreground/60 group-hover:text-foreground transition duration-150 ${
                                        isOpen ? "rotate-180" : ""
                                      }`}
                                    >
                                      <path d="M6 9l6 6 6-6" />
                                    </svg>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {isOpen && hasDetail && (
                              <tr>
                                <td colSpan={4} className="border-t border-line/30 px-3 pb-4 pt-2">
                                  <div className="pl-[44px] max-w-2xl space-y-2">
                                    {evidence && (
                                      <p className="text-sm text-foreground/85 leading-relaxed">{evidence}</p>
                                    )}
                                    {s.merchant_strings && s.merchant_strings.length > 0 && (
                                      <div className="flex flex-wrap gap-1.5">
                                        {s.merchant_strings.map((m, j) => (
                                          <span key={j} className="pill text-[10px]" title="raw merchant string">
                                            {m}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                  </tbody>
                </table>

              </div>

              <SubscriptionCalendar />
            </div>
          )}
        </>
      )}

      {pickerOpen && <BankPicker onClose={() => setPickerOpen(false)} />}
      {addOpen && <AddSubscriptionModal onClose={() => setAddOpen(false)} onAdded={load} />}
    </div>
  );
}

function Dot() {
  return <span className="text-muted/40" aria-hidden>·</span>;
}
