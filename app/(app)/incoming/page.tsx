"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/money";

type Invoice = {
  id: number; number: string; customerName: string | null; issueDate: string;
  dueDate: string | null; currency: string; status: string; totalCents: number; amountPaidCents: number;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const firstOfYear = () => `${new Date().getFullYear()}-01-01`;
function plusDaysISO(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

type Status = "Completed" | "Upcoming" | "Overdue" | "—";
function rowStatus(inv: Invoice): Status {
  if (inv.status === "paid") return "Completed";
  if (inv.status === "draft" || inv.status === "void") return "—";
  if (inv.dueDate && inv.dueDate < todayISO()) return "Overdue";
  return "Upcoming";
}
const pill: Record<string, string> = { Completed: "pill-high", Upcoming: "pill-medium", Overdue: "pill-low" };

export default function IncomingOverview() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  // Box 1: real total wealth — chosen start → today (auto)
  const [wealthFrom, setWealthFrom] = useState(firstOfYear());
  // Box 2: incoming wealth — chosen start → chosen end
  const [incFrom, setIncFrom] = useState(todayISO());
  const [incTo, setIncTo] = useState(plusDaysISO(30));
  // List status filter
  const [filter, setFilter] = useState<"all" | "Completed" | "Upcoming" | "Overdue">("all");

  useEffect(() => {
    fetch("/api/invoices").then(async (r) => setInvoices(r.ok ? (await r.json()).invoices : []));
  }, []);

  const live = useMemo(() => (invoices ?? []).filter((i) => i.status !== "draft" && i.status !== "void"), [invoices]);

  // Box 1: sum of invoice values issued from the chosen date up to today.
  const realWealth = live
    .filter((i) => i.issueDate >= wealthFrom && i.issueDate <= todayISO())
    .reduce((s, i) => s + Number(i.totalCents), 0);

  // Box 2: sum of invoice values due within the chosen window (expected incoming).
  const incomingWealth = live
    .filter((i) => i.dueDate && i.dueDate >= incFrom && i.dueDate <= incTo)
    .reduce((s, i) => s + Number(i.totalCents), 0);

  const listed = filter === "all" ? live : live.filter((i) => rowStatus(i) === filter);

  if (invoices === null) return <div className="p-8 text-muted text-sm">Loading…</div>;

  return (
    <div className="p-8 w-full">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Incoming · Overview</h1>
          <p className="text-muted text-sm mt-1">Money owed to you and when it lands.</p>
        </div>
        <Link href="/invoices/new" className="btn btn-primary text-sm shrink-0">+ New invoice</Link>
      </header>

      {/* The two wealth boxes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide text-muted">Real total wealth as of {todayISO()}</div>
          <div className="text-3xl font-semibold tabular-nums mt-1">{money(realWealth, "HKD")}</div>
          <label className="mt-3 flex items-center gap-2 text-xs text-muted">
            <span>From</span>
            <input type="date" value={wealthFrom} max={todayISO()} onChange={(e) => setWealthFrom(e.target.value)}
              className="px-2 py-1 rounded border border-line bg-card text-xs" />
            <span>→ today</span>
          </label>
          <p className="text-[11px] text-muted mt-1">Total value of invoices issued in this range.</p>
        </div>

        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide text-muted">Incoming wealth as of chosen dates</div>
          <div className="text-3xl font-semibold tabular-nums mt-1">{money(incomingWealth, "HKD")}</div>
          <label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>From</span>
            <input type="date" value={incFrom} onChange={(e) => setIncFrom(e.target.value)} className="px-2 py-1 rounded border border-line bg-card text-xs" />
            <span>to</span>
            <input type="date" value={incTo} onChange={(e) => setIncTo(e.target.value)} className="px-2 py-1 rounded border border-line bg-card text-xs" />
          </label>
          <p className="text-[11px] text-muted mt-1">Total value of invoices due in this window.</p>
        </div>
      </div>

      {/* All incomings */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold">All incomings <span className="text-muted font-normal">· {listed.length}</span></h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="px-3 py-1.5 rounded-lg border border-line bg-card text-sm">
          <option value="all">All statuses</option>
          <option value="Completed">Completed</option>
          <option value="Upcoming">Upcoming</option>
          <option value="Overdue">Overdue</option>
        </select>
      </div>
      <div className="card">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="bg-card">
            <tr className="text-muted text-left">
              <th className="font-medium px-4 py-3 border-b border-line">FROM</th>
              <th className="font-medium px-4 py-3 border-b border-line">INVOICE</th>
              <th className="font-medium px-4 py-3 border-b border-line text-right">AMOUNT</th>
              <th className="font-medium px-4 py-3 border-b border-line">DUE DATE</th>
              <th className="font-medium px-4 py-3 border-b border-line">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {listed.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No invoices.</td></tr>
            ) : listed.map((i) => {
              const st = rowStatus(i);
              return (
                <tr key={i.id} className="hover:bg-foreground/[0.03]">
                  <td className="px-4 py-3 border-t border-line">{i.customerName ?? "—"}</td>
                  <td className="px-4 py-3 border-t border-line"><Link href={`/invoices/${i.id}`} className="underline decoration-line hover:decoration-foreground">{i.number}</Link></td>
                  <td className="px-4 py-3 border-t border-line text-right tabular-nums">{money(Number(i.totalCents), i.currency)}</td>
                  <td className="px-4 py-3 border-t border-line text-muted tabular-nums">{i.dueDate ?? "—"}</td>
                  <td className="px-4 py-3 border-t border-line"><span className={`pill ${pill[st] ?? ""}`}>{st}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
