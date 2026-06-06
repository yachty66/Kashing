"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/money";

type Invoice = {
  id: number; number: string; customerName: string | null; dueDate: string | null;
  currency: string; status: string; totalCents: number; amountPaidCents: number;
};

const today = () => new Date().toISOString().slice(0, 10);
function plusDaysISO(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function daysOverdue(due: string | null): number {
  if (!due || due >= today()) return 0;
  return Math.floor((Date.parse(today()) - Date.parse(due)) / 86_400_000);
}
function stage(d: number): string {
  if (d > 60) return "Final notice";
  if (d > 30) return "2nd reminder";
  if (d > 0) return "1st reminder";
  return "Pre-due";
}

export default function IncomingFollowups() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [upTo, setUpTo] = useState(plusDaysISO(14));
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<Record<number, string>>({});

  async function load() {
    const r = await fetch("/api/invoices");
    setInvoices(r.ok ? (await r.json()).invoices : []);
  }
  useEffect(() => { load(); }, []);

  const open = useMemo(
    () => (invoices ?? []).filter((i) => i.status === "sent" || i.status === "partly_paid"),
    [invoices],
  );
  const outstanding = (i: Invoice) => Number(i.totalCents) - Number(i.amountPaidCents);
  const overdue = open.filter((i) => daysOverdue(i.dueDate) > 0).sort((a, b) => daysOverdue(b.dueDate) - daysOverdue(a.dueDate));
  const upcoming = open.filter((i) => i.dueDate && i.dueDate >= today() && i.dueDate <= upTo);

  const followedUpValue = overdue.reduce((s, i) => s + outstanding(i), 0);
  const upcomingValue = upcoming.reduce((s, i) => s + outstanding(i), 0);

  async function chase(id: number) {
    setBusy(id);
    try {
      const r = await fetch(`/api/invoices/${id}/send`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      setMsg((m) => ({ ...m, [id]: r.ok ? `Sent to ${j.to}` : (j.error ?? "Failed") }));
    } finally {
      setBusy(null);
    }
  }

  if (invoices === null) return <div className="p-8 text-muted text-sm">Loading…</div>;

  return (
    <div className="p-8 w-full">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Incoming · Follow-ups</h1>
        <p className="text-muted text-sm mt-1">Overdue invoices to chase, with a one-tap FPS reminder.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-muted">In-scope (overdue) value</div>
          <div className="text-xl font-semibold tabular-nums mt-1 text-red-500">{money(followedUpValue, "HKD")}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Upcoming due by {upTo}</div>
          <div className="text-xl font-semibold tabular-nums mt-1">{money(upcomingValue, "HKD")}</div>
          <input type="date" value={upTo} onChange={(e) => setUpTo(e.target.value)} className="mt-2 w-full px-2 py-1 rounded border border-line bg-card text-xs" />
        </div>
      </div>

      <Section title="In scope — chase now" rows={overdue} outstanding={outstanding} busy={busy} msg={msg} chase={chase} showOverdue />
      <div className="h-6" />
      <Section title="Upcoming — due soon" rows={upcoming} outstanding={outstanding} busy={busy} msg={msg} chase={chase} />
    </div>
  );
}

function Section({ title, rows, outstanding, busy, msg, chase, showOverdue }: {
  title: string; rows: Invoice[]; outstanding: (i: Invoice) => number;
  busy: number | null; msg: Record<number, string>; chase: (id: number) => void; showOverdue?: boolean;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold mb-2">{title} <span className="text-muted font-normal">· {rows.length}</span></h2>
      {rows.length === 0 ? (
        <div className="card p-6 text-center text-muted text-sm">Nothing here.</div>
      ) : (
        <div className="card">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="bg-card"><tr className="text-muted text-left">
              <th className="font-medium px-4 py-3 border-b border-line">CUSTOMER</th>
              <th className="font-medium px-4 py-3 border-b border-line">INVOICE</th>
              <th className="font-medium px-4 py-3 border-b border-line">DUE</th>
              {showOverdue && <th className="font-medium px-4 py-3 border-b border-line">STAGE</th>}
              <th className="font-medium px-4 py-3 border-b border-line text-right">OUTSTANDING</th>
              <th className="font-medium px-4 py-3 border-b border-line text-right">ACTION</th>
            </tr></thead>
            <tbody>
              {rows.map((i) => {
                const d = daysOverdue(i.dueDate);
                return (
                  <tr key={i.id} className="hover:bg-foreground/[0.03]">
                    <td className="px-4 py-3 border-t border-line">{i.customerName ?? "—"}</td>
                    <td className="px-4 py-3 border-t border-line"><Link href={`/invoices/${i.id}`} className="underline decoration-line hover:decoration-foreground">{i.number}</Link></td>
                    <td className="px-4 py-3 border-t border-line text-muted tabular-nums">{i.dueDate ?? "—"}{d > 0 && <span className="text-red-500"> · {d}d</span>}</td>
                    {showOverdue && <td className="px-4 py-3 border-t border-line"><span className="pill">{stage(d)}</span></td>}
                    <td className="px-4 py-3 border-t border-line text-right tabular-nums">{money(outstanding(i), i.currency)}</td>
                    <td className="px-4 py-3 border-t border-line text-right whitespace-nowrap">
                      {msg[i.id] ? <span className="text-xs text-muted">{msg[i.id]}</span> : (
                        <button disabled={busy === i.id} onClick={() => chase(i.id)} className="btn btn-ghost text-sm disabled:opacity-60">{busy === i.id ? "Sending…" : "Chase"}</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
