"use client";

import { useEffect, useState } from "react";
import { money } from "@/lib/money";

type Expense = {
  id: number;
  employee: string | null;
  amountCents: number | null;
  currency: string;
  merchant: string | null;
  brNumber: string | null;
  category: string | null;
  expenseDate: string | null;
  receiptUrl: string | null;
  paymentType: string;
  status: string;
  reimbursementTxId: number | null;
  createdAt: string;
};

export default function AuditPage() {
  const [rows, setRows] = useState<Expense[] | null>(null);

  useEffect(() => {
    fetch("/api/expenses").then(async (r) => setRows(r.ok ? (await r.json()).expenses : []));
  }, []);

  if (rows === null) return <div className="p-8 text-muted text-sm">Loading…</div>;

  const withReceipt = rows.filter((r) => r.receiptUrl).length;

  return (
    <div className="p-8 w-full">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Audit vault</h1>
        <p className="text-muted text-sm mt-1">
          {rows.length} expense claims · {withReceipt} with receipts on file. Hong Kong law requires keeping these 7 years — every receipt is archived against its payment.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-muted text-sm">No expense claims yet. They appear here when employees send receipts on WhatsApp.</div>
      ) : (
        <div className="card">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="bg-card">
              <tr className="text-muted text-left">
                <th className="font-medium px-4 py-3 border-b border-line">DATE</th>
                <th className="font-medium px-4 py-3 border-b border-line">EMPLOYEE</th>
                <th className="font-medium px-4 py-3 border-b border-line">MERCHANT</th>
                <th className="font-medium px-4 py-3 border-b border-line">BRN</th>
                <th className="font-medium px-4 py-3 border-b border-line">CATEGORY</th>
                <th className="font-medium px-4 py-3 border-b border-line text-right">AMOUNT</th>
                <th className="font-medium px-4 py-3 border-b border-line">STATUS</th>
                <th className="font-medium px-4 py-3 border-b border-line">RECEIPT</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="hover:bg-foreground/[0.03]">
                  <td className="px-4 py-3 border-t border-line text-muted tabular-nums whitespace-nowrap">{e.expenseDate ?? e.createdAt.slice(0, 10)}</td>
                  <td className="px-4 py-3 border-t border-line">{e.employee ?? "—"}</td>
                  <td className="px-4 py-3 border-t border-line">{e.merchant ?? "—"}</td>
                  <td className="px-4 py-3 border-t border-line text-muted tabular-nums">{e.brNumber ?? "—"}</td>
                  <td className="px-4 py-3 border-t border-line text-muted">{e.category ?? "—"}</td>
                  <td className="px-4 py-3 border-t border-line text-right tabular-nums">{money(e.amountCents, e.currency)}</td>
                  <td className="px-4 py-3 border-t border-line">
                    <span className="pill">{e.status}</span>
                    {e.reimbursementTxId && <span className="text-xs text-muted ml-2">reconciled</span>}
                  </td>
                  <td className="px-4 py-3 border-t border-line">
                    {e.receiptUrl ? (
                      <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="text-muted hover:text-foreground underline">view</a>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
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
