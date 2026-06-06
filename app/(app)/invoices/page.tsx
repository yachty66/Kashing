"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  type DisplayStatus,
  displayStatus,
  fmtMoney,
  statusLabel,
  statusPillClass,
} from "@/lib/invoices";

type Row = {
  id: number;
  number: string;
  customerName: string | null;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  status: string;
  totalCents: number;
  amountPaidCents: number;
};

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "outstanding", label: "Outstanding" },
  { key: "overdue", label: "Overdue" },
  { key: "draft", label: "Draft" },
  { key: "paid", label: "Paid" },
];

export default function InvoicesPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/invoices");
      if (!r.ok) return setRows([]);
      setRows((await r.json()).invoices ?? []);
    })();
  }, []);

  const withStatus = useMemo(
    () => (rows ?? []).map((r) => ({ ...r, display: displayStatus(r) as DisplayStatus })),
    [rows],
  );

  const summary = useMemo(() => {
    let outstanding = 0;
    let overdue = 0;
    let paidThisMonth = 0;
    const ym = new Date().toISOString().slice(0, 7);
    for (const r of withStatus) {
      if (r.status === "void") continue;
      const due = Number(r.totalCents) - Number(r.amountPaidCents);
      if (r.display !== "paid" && r.display !== "draft") outstanding += due;
      if (r.display === "overdue") overdue += due;
      if (r.display === "paid" && r.issueDate.slice(0, 7) === ym) paidThisMonth += Number(r.totalCents);
    }
    return { outstanding, overdue, paidThisMonth };
  }, [withStatus]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withStatus.filter((r) => {
      if (filter === "outstanding" && (r.display === "paid" || r.display === "draft" || r.status === "void")) return false;
      if (filter === "overdue" && r.display !== "overdue") return false;
      if (filter === "draft" && r.display !== "draft") return false;
      if (filter === "paid" && r.display !== "paid") return false;
      if (!q) return true;
      return `${r.number} ${r.customerName ?? ""}`.toLowerCase().includes(q);
    });
  }, [withStatus, filter, query]);

  if (rows === null) return <div className="p-8 text-muted text-sm">Loading invoices…</div>;

  return (
    <div className="p-8 w-full">
      <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <div className="flex items-center gap-2">
          <Link href="/invoices/settings" className="btn btn-ghost text-sm">Settings</Link>
          <Link href="/invoices/new" className="btn btn-primary text-sm">New invoice</Link>
        </div>
      </header>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <SummaryCard label="Outstanding" value={fmtMoney(summary.outstanding)} />
        <SummaryCard label="Overdue" value={fmtMoney(summary.overdue)} />
        <SummaryCard label="Paid this month" value={fmtMoney(summary.paidThisMonth)} />
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                filter === f.key ? "bg-card text-foreground border border-line" : "text-muted hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search number or customer…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="px-3 py-2 rounded-lg border border-line bg-card text-sm w-64 focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-muted text-sm">
          {rows.length === 0 ? (
            <>No invoices yet. <Link href="/invoices/new" className="text-foreground underline">Create your first one</Link>.</>
          ) : (
            "No invoices match this filter."
          )}
        </div>
      ) : (
        <div className="card">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="text-muted text-left">
                <th className="font-medium px-4 py-3 border-b border-line">Number</th>
                <th className="font-medium px-4 py-3 border-b border-line">Customer</th>
                <th className="font-medium px-4 py-3 border-b border-line">Issued</th>
                <th className="font-medium px-4 py-3 border-b border-line">Due</th>
                <th className="font-medium px-4 py-3 border-b border-line text-right">Total</th>
                <th className="font-medium px-4 py-3 border-b border-line text-right">Paid</th>
                <th className="font-medium px-4 py-3 border-b border-line">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="align-top hover:bg-foreground/[0.03]">
                  <td className="px-4 py-2.5 border-t border-line whitespace-nowrap">
                    <Link href={`/invoices/${r.id}`} className="font-medium hover:underline">{r.number}</Link>
                  </td>
                  <td className="px-4 py-2.5 border-t border-line">{r.customerName || <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-2.5 border-t border-line text-muted whitespace-nowrap tabular-nums">{r.issueDate}</td>
                  <td className="px-4 py-2.5 border-t border-line text-muted whitespace-nowrap tabular-nums">{r.dueDate || "—"}</td>
                  <td className="px-4 py-2.5 border-t border-line text-right tabular-nums whitespace-nowrap">{fmtMoney(r.totalCents, r.currency)}</td>
                  <td className="px-4 py-2.5 border-t border-line text-right tabular-nums whitespace-nowrap text-muted">{fmtMoney(r.amountPaidCents, r.currency)}</td>
                  <td className="px-4 py-2.5 border-t border-line whitespace-nowrap">
                    <span className={statusPillClass(r.display)}>{statusLabel(r.display)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-muted mb-1">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
