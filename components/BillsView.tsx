"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Bill = {
  id: number;
  supplierId: number | null;
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  description: string | null;
  amountCents: number;
  currency: string;
  paymentIban: string | null;
  status: string;
  bookedAt: string | null;
};
type Supplier = { id: number; name: string; iban: string | null; bic: string | null };

const fmt = (cents: number, cur = "EUR") => {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: cur }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${cur}`;
  }
};

/** Incoming supplier bills (AP) — rendered inside the Bookkeeping hub's Bills tab. */
export function BillsView() {
  const [rows, setRows] = useState<Bill[] | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    const r = await fetch("/api/bills");
    setRows(r.ok ? (await r.json()).bills : []);
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter((b) =>
      [b.supplierName, b.invoiceNumber, b.description].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [rows, query]);

  const totals = useMemo(() => {
    let open = 0, paid = 0;
    for (const b of rows ?? []) (b.status === "paid" ? (paid += b.amountCents) : (open += b.amountCents));
    return { open, paid };
  }, [rows]);

  async function setStatus(id: number, status: "paid" | "unpaid") {
    await fetch(`/api/bills/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await load();
  }
  async function remove(id: number) {
    if (!confirm("Delete this bill?")) return;
    await fetch(`/api/bills/${id}`, { method: "DELETE" });
    await load();
  }

  if (rows === null) return <div className="text-muted text-sm py-8">Loading…</div>;

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <p className="text-muted text-sm">Record incoming bills, mark them paid, and export for your accountant.</p>
        <div className="flex items-center gap-2">
          <a href="/api/bills/export" className="btn btn-ghost text-sm">Export CSV</a>
          <button onClick={() => setAdding(true)} className="btn btn-primary text-sm">+ New bill</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <div className="card p-4"><div className="text-xs uppercase tracking-wide text-muted mb-1">Open</div><div className="text-xl font-semibold tabular-nums">{fmt(totals.open)}</div></div>
        <div className="card p-4"><div className="text-xs uppercase tracking-wide text-muted mb-1">Paid</div><div className="text-xl font-semibold tabular-nums">{fmt(totals.paid)}</div></div>
      </div>

      <div className="mb-3">
        <input type="search" placeholder="Supplier, number, description…" value={query} onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-md px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
      </div>

      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-muted text-sm">{rows.length === 0 ? "No incoming bills recorded yet." : "No matches."}</div>
      ) : (
        <div className="card">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="text-muted text-left">
                <th className="font-medium px-4 py-3 border-b border-line">DATE</th>
                <th className="font-medium px-4 py-3 border-b border-line">SUPPLIER</th>
                <th className="font-medium px-4 py-3 border-b border-line">NUMBER</th>
                <th className="font-medium px-4 py-3 border-b border-line text-right">AMOUNT</th>
                <th className="font-medium px-4 py-3 border-b border-line">STATUS</th>
                <th className="font-medium px-4 py-3 border-b border-line w-32"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} className="align-top hover:bg-foreground/[0.03]">
                  <td className="px-4 py-3 border-t border-line text-muted tabular-nums whitespace-nowrap">{b.invoiceDate || "—"}</td>
                  <td className="px-4 py-3 border-t border-line">
                    <div className="font-medium">{b.supplierName || "—"}</div>
                    {b.description && <div className="text-muted text-xs">{b.description}</div>}
                  </td>
                  <td className="px-4 py-3 border-t border-line text-muted">{b.invoiceNumber || "—"}</td>
                  <td className="px-4 py-3 border-t border-line text-right tabular-nums whitespace-nowrap">{fmt(b.amountCents, b.currency)}</td>
                  <td className="px-4 py-3 border-t border-line">
                    <span className={`pill ${b.status === "paid" ? "pill-high" : "pill-medium"}`}>{b.status === "paid" ? "Paid" : "Open"}</span>
                  </td>
                  <td className="px-4 py-3 border-t border-line text-right whitespace-nowrap">
                    {b.status === "paid" ? (
                      <button onClick={() => setStatus(b.id, "unpaid")} className="text-muted hover:text-foreground text-xs">↺ reopen</button>
                    ) : (
                      <button onClick={() => setStatus(b.id, "paid")} className="text-muted hover:text-foreground text-xs">✓ mark paid</button>
                    )}
                    <button onClick={() => remove(b.id)} className="ml-3 text-muted hover:text-red-500" aria-label="Delete">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && <BillModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function BillModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [iban, setIban] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/suppliers");
      if (r.ok) setSuppliers((await r.json()).suppliers ?? []);
    })();
  }, []);

  function pickSupplier(id: string) {
    setSupplierId(id);
    const s = suppliers.find((x) => String(x.id) === id);
    if (s?.iban && !iban) setIban(s.iban);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
    if (!supplierId) return setError("Please choose a supplier.");
    if (!Number.isFinite(cents) || cents <= 0) return setError("Amount must be greater than 0.");
    setSaving(true);
    try {
      const r = await fetch("/api/bills", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId: Number(supplierId), invoiceNumber, invoiceDate: invoiceDate || null, dueDate: dueDate || null, description, amountCents: cents, currency: "EUR", paymentIban: iban || undefined }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Save failed");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={submit} className="card w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-lg font-semibold">Record incoming bill</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost text-sm">✕</button>
        </div>
        <div className="px-6 py-5 space-y-3 overflow-y-auto">
          {error && <div className="px-4 py-3 rounded-lg bg-card border border-foreground text-sm">{error}</div>}
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-muted mb-1.5">Supplier *</span>
            <select value={supplierId} onChange={(e) => pickSupplier(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm">
              <option value="">— choose —</option>
              {suppliers.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <L label="Invoice number"><I v={invoiceNumber} on={setInvoiceNumber} /></L>
            <L label="Amount (€) *"><I v={amount} on={setAmount} placeholder="0.00" /></L>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <L label="Invoice date"><input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm" /></L>
            <L label="Due date"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm" /></L>
          </div>
          <L label="Description"><I v={description} on={setDescription} /></L>
          <L label="IBAN (payee)"><I v={iban} on={setIban} placeholder="taken from supplier" /></L>
        </div>
        <div className="px-6 py-4 border-t border-line flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-ghost text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn btn-primary disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs uppercase tracking-wide text-muted mb-1.5">{label}</span>{children}</label>;
}
function I({ v, on, placeholder }: { v: string; on: (v: string) => void; placeholder?: string }) {
  return <input value={v} onChange={(e) => on(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />;
}
