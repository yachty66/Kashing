"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { centsToInput, fmtMoney, inputToCents, todayISO } from "@/lib/invoices";
import { InvoiceDocument } from "@/components/InvoiceDocument";

type Line = { id: number; description: string; quantity: string; unitPriceCents: number; amountCents: number };
type Payment = { id: number; amountCents: number; paidAt: string; method: string; note: string | null; transactionId: number | null };
type Invoice = {
  id: number; number: string; customerName: string | null; issueDate: string; dueDate: string | null;
  currency: string; status: string; subtotalCents: number; discountCents: number; totalCents: number;
  amountPaidCents: number; notes: string | null; footer: string | null; publicToken: string;
};
type Customer = { name: string; email: string | null; addressLines: string | null; brNumber: string | null; phone: string | null } | null;
type Profile = { name: string; brNumber: string | null; addressLines: string | null; email: string | null; phone: string | null; paymentInstructions: string | null } | null;
type Suggestion = {
  transactionId: number; bookingDate: string | null; amountCents: number; currency: string;
  counterparty: string | null; memo: string | null; confidence: "high" | "medium" | "low"; reasons: string[];
};

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [inv, setInv] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customer, setCustomer] = useState<Customer>(null);
  const [profile, setProfile] = useState<Profile>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Record-payment form
  const [showPay, setShowPay] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayISO());
  const [payMethod, setPayMethod] = useState("manual");

  const load = useCallback(async () => {
    const r = await fetch(`/api/invoices/${id}`);
    if (!r.ok) return setNotFound(true);
    const d = await r.json();
    setInv(d.invoice);
    setLines(d.lines ?? []);
    setPayments(d.payments ?? []);
    setCustomer(d.customer ?? null);
    const outstanding = Number(d.invoice.totalCents) - Number(d.invoice.amountPaidCents);
    setPayAmount(outstanding > 0 ? centsToInput(outstanding) : "");
    // Matches (engine returns [] for draft/paid/void)
    const m = await fetch(`/api/invoices/${id}/match`);
    if (m.ok) setSuggestions((await m.json()).suggestions ?? []);
    else setSuggestions([]);
  }, [id]);

  useEffect(() => {
    load();
    (async () => {
      const p = await fetch("/api/business-profile");
      if (p.ok) setProfile((await p.json()).profile ?? null);
    })();
  }, [load]);

  async function act(fn: () => Promise<Response>) {
    setBusy(true);
    try {
      await fn();
      await load();
    } finally {
      setBusy(false);
    }
  }

  const setStatus = (action: string) =>
    act(() => fetch(`/api/invoices/${id}/status`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    }));

  async function recordPayment() {
    const cents = inputToCents(payAmount);
    if (cents <= 0) return;
    await act(() => fetch(`/api/invoices/${id}/payments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: cents, paidAt: payDate, method: payMethod }),
    }));
    setShowPay(false);
  }

  const removePayment = (paymentId: number) =>
    act(() => fetch(`/api/invoices/${id}/payments?paymentId=${paymentId}`, { method: "DELETE" }));

  const reconcile = (transactionId: number) =>
    act(() => fetch(`/api/invoices/${id}/match`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactionId }),
    }));

  async function del() {
    if (!confirm("Delete this invoice? This cannot be undone.")) return;
    await fetch(`/api/invoices/${id}`, { method: "DELETE" });
    router.push("/invoices");
    router.refresh();
  }

  function copyLink() {
    if (!inv) return;
    const url = `${window.location.origin}/invoice/${inv.publicToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (notFound) return <div className="p-8 text-muted text-sm">Invoice not found.</div>;
  if (!inv) return <div className="p-8 text-muted text-sm">Loading…</div>;

  const outstanding = Number(inv.totalCents) - Number(inv.amountPaidCents);
  const cur = inv.currency;

  return (
    <div className="p-8 w-full max-w-4xl">
      {/* Toolbar (not printed) */}
      <div className="no-print mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Link href="/invoices" className="text-muted hover:text-foreground text-sm">← Invoices</Link>
          <div className="flex items-center gap-2">
            {inv.status === "draft" && (
              <button disabled={busy} onClick={() => setStatus("send")} className="btn btn-ghost text-sm">Mark sent</button>
            )}
            {inv.status !== "void" && (
              <Link href={`/invoices/${id}/edit`} className="btn btn-ghost text-sm">Edit</Link>
            )}
            <button onClick={copyLink} className="btn btn-ghost text-sm">{copied ? "Copied!" : "Copy link"}</button>
            <button onClick={() => window.print()} className="btn btn-ghost text-sm">Print / PDF</button>
            {inv.status !== "void" ? (
              <button disabled={busy} onClick={() => setStatus("void")} className="btn btn-ghost text-sm">Void</button>
            ) : (
              <button disabled={busy} onClick={() => setStatus("draft")} className="btn btn-ghost text-sm">Restore</button>
            )}
            <button onClick={del} className="btn btn-ghost text-sm">Delete</button>
          </div>
        </div>
      </div>

      {/* Printable invoice document */}
      <InvoiceDocument invoice={inv} lines={lines} profile={profile} customer={customer} />

      {/* Payments (not printed) */}
      {inv.status !== "void" && (
        <div className="no-print card p-5 mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Payments</h2>
            {outstanding > 0 && (
              <button onClick={() => setShowPay((v) => !v)} className="btn btn-ghost text-sm">
                {showPay ? "Cancel" : "Record payment"}
              </button>
            )}
          </div>

          {showPay && (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end mb-4">
              <label className="block">
                <span className="block text-[10px] uppercase tracking-wide text-muted mb-1">Amount</span>
                <input inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-foreground/20" />
              </label>
              <label className="block">
                <span className="block text-[10px] uppercase tracking-wide text-muted mb-1">Date</span>
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm" />
              </label>
              <label className="block">
                <span className="block text-[10px] uppercase tracking-wide text-muted mb-1">Method</span>
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm">
                  <option value="manual">Manual</option>
                  <option value="bank">Bank transfer</option>
                  <option value="fps">FPS</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <button disabled={busy} onClick={recordPayment} className="btn btn-primary text-sm disabled:opacity-60">Add</button>
            </div>
          )}

          {payments.length === 0 ? (
            <p className="text-muted text-sm">No payments recorded yet.</p>
          ) : (
            <table className="w-full text-sm border-separate border-spacing-0">
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 border-t border-line text-muted tabular-nums whitespace-nowrap">{p.paidAt}</td>
                    <td className="py-2 border-t border-line">
                      <span className="pill">{p.method}</span>
                      {p.transactionId && <span className="text-xs text-muted ml-2">reconciled</span>}
                      {p.note && <span className="text-xs text-muted ml-2">{p.note}</span>}
                    </td>
                    <td className="py-2 border-t border-line text-right tabular-nums">{fmtMoney(p.amountCents, cur)}</td>
                    <td className="py-2 border-t border-line text-right">
                      <button onClick={() => removePayment(p.id)} className="text-muted hover:text-foreground text-sm" aria-label="Remove payment">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Suggested matches from the bank feed (not printed) */}
      {suggestions.length > 0 && (
        <div className="no-print card p-5 mt-6">
          <h2 className="text-sm font-semibold mb-1">Suggested payments from your bank feed</h2>
          <p className="text-xs text-muted mb-3">Incoming transactions that look like payment of this invoice. Reconciling records a linked payment.</p>
          <div className="space-y-2">
            {suggestions.map((s) => (
              <div key={s.transactionId} className="flex items-center justify-between gap-3 border-t border-line pt-2.5">
                <div className="min-w-0">
                  <div className="text-sm">
                    <span className="tabular-nums font-medium">{fmtMoney(s.amountCents, s.currency)}</span>
                    <span className="text-muted"> · {s.bookingDate ?? "—"}</span>
                    {s.counterparty && <span className="text-muted"> · {s.counterparty}</span>}
                  </div>
                  <div className="text-xs text-muted mt-0.5">
                    <span className={`pill mr-2 ${s.confidence === "high" ? "pill-high" : s.confidence === "medium" ? "pill-medium" : "pill-low"}`}>{s.confidence}</span>
                    {s.reasons.join(" · ")}
                  </div>
                </div>
                <button disabled={busy} onClick={() => reconcile(s.transactionId)} className="btn btn-primary text-sm disabled:opacity-60 shrink-0">Reconcile</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FPS payment QR — printed onto the invoice; baked with amount + number */}
      {inv && inv.status !== "void" && Number(inv.totalCents) - Number(inv.amountPaidCents) > 0 && (
        <div className="card p-5 mt-6">
          <h2 className="text-sm font-semibold mb-1">Pay by FPS</h2>
          <p className="text-xs text-muted mb-3">
            Scan with any HK bank app, PayMe, or AlipayHK — or save it and use &ldquo;scan from album&rdquo; to pay from this phone. The amount and invoice number are baked in, so it reconciles automatically.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/invoices/${id}/qr`} alt={`FPS QR for ${inv.number}`} width={200} height={200} className="border border-line" />
        </div>
      )}
    </div>
  );
}
