"use client";

import { FormEvent, useState } from "react";

export function AddSubscriptionModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [cadence, setCadence] = useState("monthly");
  const [category, setCategory] = useState("");
  const [domain, setDomain] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const num = parseFloat(amount.replace(",", "."));
    if (!name.trim()) return setError("Name is required.");
    if (!Number.isFinite(num) || num <= 0) return setError("Amount must be a positive number.");

    setSubmitting(true);
    try {
      const r = await fetch("/api/subscriptions/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          monthly_amount_eur: num,
          cadence,
          category: category.trim() || undefined,
          domain: domain.trim() || undefined,
        }),
      });
      if (!r.ok) {
        setError(await r.text());
        return;
      }
      onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={onSubmit}
        className="card w-full max-w-md flex flex-col"
      >
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add subscription</h2>
          <button type="button" onClick={onClose} className="btn btn-ghost text-sm" aria-label="Close">✕</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-card border border-foreground text-foreground text-sm">{error}</div>
          )}

          <Field label="Name *">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder="e.g. Netflix"
              className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (€) *">
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                placeholder="9.99"
                className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </Field>
            <Field label="Cadence">
              <select
                value={cadence}
                onChange={(e) => setCadence(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm"
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="yearly">Yearly</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="saas, media, telco…"
                className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </Field>
            <Field label="Domain">
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="netflix.com"
                className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </Field>
          </div>

          <p className="text-xs text-muted leading-relaxed">
            Manually added subscriptions persist across re-analyses — the next
            <strong className="text-foreground"> Pull &amp; analyze</strong> won't overwrite them.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-line flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-ghost text-sm">Cancel</button>
          <button type="submit" disabled={submitting} className="btn btn-primary disabled:opacity-60">
            {submitting ? "Adding…" : "Add"}
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
