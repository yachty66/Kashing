"use client";

import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/money";

type Bill = { id: number; supplierName: string | null; invoiceNumber: string | null; dueDate: string | null; amountCents: number; currency: string; status: string };
type Expense = { id: number; employee: string | null; amountCents: number | null; currency: string; merchant: string | null; expenseDate: string | null; status: string };

const today = () => new Date().toISOString().slice(0, 10);
function plusDaysISO(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
const pill: Record<string, string> = { Paid: "pill-high", Planned: "pill-medium", Overdue: "pill-low" };

type Row = { key: string; kind: string; to: string; ref: string; due: string | null; amountCents: number; currency: string; status: "Paid" | "Planned" | "Overdue" };

export default function OutgoingOverview() {
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [upTo, setUpTo] = useState(plusDaysISO(30));

  useEffect(() => {
    fetch("/api/bills").then(async (r) => setBills(r.ok ? (await r.json()).bills : []));
    fetch("/api/expenses").then(async (r) => setExpenses(r.ok ? (await r.json()).expenses : []));
  }, []);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const b of bills ?? []) {
      const status: Row["status"] = b.status === "paid" ? "Paid" : b.dueDate && b.dueDate < today() ? "Overdue" : "Planned";
      out.push({ key: `b${b.id}`, kind: "Supplier bill", to: b.supplierName ?? "—", ref: b.invoiceNumber ?? `BILL-${b.id}`, due: b.dueDate, amountCents: b.amountCents, currency: b.currency, status });
    }
    for (const e of expenses ?? []) {
      if (e.status === "pending" || e.status === "rejected") continue; // not yet a committed cost
      const status: Row["status"] = e.status === "reimbursed" ? "Paid" : "Planned";
      out.push({ key: `e${e.id}`, kind: "Employee expense", to: e.employee ?? "—", ref: e.merchant ?? `EXP-${e.id}`, due: e.expenseDate, amountCents: e.amountCents ?? 0, currency: e.currency, status });
    }
    return out.sort((a, b) => (b.due ?? "").localeCompare(a.due ?? ""));
  }, [bills, expenses]);

  const plannedUpTo = rows.filter((r) => r.status !== "Paid" && (!r.due || r.due <= upTo)).reduce((s, r) => s + r.amountCents, 0);
  const overdueTotal = rows.filter((r) => r.status === "Overdue").reduce((s, r) => s + r.amountCents, 0);
  const paidTotal = rows.filter((r) => r.status === "Paid").reduce((s, r) => s + r.amountCents, 0);

  if (bills === null || expenses === null) return <div className="p-8 text-muted text-sm">Loading…</div>;

  return (
    <div className="p-8 w-full">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Outgoing · Overview</h1>
        <p className="text-muted text-sm mt-1">What you owe — supplier bills and employee expenses.</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Planned out by {upTo}</div>
          <div className="text-xl font-semibold tabular-nums mt-1">{money(plannedUpTo, "HKD")}</div>
          <input type="date" value={upTo} onChange={(e) => setUpTo(e.target.value)} className="mt-2 w-full px-2 py-1 rounded border border-line bg-card text-xs" />
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Overdue</div>
          <div className={`text-xl font-semibold tabular-nums mt-1 ${overdueTotal > 0 ? "text-red-500" : ""}`}>{money(overdueTotal, "HKD")}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Paid (recorded)</div>
          <div className="text-xl font-semibold tabular-nums mt-1">{money(paidTotal, "HKD")}</div>
        </div>
      </div>

      <div className="card">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="bg-card"><tr className="text-muted text-left">
            <th className="font-medium px-4 py-3 border-b border-line">TYPE</th>
            <th className="font-medium px-4 py-3 border-b border-line">TO</th>
            <th className="font-medium px-4 py-3 border-b border-line">REF</th>
            <th className="font-medium px-4 py-3 border-b border-line">DUE</th>
            <th className="font-medium px-4 py-3 border-b border-line text-right">AMOUNT</th>
            <th className="font-medium px-4 py-3 border-b border-line">STATUS</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">Nothing outgoing yet.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.key} className="hover:bg-foreground/[0.03]">
                <td className="px-4 py-3 border-t border-line text-muted">{r.kind}</td>
                <td className="px-4 py-3 border-t border-line">{r.to}</td>
                <td className="px-4 py-3 border-t border-line text-muted">{r.ref}</td>
                <td className="px-4 py-3 border-t border-line text-muted tabular-nums">{r.due ?? "—"}</td>
                <td className="px-4 py-3 border-t border-line text-right tabular-nums">{money(r.amountCents, r.currency)}</td>
                <td className="px-4 py-3 border-t border-line"><span className={`pill ${pill[r.status]}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
