"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  centsToInput,
  fmtMoney,
  inputToCents,
  lineAmountCents,
  todayISO,
} from "@/lib/invoices";

type Customer = { id: number; name: string; email: string | null; defaultCurrency: string };

type LineRow = { description: string; quantity: string; price: string };

export type InvoiceFormInitial = {
  customerId: number | null;
  customerName: string | null;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  discountCents: number;
  notes: string | null;
  footer: string | null;
  lines: { description: string; quantity: string; unitPriceCents: number }[];
};

const CURRENCIES = ["HKD", "USD", "CNY", "EUR", "GBP", "SGD", "JPY"];

const NEW_CUSTOMER = "__new__";
const NO_CUSTOMER = "";

function emptyLine(): LineRow {
  return { description: "", quantity: "1", price: "" };
}

export function InvoiceForm({
  mode,
  invoiceId,
  initial,
  defaultCurrency = "HKD",
}: {
  mode: "new" | "edit";
  invoiceId?: number;
  initial?: InvoiceFormInitial;
  defaultCurrency?: string;
}) {
  const router = useRouter();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSel, setCustomerSel] = useState<string>(
    initial?.customerId != null ? String(initial.customerId) : NO_CUSTOMER,
  );
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  // Free-text customer name kept when no customer record is linked.
  const [freeName, setFreeName] = useState(initial?.customerName ?? "");

  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? todayISO());
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);
  const [discount, setDiscount] = useState(
    initial && initial.discountCents > 0 ? centsToInput(initial.discountCents) : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [footer, setFooter] = useState(initial?.footer ?? "");
  const [lines, setLines] = useState<LineRow[]>(
    initial?.lines.length
      ? initial.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          price: centsToInput(l.unitPriceCents),
        }))
      : [emptyLine()],
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/customers");
      if (r.ok) setCustomers((await r.json()).customers ?? []);
    })();
  }, []);

  const lineAmounts = useMemo(
    () => lines.map((l) => lineAmountCents(l.quantity, inputToCents(l.price))),
    [lines],
  );
  const subtotalCents = lineAmounts.reduce((s, a) => s + a, 0);
  const discountCents = Math.max(0, inputToCents(discount));
  const totalCents = Math.max(0, subtotalCents - discountCents);

  function setLine(i: number, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(i: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev));
  }

  // When picking an existing customer, mirror its name into the snapshot field
  // and adopt its default currency for a brand-new invoice.
  function onPickCustomer(value: string) {
    setCustomerSel(value);
    if (value && value !== NEW_CUSTOMER) {
      const c = customers.find((x) => String(x.id) === value);
      if (c) {
        setFreeName(c.name);
        if (mode === "new" && c.defaultCurrency) setCurrency(c.defaultCurrency);
      }
    }
  }

  async function resolveCustomer(): Promise<{ customerId: number | null; customerName: string | null }> {
    if (customerSel === NEW_CUSTOMER) {
      const name = newCustomerName.trim();
      if (!name) throw new Error("New customer needs a name.");
      const r = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: newCustomerEmail.trim() || undefined, defaultCurrency: currency }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Could not create customer");
      const c = (await r.json()).customer as Customer;
      return { customerId: c.id, customerName: c.name };
    }
    if (customerSel && customerSel !== NO_CUSTOMER) {
      return { customerId: Number(customerSel), customerName: freeName.trim() || null };
    }
    return { customerId: null, customerName: freeName.trim() || null };
  }

  async function submit(e: FormEvent, markSent: boolean) {
    e.preventDefault();
    setError(null);
    if (lineAmounts.every((a) => a === 0) && subtotalCents === 0) {
      setError("Add at least one line with an amount.");
      return;
    }
    setSubmitting(true);
    try {
      const { customerId, customerName } = await resolveCustomer();
      const payload = {
        customerId,
        customerName,
        issueDate,
        dueDate: dueDate || null,
        currency,
        discountCents,
        notes: notes.trim() || null,
        footer: footer.trim() || null,
        lines: lines.map((l) => ({
          description: l.description.trim(),
          quantity: l.quantity.trim() || "1",
          unitPriceCents: inputToCents(l.price),
        })),
        ...(mode === "new" ? { status: markSent ? "sent" : "draft" } : {}),
      };
      const url = mode === "new" ? "/api/invoices" : `/api/invoices/${invoiceId}`;
      const method = mode === "new" ? "POST" : "PUT";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Save failed");
      const data = await r.json();
      const id = mode === "new" ? data.invoice.id : invoiceId;
      router.push(`/invoices/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={(e) => submit(e, false)}>
      {error && (
        <div className="px-4 py-3 rounded-lg bg-card border border-foreground text-foreground text-sm">{error}</div>
      )}

      {/* Customer + meta */}
      <div className="card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Customer">
            <select
              value={customerSel}
              onChange={(e) => onPickCustomer(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm"
            >
              <option value={NO_CUSTOMER}>— No customer —</option>
              {customers.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
              <option value={NEW_CUSTOMER}>+ New customer…</option>
            </select>
          </Field>
          <Field label="Customer name on invoice">
            <input
              value={freeName}
              onChange={(e) => setFreeName(e.target.value)}
              placeholder="Shown on the invoice"
              disabled={customerSel === NEW_CUSTOMER}
              className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-50"
            />
          </Field>
        </div>

        {customerSel === NEW_CUSTOMER && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="New customer name *">
              <input
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                placeholder="e.g. Acme Trading Ltd"
                className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </Field>
            <Field label="New customer email">
              <input
                value={newCustomerEmail}
                onChange={(e) => setNewCustomerEmail(e.target.value)}
                placeholder="billing@acme.hk"
                className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Issue date">
            <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm" />
          </Field>
          <Field label="Due date">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm" />
          </Field>
          <Field label="Currency">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm">
              {[...new Set([currency, ...CURRENCIES])].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Discount">
            <input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00"
              className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-foreground/20" />
          </Field>
        </div>
      </div>

      {/* Line items */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Items</h2>
          <span className="text-xs text-muted">No VAT/GST (Hong Kong)</span>
        </div>
        <div className="space-y-2">
          <div className="hidden md:grid grid-cols-[1fr_5rem_8rem_8rem_2rem] gap-2 text-[10px] uppercase tracking-wide text-muted px-1">
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit price</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_5rem_8rem_8rem_2rem] gap-2 items-center">
              <input
                value={l.description}
                onChange={(e) => setLine(i, { description: e.target.value })}
                placeholder="Item or service"
                className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
              <input
                inputMode="decimal"
                value={l.quantity}
                onChange={(e) => setLine(i, { quantity: e.target.value })}
                className="w-full px-2 py-2 rounded-lg border border-line bg-card text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
              <input
                inputMode="decimal"
                value={l.price}
                onChange={(e) => setLine(i, { price: e.target.value })}
                placeholder="0.00"
                className="w-full px-2 py-2 rounded-lg border border-line bg-card text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
              <div className="text-right text-sm tabular-nums px-1">{fmtMoney(lineAmounts[i], currency)}</div>
              <button
                type="button"
                onClick={() => removeLine(i)}
                aria-label="Remove line"
                className="text-muted hover:text-foreground text-sm h-8"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addLine} className="btn btn-ghost text-sm px-0">+ Add line</button>

        <div className="border-t border-line pt-3 mt-2 ml-auto w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex justify-between text-muted"><span>Subtotal</span><span className="tabular-nums">{fmtMoney(subtotalCents, currency)}</span></div>
          {discountCents > 0 && (
            <div className="flex justify-between text-muted"><span>Discount</span><span className="tabular-nums">−{fmtMoney(discountCents, currency)}</span></div>
          )}
          <div className="flex justify-between font-semibold text-base pt-1"><span>Total</span><span className="tabular-nums">{fmtMoney(totalCents, currency)}</span></div>
        </div>
      </div>

      {/* Notes */}
      <div className="card p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Notes (shown to customer)">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Payment terms, thank-you note…"
            className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
        </Field>
        <Field label="Footer">
          <textarea value={footer} onChange={(e) => setFooter(e.target.value)} rows={3} placeholder="Bank account / how to pay, registration no…"
            className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
        </Field>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <button type="button" onClick={() => router.back()} className="btn btn-ghost text-sm">Cancel</button>
        {mode === "new" ? (
          <>
            <button type="submit" disabled={submitting} className="btn btn-ghost text-sm disabled:opacity-60">
              {submitting ? "Saving…" : "Save draft"}
            </button>
            <button type="button" disabled={submitting} onClick={(e) => submit(e, true)} className="btn btn-primary disabled:opacity-60">
              {submitting ? "Saving…" : "Save & mark sent"}
            </button>
          </>
        ) : (
          <button type="submit" disabled={submitting} className="btn btn-primary disabled:opacity-60">
            {submitting ? "Saving…" : "Save changes"}
          </button>
        )}
      </div>
    </form>
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
