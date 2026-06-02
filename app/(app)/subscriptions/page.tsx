"use client";

import { useCallback, useEffect, useState } from "react";
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
type Obligation = { name: string; monthly_amount_eur: number; type: string };
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

export default function SubscriptionsPage() {
  const [data, setData] = useState<AnalysisResp | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<null | "refresh" | "disconnect">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Subscriptions</h1>
          <p className="text-muted text-sm mb-6 leading-relaxed">
            Connect a European bank to import transactions. We use Claude to
            surface every recurring charge — including the ones bank apps and
            Finanzguru miss. Read-only via GoCardless; your bank password never
            touches this app.
          </p>
          <button onClick={() => setPickerOpen(true)} className="btn btn-primary">
            Connect a bank
          </button>
        </section>
      ) : (
        <>
          <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Your subscriptions</h1>
              <p className="text-sm text-muted mt-1">
                {accounts.length} account{accounts.length !== 1 ? "s" : ""} connected
                {a && (
                  <>
                    {" · "}
                    {eur(a.summary?.monthly_subscription_total_eur)}/mo in subscriptions
                    {" · "}
                    {eur(a.summary?.monthly_obligation_total_eur)}/mo in obligations
                  </>
                )}
                {data?.generated_at && (
                  <> · last analyzed {new Date(data.generated_at).toLocaleString()}</>
                )}
              </p>
            </div>
            <div className="flex gap-3 items-center">
              <button onClick={refresh} disabled={busy === "refresh"} className="btn btn-primary disabled:opacity-60">
                {busy === "refresh" ? "Analyzing…" : "Pull & analyze"}
              </button>
              <button onClick={() => setAddOpen(true)} className="btn btn-ghost text-sm">+ Add subscription</button>
              <button onClick={() => setPickerOpen(true)} className="btn btn-ghost text-sm">+ Add bank</button>
              <button onClick={disconnect} disabled={busy === "disconnect"} className="btn btn-ghost text-sm">
                Disconnect all
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
                <h2 className="text-lg font-semibold mb-3">Subscriptions</h2>
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead>
                    <tr className="text-muted text-left">
                      <th className="font-medium pb-3 pr-6">Service</th>
                      <th className="font-medium pb-3 pr-6 text-right whitespace-nowrap">€/mo</th>
                      <th className="font-medium pb-3 pr-6">Conf</th>
                      <th className="font-medium pb-3">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...a.subscriptions]
                      .sort((x, y) => (y.monthly_amount_eur || 0) - (x.monthly_amount_eur || 0))
                      .map((s, i) => (
                        <tr key={i} className="align-top group">
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
                                <div className="text-muted text-xs mt-0.5">{s.category}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-6 border-t border-line text-right tabular-nums font-medium whitespace-nowrap">
                            {eur(s.monthly_amount_eur)}
                          </td>
                          <td className="py-3 pr-6 border-t border-line whitespace-nowrap">
                            <span className={`pill pill-${s.confidence || "low"}`}>{s.confidence}</span>
                          </td>
                          <td className="py-3 pr-2 border-t border-line text-muted text-xs max-w-[20rem]">{s.evidence}</td>
                          <td className="py-3 border-t border-line text-right">
                            <button
                              onClick={() => dismissSub(s)}
                              title={s.manual ? "Remove" : "Dismiss"}
                              aria-label={s.manual ? "Remove subscription" : "Dismiss subscription"}
                              className="text-muted opacity-0 group-hover:opacity-100 hover:text-foreground transition px-2 py-1 text-sm"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>

                {a.recurring_obligations?.length > 0 && (
                  <>
                    <h2 className="text-lg font-semibold mt-8 mb-3">Other recurring (not subs)</h2>
                    <table className="w-full text-sm border-separate border-spacing-0">
                      <thead>
                        <tr className="text-muted text-left">
                          <th className="font-medium pb-3 pr-6">Item</th>
                          <th className="font-medium pb-3 pr-6 text-right whitespace-nowrap">€/mo</th>
                          <th className="font-medium pb-3">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.recurring_obligations.map((o, i) => (
                          <tr key={i}>
                            <td className="py-3 pr-6 border-t border-line">{o.name}</td>
                            <td className="py-3 pr-6 border-t border-line text-right tabular-nums whitespace-nowrap">
                              {eur(o.monthly_amount_eur)}
                            </td>
                            <td className="py-3 border-t border-line"><span className="pill">{o.type}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
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
