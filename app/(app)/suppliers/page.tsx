"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Supplier = {
  id: number;
  name: string;
  taxId: string | null;
  addressLines: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  iban: string | null;
  bic: string | null;
};

const EMPTY: Partial<Supplier> = {};

export default function SuppliersPage() {
  const [rows, setRows] = useState<Supplier[] | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const [importing, setImporting] = useState(false);

  async function load() {
    const r = await fetch("/api/suppliers");
    setRows(r.ok ? (await r.json()).suppliers : []);
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter((r) =>
      [r.name, r.city, r.taxId, r.iban, r.email].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [rows, query]);

  async function importFromBank() {
    setImporting(true);
    try {
      const r = await fetch("/api/suppliers/import", { method: "POST" });
      if (r.ok) await load();
    } finally {
      setImporting(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Lieferant löschen?")) return;
    await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
    await load();
  }

  if (rows === null) return <div className="p-8 text-muted text-sm">Lädt…</div>;

  return (
    <div className="p-8 w-full">
      <header className="mb-1 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lieferanten</h1>
          <p className="text-muted text-sm mt-1">{rows.length} Lieferanten</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={importFromBank} disabled={importing} className="btn btn-ghost text-sm disabled:opacity-60">
            {importing ? "Importiere…" : "Aus Banktransaktionen importieren"}
          </button>
          <button onClick={() => setEditing(EMPTY)} className="btn btn-primary text-sm">+ Lieferant erstellen</button>
        </div>
      </header>

      <div className="my-5">
        <input
          type="search"
          placeholder="Name, Stadt, IBAN, E-Mail…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-md px-3 py-2.5 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-muted text-sm">
          {rows.length === 0 ? "Noch keine Lieferanten — importiere sie aus deinen Banktransaktionen oder lege einen an." : "Keine Treffer."}
        </div>
      ) : (
        <div className="card">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="text-muted text-left">
                <th className="font-medium px-4 py-3 border-b border-line">NAME</th>
                <th className="font-medium px-4 py-3 border-b border-line">STADT</th>
                <th className="font-medium px-4 py-3 border-b border-line">STEUER-ID</th>
                <th className="font-medium px-4 py-3 border-b border-line">IBAN</th>
                <th className="font-medium px-4 py-3 border-b border-line">E-MAIL</th>
                <th className="font-medium px-4 py-3 border-b border-line w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="align-top hover:bg-foreground/[0.03]">
                  <td className="px-4 py-3 border-t border-line">
                    <div className="font-medium">{s.name}</div>
                    {s.addressLines && <div className="text-muted text-xs">{s.addressLines}</div>}
                  </td>
                  <td className="px-4 py-3 border-t border-line text-muted">{s.city || "—"}</td>
                  <td className="px-4 py-3 border-t border-line text-muted tabular-nums">{s.taxId || "—"}</td>
                  <td className="px-4 py-3 border-t border-line text-muted tabular-nums">{s.iban || "–"}</td>
                  <td className="px-4 py-3 border-t border-line text-muted">{s.email || "—"}</td>
                  <td className="px-4 py-3 border-t border-line text-right whitespace-nowrap">
                    <button onClick={() => setEditing(s)} className="text-muted hover:text-foreground" aria-label="Bearbeiten">✎</button>
                    <button onClick={() => remove(s.id)} className="ml-3 text-muted hover:text-red-500" aria-label="Löschen">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <SupplierModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function SupplierModal({ initial, onClose, onSaved }: { initial: Partial<Supplier>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Supplier>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = typeof initial.id === "number";

  function set<K extends keyof Supplier>(k: K, v: string) {
    setF((p) => ({ ...p, [k]: v }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.name?.trim()) return setError("Name ist erforderlich.");
    setSaving(true);
    try {
      const r = await fetch(isEdit ? `/api/suppliers/${initial.id}` : "/api/suppliers", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(f),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Speichern fehlgeschlagen");
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
          <h2 className="text-lg font-semibold">{isEdit ? "Lieferant bearbeiten" : "Lieferant erstellen"}</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost text-sm">✕</button>
        </div>
        <div className="px-6 py-5 space-y-3 overflow-y-auto">
          {error && <div className="px-4 py-3 rounded-lg bg-card border border-foreground text-sm">{error}</div>}
          <Field label="Name *"><Inp v={f.name ?? ""} on={(v) => set("name", v)} autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Steuer-ID"><Inp v={f.taxId ?? ""} on={(v) => set("taxId", v)} /></Field>
            <Field label="E-Mail"><Inp v={f.email ?? ""} on={(v) => set("email", v)} /></Field>
          </div>
          <Field label="Adresse"><Inp v={f.addressLines ?? ""} on={(v) => set("addressLines", v)} /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="PLZ"><Inp v={f.postalCode ?? ""} on={(v) => set("postalCode", v)} /></Field>
            <Field label="Stadt"><Inp v={f.city ?? ""} on={(v) => set("city", v)} /></Field>
            <Field label="Land"><Inp v={f.country ?? ""} on={(v) => set("country", v)} placeholder="DE" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="IBAN"><Inp v={f.iban ?? ""} on={(v) => set("iban", v)} /></Field>
            <Field label="BIC"><Inp v={f.bic ?? ""} on={(v) => set("bic", v)} /></Field>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-line flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-ghost text-sm">Abbrechen</button>
          <button type="submit" disabled={saving} className="btn btn-primary disabled:opacity-60">{saving ? "Speichert…" : "Speichern"}</button>
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
