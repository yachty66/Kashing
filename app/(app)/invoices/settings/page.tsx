"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Profile = {
  name: string;
  brNumber: string | null;
  addressLines: string | null;
  email: string | null;
  phone: string | null;
  paymentInstructions: string | null;
  iban: string | null;
  bic: string | null;
  defaultCurrency: string;
  invoicePrefix: string;
  footerNote: string | null;
};

const CURRENCIES = ["HKD", "USD", "CNY", "EUR", "GBP", "SGD", "JPY"];

export default function InvoiceSettingsPage() {
  const [p, setP] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/business-profile");
      if (r.ok) setP((await r.json()).profile);
    })();
  }, []);

  function set<K extends keyof Profile>(key: K, value: Profile[K]) {
    setP((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSaved(false);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!p) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/business-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Save failed");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!p) return <div className="p-8 text-muted text-sm">Loading…</div>;

  return (
    <div className="p-8 w-full max-w-2xl">
      <div className="mb-6">
        <Link href="/invoices" className="text-muted hover:text-foreground text-sm">← Invoices</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Business profile</h1>
        <p className="text-sm text-muted mt-1">Shown as the &ldquo;from&rdquo; details on every invoice.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {error && <div className="px-4 py-3 rounded-lg bg-card border border-foreground text-foreground text-sm">{error}</div>}

        <div className="card p-5 space-y-4">
          <Field label="Business name">
            <Text value={p.name} onChange={(v) => set("name", v)} placeholder="My Shop Ltd" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="BR number (Hong Kong)"><Text value={p.brNumber ?? ""} onChange={(v) => set("brNumber", v)} placeholder="12345678-000" /></Field>
            <Field label="Phone"><Text value={p.phone ?? ""} onChange={(v) => set("phone", v)} /></Field>
          </div>
          <Field label="Email"><Text value={p.email ?? ""} onChange={(v) => set("email", v)} placeholder="hello@myshop.hk" /></Field>
          <Field label="Address">
            <textarea value={p.addressLines ?? ""} onChange={(e) => set("addressLines", e.target.value)} rows={3}
              className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
          </Field>
        </div>

        <div className="card p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Default currency">
              <select value={p.defaultCurrency} onChange={(e) => set("defaultCurrency", e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm">
                {[...new Set([p.defaultCurrency, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Invoice number prefix"><Text value={p.invoicePrefix} onChange={(v) => set("invoicePrefix", v)} placeholder="INV" /></Field>
          </div>
          <Field label="Payment instructions (how customers pay you)">
            <textarea value={p.paymentInstructions ?? ""} onChange={(e) => set("paymentInstructions", e.target.value)} rows={3}
              placeholder="Bank: HSBC · Account: 123-456789-001 · FPS ID: 1234567"
              className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="IBAN (SEPA sender)"><Text value={p.iban ?? ""} onChange={(v) => set("iban", v)} placeholder="DE00 0000 0000 0000 0000 00" /></Field>
            <Field label="BIC"><Text value={p.bic ?? ""} onChange={(v) => set("bic", v)} placeholder="optional" /></Field>
          </div>
          <Field label="Default footer note">
            <textarea value={p.footerNote ?? ""} onChange={(e) => set("footerNote", e.target.value)} rows={2}
              className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm text-muted">Saved</span>}
          <button type="submit" disabled={saving} className="btn btn-primary disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
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

function Text({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
  );
}
