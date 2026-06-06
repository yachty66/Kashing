"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/money";

type Expense = {
  id: number; employee: string | null; amountCents: number | null; currency: string; merchant: string | null;
  brNumber: string | null; category: string | null; expenseDate: string | null; receiptUrl: string | null;
  status: string; reimbursementTxId: number | null; createdAt: string;
};
type Bill = { id: number; supplierName: string | null; invoiceNumber: string | null; dueDate: string | null; amountCents: number; currency: string; status: string };

export default function OutgoingLogs() {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [bills, setBills] = useState<Bill[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [e, b] = await Promise.all([fetch("/api/expenses"), fetch("/api/bills")]);
    setExpenses(e.ok ? (await e.json()).expenses : []);
    setBills(b.ok ? (await b.json()).bills : []);
  }
  useEffect(() => { load(); }, []);

  async function decide(id: number, action: string) {
    setBusy(`e${id}`);
    try {
      await fetch(`/api/expenses/${id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      await load();
    } finally { setBusy(null); }
  }
  async function payBill(id: number) {
    setBusy(`b${id}`);
    try {
      await fetch(`/api/bills/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "paid" }) });
      await load();
    } finally { setBusy(null); }
  }

  if (expenses === null || bills === null) return <div className="p-8 text-muted text-sm">Loading…</div>;

  const pending = expenses.filter((e) => e.status === "pending");
  const toReimburse = expenses.filter((e) => e.status === "approved");
  const unpaidBills = bills.filter((b) => b.status === "unpaid");
  const toValidate = pending.length + toReimburse.length + unpaidBills.length;

  return (
    <div className="p-8 w-full">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Outgoing · Logs</h1>
        <p className="text-muted text-sm mt-1">{toValidate} item(s) to validate, plus the full audit log (kept 7 years).</p>
      </header>

      {pending.length > 0 && (
        <Block title={`Expense claims to review · ${pending.length}`}>
          {pending.map((e) => (
            <Row key={e.id} left={`${e.employee ?? "—"} · ${e.merchant ?? "—"}`} mid={e.category ?? ""} amount={money(e.amountCents, e.currency)}
              receipt={e.receiptUrl}
              actions={<>
                <button disabled={busy === `e${e.id}`} onClick={() => decide(e.id, "approve")} className="btn btn-primary text-sm disabled:opacity-60">Approve</button>
                <button disabled={busy === `e${e.id}`} onClick={() => decide(e.id, "reject")} className="btn btn-ghost text-sm disabled:opacity-60">Reject</button>
              </>} />
          ))}
        </Block>
      )}

      {toReimburse.length > 0 && (
        <Block title={`Approved — ready to reimburse · ${toReimburse.length}`}>
          {toReimburse.map((e) => (
            <Row key={e.id} left={`${e.employee ?? "—"} · ${e.merchant ?? "—"}`} mid={e.category ?? ""} amount={money(e.amountCents, e.currency)}
              receipt={e.receiptUrl}
              actions={<button disabled={busy === `e${e.id}`} onClick={() => decide(e.id, "reimburse")} className="btn btn-primary text-sm disabled:opacity-60">Reimburse via FPS</button>} />
          ))}
        </Block>
      )}

      {unpaidBills.length > 0 && (
        <Block title={`Supplier bills to pay · ${unpaidBills.length}`}>
          {unpaidBills.map((b) => (
            <Row key={b.id} left={b.supplierName ?? "—"} mid={`${b.invoiceNumber ?? `BILL-${b.id}`}${b.dueDate ? ` · due ${b.dueDate}` : ""}`} amount={money(b.amountCents, b.currency)}
              actions={<button disabled={busy === `b${b.id}`} onClick={() => payBill(b.id)} className="btn btn-primary text-sm disabled:opacity-60">Pay via FPS</button>} />
          ))}
        </Block>
      )}

      {/* Full log / audit archive */}
      <h2 className="text-sm font-semibold mb-2 mt-8">Log · all expense claims</h2>
      <div className="card">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="bg-card"><tr className="text-muted text-left">
            <th className="font-medium px-4 py-3 border-b border-line">DATE</th>
            <th className="font-medium px-4 py-3 border-b border-line">EMPLOYEE</th>
            <th className="font-medium px-4 py-3 border-b border-line">MERCHANT</th>
            <th className="font-medium px-4 py-3 border-b border-line">BRN</th>
            <th className="font-medium px-4 py-3 border-b border-line text-right">AMOUNT</th>
            <th className="font-medium px-4 py-3 border-b border-line">STATUS</th>
            <th className="font-medium px-4 py-3 border-b border-line">RECEIPT</th>
          </tr></thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="hover:bg-foreground/[0.03]">
                <td className="px-4 py-3 border-t border-line text-muted tabular-nums whitespace-nowrap">{e.expenseDate ?? e.createdAt.slice(0, 10)}</td>
                <td className="px-4 py-3 border-t border-line">{e.employee ?? "—"}</td>
                <td className="px-4 py-3 border-t border-line">{e.merchant ?? "—"}</td>
                <td className="px-4 py-3 border-t border-line text-muted tabular-nums">{e.brNumber ?? "—"}</td>
                <td className="px-4 py-3 border-t border-line text-right tabular-nums">{money(e.amountCents, e.currency)}</td>
                <td className="px-4 py-3 border-t border-line"><span className="pill">{e.status}</span>{e.reimbursementTxId && <span className="text-xs text-muted ml-2">reconciled</span>}</td>
                <td className="px-4 py-3 border-t border-line">{e.receiptUrl ? <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-foreground underline">view</a> : <span className="text-muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold mb-2">{title}</h2>
      <div className="card divide-y divide-line">{children}</div>
    </div>
  );
}

function Row({ left, mid, amount, actions, receipt }: { left: string; mid?: string; amount: string; actions: React.ReactNode; receipt?: string | null }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{left}</div>
        {mid && <div className="text-xs text-muted truncate">{mid}</div>}
      </div>
      {receipt && <a href={receipt} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-foreground underline shrink-0">receipt</a>}
      <div className="tabular-nums font-medium shrink-0">{amount}</div>
      <div className="flex items-center gap-2 shrink-0">{actions}</div>
    </div>
  );
}
