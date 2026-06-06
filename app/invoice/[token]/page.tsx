"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { displayStatus, fmtMoney, statusLabel, statusPillClass } from "@/lib/invoices";

type Line = { id: number; description: string; quantity: string; unitPriceCents: number; amountCents: number };
type Invoice = {
  number: string; customerName: string | null; issueDate: string; dueDate: string | null; currency: string;
  status: string; subtotalCents: number; discountCents: number; totalCents: number; amountPaidCents: number;
  notes: string | null; footer: string | null;
};
type Profile = { name: string; brNumber: string | null; addressLines: string | null; email: string | null; phone: string | null; paymentInstructions: string | null } | null;
type Customer = { name: string; email: string | null; addressLines: string | null; brNumber: string | null } | null;

export default function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<{ invoice: Invoice; lines: Line[]; profile: Profile; customer: Customer } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/public/invoice/${token}`);
      if (!r.ok) return setNotFound(true);
      setData(await r.json());
    })();
  }, [token]);

  if (notFound) return <div className="min-h-screen flex items-center justify-center text-muted text-sm">Invoice not found.</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-muted text-sm">Loading…</div>;

  const { invoice: inv, lines, profile, customer } = data;
  const display = displayStatus(inv);
  const outstanding = Number(inv.totalCents) - Number(inv.amountPaidCents);
  const cur = inv.currency;

  return (
    <div className="min-h-screen flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-2xl mb-4 flex justify-end no-print">
        <button onClick={() => window.print()} className="btn btn-primary text-sm">Print / Save PDF</button>
      </div>

      <div className="card p-8 w-full max-w-2xl space-y-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{profile?.name ?? "Invoice"}</h1>
            {profile?.addressLines && <p className="text-sm text-muted whitespace-pre-line mt-1">{profile.addressLines}</p>}
            <p className="text-xs text-muted mt-1">
              {profile?.brNumber && <>BR: {profile.brNumber} · </>}
              {profile?.email}{profile?.phone ? ` · ${profile.phone}` : ""}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted">Invoice</div>
            <div className="text-lg font-semibold">{inv.number}</div>
            <span className={`${statusPillClass(display)} mt-2`}>{statusLabel(display)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted mb-1">Bill to</div>
            <div className="font-medium">{inv.customerName || customer?.name || "—"}</div>
            {customer?.addressLines && <div className="text-muted whitespace-pre-line">{customer.addressLines}</div>}
            {customer?.brNumber && <div className="text-muted">BR: {customer.brNumber}</div>}
            {customer?.email && <div className="text-muted">{customer.email}</div>}
          </div>
          <div className="text-right space-y-0.5">
            <div><span className="text-muted">Issued: </span><span className="tabular-nums">{inv.issueDate}</span></div>
            <div><span className="text-muted">Due: </span><span className="tabular-nums">{inv.dueDate || "—"}</span></div>
          </div>
        </div>

        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-muted text-left">
              <th className="font-medium py-2 border-b border-line">Description</th>
              <th className="font-medium py-2 border-b border-line text-right">Qty</th>
              <th className="font-medium py-2 border-b border-line text-right">Unit price</th>
              <th className="font-medium py-2 border-b border-line text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="py-2 border-b border-line/50">{l.description || <span className="text-muted">—</span>}</td>
                <td className="py-2 border-b border-line/50 text-right tabular-nums">{l.quantity}</td>
                <td className="py-2 border-b border-line/50 text-right tabular-nums">{fmtMoney(l.unitPriceCents, cur)}</td>
                <td className="py-2 border-b border-line/50 text-right tabular-nums">{fmtMoney(l.amountCents, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between text-muted"><span>Subtotal</span><span className="tabular-nums">{fmtMoney(inv.subtotalCents, cur)}</span></div>
          {inv.discountCents > 0 && (
            <div className="flex justify-between text-muted"><span>Discount</span><span className="tabular-nums">−{fmtMoney(inv.discountCents, cur)}</span></div>
          )}
          <div className="flex justify-between font-semibold text-base border-t border-line pt-1.5"><span>Total</span><span className="tabular-nums">{fmtMoney(inv.totalCents, cur)}</span></div>
          {inv.amountPaidCents > 0 && (
            <>
              <div className="flex justify-between text-muted"><span>Paid</span><span className="tabular-nums">−{fmtMoney(inv.amountPaidCents, cur)}</span></div>
              <div className="flex justify-between font-medium"><span>Balance due</span><span className="tabular-nums">{fmtMoney(outstanding, cur)}</span></div>
            </>
          )}
        </div>

        {(inv.notes || inv.footer || profile?.paymentInstructions) && (
          <div className="border-t border-line pt-4 text-sm space-y-3">
            {inv.notes && <p className="whitespace-pre-line">{inv.notes}</p>}
            {profile?.paymentInstructions && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted mb-1">How to pay</div>
                <p className="whitespace-pre-line text-muted">{profile.paymentInstructions}</p>
              </div>
            )}
            {inv.footer && <p className="text-muted text-xs whitespace-pre-line">{inv.footer}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
