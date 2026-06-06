"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/money";

type Week = { label: string; inCents: number; outCents: number; netCents: number; runningCents: number };
type Cashflow = { currentCashCents: number; weeks: Week[] };

export default function CashflowPage() {
  const [data, setData] = useState<Cashflow | null>(null);

  useEffect(() => {
    fetch("/api/cashflow").then(async (r) => setData(r.ok ? await r.json() : null));
  }, []);

  if (data === null) return <div className="p-8 text-muted text-sm">Loading…</div>;

  const low = data.weeks.find((w) => w.runningCents < 0);

  return (
    <div className="p-8 w-full">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Cash flow</h1>
        <p className="text-muted text-sm mt-1">Next 4 weeks: money expected in (invoices due) vs out (bills + reimbursements).</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide text-muted">Cash now</div>
          <div className="text-2xl font-semibold tabular-nums mt-1">{money(data.currentCashCents, "HKD")}</div>
        </div>
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide text-muted">Projected in 4 weeks</div>
          <div className="text-2xl font-semibold tabular-nums mt-1">{money(data.weeks[data.weeks.length - 1]?.runningCents ?? data.currentCashCents, "HKD")}</div>
        </div>
      </div>

      {low && (
        <div className="card p-4 mb-6 border border-foreground">
          <span className="font-medium">Heads up:</span>{" "}
          <span className="text-muted">projected balance goes negative the week of {low.label} ({money(low.runningCents, "HKD")}). Chase overdue invoices or delay outgoing payments.</span>
        </div>
      )}

      <div className="card">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="bg-card">
            <tr className="text-muted text-left">
              <th className="font-medium px-4 py-3 border-b border-line">WEEK OF</th>
              <th className="font-medium px-4 py-3 border-b border-line text-right">IN</th>
              <th className="font-medium px-4 py-3 border-b border-line text-right">OUT</th>
              <th className="font-medium px-4 py-3 border-b border-line text-right">NET</th>
              <th className="font-medium px-4 py-3 border-b border-line text-right">PROJECTED BALANCE</th>
            </tr>
          </thead>
          <tbody>
            {data.weeks.map((w) => (
              <tr key={w.label}>
                <td className="px-4 py-3 border-t border-line tabular-nums">{w.label}</td>
                <td className="px-4 py-3 border-t border-line text-right tabular-nums">{w.inCents ? money(w.inCents, "HKD") : "—"}</td>
                <td className="px-4 py-3 border-t border-line text-right tabular-nums">{w.outCents ? `(${money(w.outCents, "HKD")})` : "—"}</td>
                <td className={`px-4 py-3 border-t border-line text-right tabular-nums ${w.netCents < 0 ? "text-red-500" : ""}`}>{money(w.netCents, "HKD")}</td>
                <td className={`px-4 py-3 border-t border-line text-right tabular-nums font-medium ${w.runningCents < 0 ? "text-red-500" : ""}`}>{money(w.runningCents, "HKD")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
