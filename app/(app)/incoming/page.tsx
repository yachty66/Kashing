"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/money";

type Invoice = {
  id: number; number: string; customerName: string | null; issueDate: string;
  dueDate: string | null; currency: string; status: string; totalCents: number; amountPaidCents: number;
};
type Week = { label: string; inCents: number; outCents: number; netCents: number; runningCents: number };
type Cashflow = { currentCashCents: number; weeks: Week[] };

const today = () => new Date().toISOString().slice(0, 10);
function plusDaysISO(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

function rowStatus(inv: Invoice): "Complete" | "Upcoming" | "Overdue" | "—" {
  if (inv.status === "paid") return "Complete";
  if (inv.status === "void" || inv.status === "draft") return "—";
  if (inv.dueDate && inv.dueDate < today()) return "Overdue";
  return "Upcoming";
}
const pill: Record<string, string> = {
  Complete: "pill-high", Upcoming: "pill-medium", Overdue: "pill-low",
};

export default function IncomingOverview() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [cash, setCash] = useState<Cashflow | null>(null);
  const [upTo, setUpTo] = useState(plusDaysISO(30));

  useEffect(() => {
    fetch("/api/invoices").then(async (r) => setInvoices(r.ok ? (await r.json()).invoices : []));
    fetch("/api/cashflow").then(async (r) => setCash(r.ok ? await r.json() : null));
  }, []);

  const open = useMemo(
    () => (invoices ?? []).filter((i) => i.status === "sent" || i.status === "partly_paid"),
    [invoices],
  );
  const outstanding = (i: Invoice) => Number(i.totalCents) - Number(i.amountPaidCents);
  const expectedUpTo = open.filter((i) => i.dueDate && i.dueDate <= upTo).reduce((s, i) => s + outstanding(i), 0);
  const overdueTotal = open.filter((i) => i.dueDate && i.dueDate < today()).reduce((s, i) => s + outstanding(i), 0);

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

      {/* Headline metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Cash now" value={cash ? money(cash.currentCashCents, "HKD") : "…"} />
        <Stat label={`Expected in by ${upTo}`} value={money(expectedUpTo, "HKD")}
          extra={<input type="date" value={upTo} onChange={(e) => setUpTo(e.target.value)}
            className="mt-2 w-full px-2 py-1 rounded border border-line bg-card text-xs" />} />
        <Stat label="Overdue" value={money(overdueTotal, "HKD")} accent={overdueTotal > 0}
          extra={<Link href="/incoming/followups" className="text-xs text-muted hover:text-foreground underline mt-2 inline-block">Chase →</Link>} />
        <Stat label="Projected in 4 weeks" value={cash ? money(cash.weeks[cash.weeks.length - 1]?.runningCents ?? cash.currentCashCents, "HKD") : "…"} />
      </div>

      {/* Invoices by status */}
      <div className="card mb-6">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="bg-card">
            <tr className="text-muted text-left">
              <th className="font-medium px-4 py-3 border-b border-line">FROM</th>
              <th className="font-medium px-4 py-3 border-b border-line">INVOICE</th>
              <th className="font-medium px-4 py-3 border-b border-line">DUE</th>
              <th className="font-medium px-4 py-3 border-b border-line text-right">AMOUNT</th>
              <th className="font-medium px-4 py-3 border-b border-line">STATUS</th>
            </tr>
          </thead>
          <tbody>
            {invoices.filter((i) => i.status !== "draft" && i.status !== "void").map((i) => {
              const st = rowStatus(i);
              return (
                <tr key={i.id} className="hover:bg-foreground/[0.03]">
                  <td className="px-4 py-3 border-t border-line">{i.customerName ?? "—"}</td>
                  <td className="px-4 py-3 border-t border-line"><Link href={`/invoices/${i.id}`} className="underline decoration-line hover:decoration-foreground">{i.number}</Link></td>
                  <td className="px-4 py-3 border-t border-line text-muted tabular-nums">{i.dueDate ?? "—"}</td>
                  <td className="px-4 py-3 border-t border-line text-right tabular-nums">{money(outstanding(i) > 0 ? outstanding(i) : Number(i.totalCents), i.currency)}</td>
                  <td className="px-4 py-3 border-t border-line"><span className={`pill ${pill[st] ?? ""}`}>{st}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Projection (folds the old cash-flow page) */}
      {cash && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-3">Cash projection · next 4 weeks</h2>
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead><tr className="text-muted text-left">
              <th className="font-medium py-2">WEEK</th><th className="font-medium py-2 text-right">IN</th>
              <th className="font-medium py-2 text-right">OUT</th><th className="font-medium py-2 text-right">PROJECTED BALANCE</th>
            </tr></thead>
            <tbody>
              {cash.weeks.map((w) => (
                <tr key={w.label}>
                  <td className="py-2 border-t border-line tabular-nums">{w.label}</td>
                  <td className="py-2 border-t border-line text-right tabular-nums">{w.inCents ? money(w.inCents, "HKD") : "—"}</td>
                  <td className="py-2 border-t border-line text-right tabular-nums">{w.outCents ? `(${money(w.outCents, "HKD")})` : "—"}</td>
                  <td className={`py-2 border-t border-line text-right tabular-nums font-medium ${w.runningCents < 0 ? "text-red-500" : ""}`}>{money(w.runningCents, "HKD")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, extra, accent }: { label: string; value: string; extra?: React.ReactNode; accent?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-xl font-semibold tabular-nums mt-1 ${accent ? "text-red-500" : ""}`}>{value}</div>
      {extra}
    </div>
  );
}
