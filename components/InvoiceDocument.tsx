// A polished, print-ready invoice document — modelled on VSQ_Invoice's branded
// PDF (header + logo, sender line, bill-to / meta two-column, dark-header line
// table, totals box, due line, sender footer). Shared by the invoice detail
// page and the public share page. No VAT (HKD-first), integer cents.
import { displayStatus, fmtMoney, statusLabel, statusPillClass } from "@/lib/invoices";

export type DocInvoice = {
  number: string;
  customerName: string | null;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  status: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  amountPaidCents: number;
  notes: string | null;
  footer: string | null;
};
export type DocLine = { id: number; description: string; quantity: string; unitPriceCents: number; amountCents: number };
export type DocProfile = {
  name: string;
  addressLines: string | null;
  email: string | null;
  phone: string | null;
  brNumber: string | null;
  paymentInstructions: string | null;
} | null;
export type DocCustomer = {
  name: string;
  addressLines: string | null;
  city?: string | null;
  brNumber: string | null;
  email: string | null;
} | null;

export function InvoiceDocument({
  invoice: inv,
  lines,
  profile,
  customer,
}: {
  invoice: DocInvoice;
  lines: DocLine[];
  profile: DocProfile;
  customer: DocCustomer;
}) {
  const cur = inv.currency;
  const display = displayStatus(inv);
  const outstanding = Number(inv.totalCents) - Number(inv.amountPaidCents);
  const senderLine = profile
    ? [profile.name, profile.addressLines?.replace(/\n/g, ", "), profile.email].filter(Boolean).join(" · ")
    : "";

  return (
    <div className="card p-8 sm:p-10 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">INVOICE</h1>
          {senderLine && <p className="text-xs text-muted mt-2">{senderLine}</p>}
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width={36} height={36} className="rounded-md shrink-0" />
      </div>

      {/* Bill-to + meta */}
      <div className="grid grid-cols-2 gap-6 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted mb-1.5">Bill to</div>
          <div className="font-semibold">{inv.customerName || customer?.name || "—"}</div>
          {customer?.addressLines && <div className="text-muted whitespace-pre-line">{customer.addressLines}</div>}
          {customer?.city && <div className="text-muted">{customer.city}</div>}
          {customer?.brNumber && <div className="text-muted">BR: {customer.brNumber}</div>}
          {customer?.email && <div className="text-muted">{customer.email}</div>}
        </div>
        <div className="space-y-1 text-right">
          <MetaRow label="Invoice no." value={inv.number} />
          <MetaRow label="Issue date" value={inv.issueDate} />
          <MetaRow label="Due date" value={inv.dueDate || "—"} />
          <div className="flex justify-end pt-1">
            <span className={statusPillClass(display)}>{statusLabel(display)}</span>
          </div>
        </div>
      </div>

      {inv.notes && <p className="text-sm whitespace-pre-line">{inv.notes}</p>}

      {/* Line items — strong (inverted) header like VSQ's dark table head */}
      <table className="w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr className="bg-foreground text-background">
            <th className="text-left font-semibold px-3 py-2 rounded-l-md">Description</th>
            <th className="text-right font-semibold px-3 py-2">Qty</th>
            <th className="text-right font-semibold px-3 py-2">Unit price</th>
            <th className="text-right font-semibold px-3 py-2 rounded-r-md">Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id}>
              <td className="px-3 py-2 border-b border-line/60">{l.description || <span className="text-muted">—</span>}</td>
              <td className="px-3 py-2 border-b border-line/60 text-right tabular-nums">{l.quantity}</td>
              <td className="px-3 py-2 border-b border-line/60 text-right tabular-nums">{fmtMoney(l.unitPriceCents, cur)}</td>
              <td className="px-3 py-2 border-b border-line/60 text-right tabular-nums">{fmtMoney(l.amountCents, cur)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex">
        <div className="flex-1" />
        <div className="w-full max-w-xs space-y-1.5 text-sm">
          <Row label="Subtotal" value={fmtMoney(inv.subtotalCents, cur)} muted />
          {inv.discountCents > 0 && <Row label="Discount" value={`−${fmtMoney(inv.discountCents, cur)}`} muted />}
          <div className="flex justify-between font-semibold text-base border-t border-line pt-2 mt-1">
            <span>Total</span>
            <span className="tabular-nums">{fmtMoney(inv.totalCents, cur)}</span>
          </div>
          {inv.amountPaidCents > 0 && (
            <>
              <Row label="Paid" value={`−${fmtMoney(inv.amountPaidCents, cur)}`} muted />
              <div className="flex justify-between font-medium">
                <span>Balance due</span>
                <span className="tabular-nums">{fmtMoney(outstanding, cur)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {inv.dueDate && display !== "paid" && (
        <p className="text-sm text-muted">Payment is due on {inv.dueDate}.</p>
      )}

      {/* Footer: how to pay + sender */}
      {(profile?.paymentInstructions || inv.footer) && (
        <div className="border-t border-line pt-4 text-sm space-y-3">
          {profile?.paymentInstructions && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">How to pay</div>
              <p className="whitespace-pre-line text-muted">{profile.paymentInstructions}</p>
            </div>
          )}
          {inv.footer && <p className="text-muted text-xs whitespace-pre-line">{inv.footer}</p>}
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-end gap-3">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums font-medium min-w-[6rem]">{value}</span>
    </div>
  );
}
function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? "text-muted" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
