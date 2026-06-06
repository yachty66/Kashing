"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Customer = {
  id: number;
  name: string;
  email: string | null;
  addressLines: string | null;
  city: string | null;
  vatId: string | null;
  taxId: string | null;
  phone: string | null;
};

export default function CustomersPage() {
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Partial<Customer> | null>(null);

  async function load() {
    const r = await fetch("/api/customers");
    setRows(r.ok ? (await r.json()).customers : []);
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter((r) =>
      [r.name, r.email, r.city, r.vatId].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [rows, query]);

  async function remove(id: number) {
    if (!confirm("Delete this customer?")) return;
    await fetch(`/api/customers/${id}`, { method: "DELETE" });
    await load();
  }

  if (rows === null) return <div className="p-8 text-muted text-sm">Loading…</div>;

  return (
    <div className="p-8 w-full">
      <header className="mb-1 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-muted text-sm mt-1">{rows.length} {rows.length === 1 ? "customer" : "customers"}</p>
        </div>
        <button onClick={() => setEditing({})} className="btn btn-primary text-sm">+ New customer</button>
      </header>

      <div className="my-5">
        <input
          type="search"
          placeholder="Name, email, city, VAT ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-md px-3 py-2.5 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-muted text-sm">
          {rows.length === 0 ? "No customers yet — add your first one." : "No matches."}
        </div>
      ) : (
        <div className="card">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="text-muted text-left">
                <th className="font-medium px-4 py-3 border-b border-line">CUSTOMER</th>
                <th className="font-medium px-4 py-3 border-b border-line">EMAIL</th>
                <th className="font-medium px-4 py-3 border-b border-line">CITY</th>
                <th className="font-medium px-4 py-3 border-b border-line">VAT ID</th>
                <th className="font-medium px-4 py-3 border-b border-line w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="align-top hover:bg-foreground/[0.03]">
                  <td className="px-4 py-3 border-t border-line font-medium">{c.name}</td>
                  <td className="px-4 py-3 border-t border-line text-muted">{c.email || "—"}</td>
                  <td className="px-4 py-3 border-t border-line text-muted">{c.city || "—"}</td>
                  <td className="px-4 py-3 border-t border-line text-muted tabular-nums">{c.vatId || "—"}</td>
                  <td className="px-4 py-3 border-t border-line text-right whitespace-nowrap">
                    <button onClick={() => setEditing(c)} className="text-muted hover:text-foreground" aria-label="Edit">✎</button>
                    <button onClick={() => remove(c.id)} className="ml-3 text-muted hover:text-red-500" aria-label="Delete">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <CustomerModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function CustomerModal({ initial, onClose, onSaved }: { initial: Partial<Customer>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Customer>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = typeof initial.id === "number";

  function set<K extends keyof Customer>(k: K, v: string) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.name?.trim()) return setError("Name is required.");
    setSaving(true);
    try {
      const r = await fetch(isEdit ? `/api/customers/${initial.id}` : "/api/customers", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
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
          <h2 className="text-lg font-semibold">{isEdit ? "Edit customer" : "New customer"}</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost text-sm">✕</button>
        </div>
        <div className="px-6 py-5 space-y-3 overflow-y-auto">
          {error && <div className="px-4 py-3 rounded-lg bg-card border border-foreground text-sm">{error}</div>}
          <Field label="Name *"><Inp v={f.name ?? ""} on={(v) => set("name", v)} autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email"><Inp v={f.email ?? ""} on={(v) => set("email", v)} /></Field>
            <Field label="Phone"><Inp v={f.phone ?? ""} on={(v) => set("phone", v)} /></Field>
          </div>
          <Field label="Address"><Inp v={f.addressLines ?? ""} on={(v) => set("addressLines", v)} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="City"><Inp v={f.city ?? ""} on={(v) => set("city", v)} /></Field>
            <Field label="VAT ID"><Inp v={f.vatId ?? ""} on={(v) => set("vatId", v)} /></Field>
            <Field label="Tax no."><Inp v={f.taxId ?? ""} on={(v) => set("taxId", v)} /></Field>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-line flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-ghost text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn btn-primary disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-wide text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}
function Inp({ v, on, placeholder, autoFocus }: { v: string; on: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <input value={v} onChange={(e) => on(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
      className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
  );
}
