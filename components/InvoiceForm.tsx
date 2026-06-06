"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { centsToInput, fmtMoney, inputToCents, lineAmountCents, todayISO } from "@/lib/invoices";
import { InvoiceDocument, type DocCustomer, type DocProfile } from "@/components/InvoiceDocument";

type Customer = { id: number; name: string; email: string | null; addressLines: string | null; city: string | null; brNumber: string | null; defaultCurrency: string };
type LineRow = { description: string; details: string; unit: string; quantity: string; price: string };

export type InvoiceFormInitial = {
  customerId: number | null;
  customerName: string | null;
  documentType: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  discountKind: string;
  discountPercent: string | null;
  discountCents: number;
  recurrenceKind: string;
  recurrenceInterval: string | null;
  recurrenceEndAt: string | null;
  servicePeriodStart: string | null;
  servicePeriodEnd: string | null;
  orderNumber: string | null;
  headerText: string | null;
  notes: string | null;
  footer: string | null;
  lines: { description: string; details: string | null; unit: string | null; quantity: string; unitPriceCents: number }[];
};

const CURRENCIES = ["HKD", "USD", "CNY", "EUR", "GBP", "SGD", "JPY"];
const NEW_CUSTOMER = "__new__";
const NO_CUSTOMER = "";
const QUICK_TERMS = [0, 15, 30, 45];
const STEPS = ["Details", "Line items", "Send"] as const;
const LIGHT_KEY = "kashing-invoice-light";

function emptyLine(): LineRow {
  return { description: "", details: "", unit: "", quantity: "1", price: "" };
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function InvoiceForm({
  mode,
  invoiceId,
  initial,
  defaultCurrency = "HKD",
  existingNumber,
}: {
  mode: "new" | "edit";
  invoiceId?: number;
  initial?: InvoiceFormInitial;
  defaultCurrency?: string;
  existingNumber?: string;
}) {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [profile, setProfile] = useState<DocProfile>(null);
  const [previewNumber, setPreviewNumber] = useState(existingNumber ?? "—");
  const [light, setLight] = useState(false);

  const [documentType, setDocumentType] = useState(initial?.documentType ?? "invoice");
  const [customerSel, setCustomerSel] = useState<string>(initial?.customerId != null ? String(initial.customerId) : NO_CUSTOMER);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [freeName, setFreeName] = useState(initial?.customerName ?? "");

  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? todayISO());
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? addDays(initial?.issueDate ?? todayISO(), 14));
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);

  const [recurrenceKind, setRecurrenceKind] = useState(initial?.recurrenceKind ?? "one_off");
  const [recurrenceInterval, setRecurrenceInterval] = useState(initial?.recurrenceInterval ?? "monthly");
  const [recurrenceEndAt, setRecurrenceEndAt] = useState(initial?.recurrenceEndAt ?? "");
  const [servicePeriodStart, setServicePeriodStart] = useState(initial?.servicePeriodStart ?? "");
  const [servicePeriodEnd, setServicePeriodEnd] = useState(initial?.servicePeriodEnd ?? "");
  const [orderNumber, setOrderNumber] = useState(initial?.orderNumber ?? "");
  const [headerText, setHeaderText] = useState(initial?.headerText ?? "");

  const [discountKind, setDiscountKind] = useState(initial?.discountKind ?? "amount");
  const [discountVal, setDiscountVal] = useState(
    initial?.discountKind === "percent"
      ? initial?.discountPercent ?? ""
      : initial && initial.discountCents > 0 ? centsToInput(initial.discountCents) : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [footer, setFooter] = useState(initial?.footer ?? "");
  const [lines, setLines] = useState<LineRow[]>(
    initial?.lines.length
      ? initial.lines.map((l) => ({ description: l.description, details: l.details ?? "", unit: l.unit ?? "", quantity: l.quantity, price: centsToInput(l.unitPriceCents) }))
      : [emptyLine()],
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try { setLight(localStorage.getItem(LIGHT_KEY) === "1"); } catch {}
    (async () => {
      const [cRes, pRes] = await Promise.all([fetch("/api/customers"), fetch("/api/business-profile")]);
      if (cRes.ok) setCustomers((await cRes.json()).customers ?? []);
      if (pRes.ok) {
        const p = (await pRes.json()).profile;
        setProfile(p);
        if (mode === "new" && p) {
          const yr = new Date().getFullYear();
          setPreviewNumber(`${p.invoicePrefix}-${yr}-${String(p.nextSeq).padStart(4, "0")}`);
        }
      }
    })();
  }, [mode]);

  function toggleLight() {
    setLight((v) => {
      const next = !v;
      try { localStorage.setItem(LIGHT_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }

  const lineAmounts = useMemo(() => lines.map((l) => lineAmountCents(l.quantity, inputToCents(l.price))), [lines]);
  const subtotalCents = lineAmounts.reduce((s, a) => s + a, 0);
  const discountCents =
    discountKind === "percent"
      ? Math.round((subtotalCents * Math.max(0, Math.min(100, parseFloat(discountVal.replace(",", ".")) || 0))) / 100)
      : Math.max(0, inputToCents(discountVal));
  const totalCents = Math.max(0, subtotalCents - discountCents);

  function setLine(i: number, patch: Partial<LineRow>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  const addLine = () => setLines((p) => [...p, emptyLine()]);
  const removeLine = (i: number) => setLines((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p));

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
  const setTerm = (days: number) => setDueDate(addDays(issueDate, days));
  function onIssueDate(v: string) {
    if (dueDate) {
      const gap = Math.round((new Date(dueDate).getTime() - new Date(issueDate).getTime()) / 86400000);
      if (Number.isFinite(gap)) setDueDate(addDays(v, gap));
    }
    setIssueDate(v);
  }

  const previewCustomer: DocCustomer = useMemo(() => {
    if (customerSel === NEW_CUSTOMER) {
      return newCustomerName.trim() ? { name: newCustomerName.trim(), addressLines: null, city: null, brNumber: null, email: newCustomerEmail.trim() || null } : null;
    }
    const c = customers.find((x) => String(x.id) === customerSel);
    if (c) return { name: freeName.trim() || c.name, addressLines: c.addressLines, city: c.city, brNumber: c.brNumber, email: c.email };
    return freeName.trim() ? { name: freeName.trim(), addressLines: null, city: null, brNumber: null, email: null } : null;
  }, [customerSel, customers, freeName, newCustomerName, newCustomerEmail]);

  const previewDoc = {
    number: previewNumber,
    documentType,
    customerName: previewCustomer?.name ?? null,
    issueDate,
    dueDate: dueDate || null,
    currency,
    status: "draft",
    subtotalCents,
    discountCents,
    discountKind,
    discountPercent: discountKind === "percent" ? discountVal : null,
    totalCents,
    amountPaidCents: 0,
    orderNumber: orderNumber.trim() || null,
    servicePeriodStart: servicePeriodStart || null,
    servicePeriodEnd: servicePeriodEnd || null,
    headerText: headerText.trim() || null,
    notes: notes.trim() || null,
    footer: footer.trim() || null,
  };
  const previewLines = lines.map((l, i) => ({
    id: i,
    description: l.description,
    details: l.details.trim() || null,
    unit: l.unit.trim() || null,
    quantity: l.quantity || "1",
    unitPriceCents: inputToCents(l.price),
    amountCents: lineAmounts[i],
  }));

  async function resolveCustomer(): Promise<{ customerId: number | null; customerName: string | null }> {
    if (customerSel === NEW_CUSTOMER) {
      const name = newCustomerName.trim();
      if (!name) throw new Error("New customer needs a name.");
      const r = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email: newCustomerEmail.trim() || undefined, defaultCurrency: currency }) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? "Could not create customer");
      const c = (await r.json()).customer as Customer;
      return { customerId: c.id, customerName: c.name };
    }
    if (customerSel && customerSel !== NO_CUSTOMER) return { customerId: Number(customerSel), customerName: freeName.trim() || null };
    return { customerId: null, customerName: freeName.trim() || null };
  }

  async function save(markSent: boolean) {
    setError(null);
    if (lineAmounts.every((a) => a === 0) && subtotalCents === 0) {
      setError("Add at least one line with an amount.");
      setStep(1);
      return;
    }
    setSubmitting(true);
    try {
      const { customerId, customerName } = await resolveCustomer();
      const payload = {
        customerId,
        customerName,
        documentType,
        issueDate,
        dueDate: dueDate || null,
        currency,
        discountKind,
        ...(discountKind === "percent"
          ? { discountPercent: parseFloat(discountVal.replace(",", ".")) || 0 }
          : { discountCents: inputToCents(discountVal) }),
        recurrenceKind,
        recurrenceInterval: recurrenceKind === "recurring" ? recurrenceInterval : null,
        recurrenceEndAt: recurrenceKind === "recurring" ? recurrenceEndAt || null : null,
        servicePeriodStart: servicePeriodStart || null,
        servicePeriodEnd: servicePeriodEnd || null,
        orderNumber: orderNumber.trim() || null,
        headerText: headerText.trim() || null,
        notes: notes.trim() || null,
        footer: footer.trim() || null,
        lines: lines.map((l) => ({ description: l.description.trim(), details: l.details.trim() || null, unit: l.unit.trim() || null, quantity: l.quantity.trim() || "1", unitPriceCents: inputToCents(l.price) })),
        ...(mode === "new" ? { status: markSent ? "sent" : "draft" } : {}),
      };
      const url = mode === "new" ? "/api/invoices" : `/api/invoices/${invoiceId}`;
      const r = await fetch(url, { method: mode === "new" ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
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
    <div className="flex flex-col lg:flex-row gap-6">
      {/* ── Form pane ──────────────────────────────────────────────── */}
      <div className="lg:w-[440px] shrink-0 space-y-5">
        <div className="flex items-center gap-2 text-sm">
          {STEPS.map((label, i) => (
            <button key={label} type="button" onClick={() => setStep(i)} className="flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${i === step ? "bg-foreground text-background" : "border border-line text-muted"}`}>{i + 1}</span>
              <span className={i === step ? "text-foreground font-medium" : "text-muted"}>{label}</span>
              {i < STEPS.length - 1 && <span className="text-muted px-1">›</span>}
            </button>
          ))}
        </div>

        {error && <div className="px-4 py-3 rounded-lg bg-card border border-foreground text-foreground text-sm">{error}</div>}

        {step === 0 && (
          <div className="space-y-5">
            <Section label="Document type">
              <div className="grid grid-cols-2 gap-2">
                {(["invoice", "credit_note"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setDocumentType(t)}
                    className={`px-3 py-2 rounded-lg text-sm border ${documentType === t ? "bg-foreground text-background border-foreground" : "border-line text-muted hover:text-foreground"}`}>
                    {t === "invoice" ? "Invoice" : "Credit note"}
                  </button>
                ))}
              </div>
            </Section>

            <Section label="Issuer">
              <div className="card p-3 text-sm">
                <div className="font-medium">{profile?.name ?? "—"}</div>
                {profile?.addressLines && <div className="text-muted text-xs whitespace-pre-line">{profile.addressLines}</div>}
                {profile?.brNumber && <div className="text-muted text-xs">BR: {profile.brNumber}</div>}
              </div>
            </Section>

            <Section label="Customer *">
              <select value={customerSel} onChange={(e) => onPickCustomer(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm">
                <option value={NO_CUSTOMER}>Select a customer…</option>
                {customers.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                <option value={NEW_CUSTOMER}>+ New customer…</option>
              </select>
              {customerSel === NEW_CUSTOMER && (
                <div className="grid grid-cols-1 gap-2 mt-2">
                  <Inp v={newCustomerName} on={setNewCustomerName} placeholder="New customer name *" />
                  <Inp v={newCustomerEmail} on={setNewCustomerEmail} placeholder="Email (optional)" />
                </div>
              )}
            </Section>

            <Section label="Invoice details">
              <div className="text-xs text-muted mb-2">Invoice number: <span className="text-foreground">{previewNumber}</span></div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Recurrence">
                  <select value={recurrenceKind} onChange={(e) => setRecurrenceKind(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm">
                    <option value="one_off">One-off</option>
                    <option value="recurring">Recurring</option>
                  </select>
                </Field>
                {recurrenceKind === "recurring" && (
                  <Field label="Every">
                    <select value={recurrenceInterval} onChange={(e) => setRecurrenceInterval(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm">
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </Field>
                )}
              </div>
              {recurrenceKind === "recurring" && (
                <div className="mt-3">
                  <Field label="Repeat until (optional)">
                    <input type="date" value={recurrenceEndAt} onChange={(e) => setRecurrenceEndAt(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm" />
                  </Field>
                </div>
              )}

              <div className="mt-3">
                <Field label="Issue date">
                  <input type="date" value={issueDate} onChange={(e) => onIssueDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm" />
                </Field>
              </div>

              <div className="mt-3">
                <span className="block text-xs uppercase tracking-wide text-muted mb-1.5">Payment term</span>
                <div className="flex flex-wrap gap-2">
                  {QUICK_TERMS.map((d) => {
                    const active = dueDate === addDays(issueDate, d);
                    return (
                      <button key={d} type="button" onClick={() => setTerm(d)}
                        className={`px-3 py-1.5 rounded-lg text-sm border ${active ? "bg-foreground text-background border-foreground" : "border-line text-muted hover:text-foreground"}`}>
                        {d === 0 ? "On receipt" : `Net ${d}`}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="px-3 py-2 rounded-lg border border-line bg-card text-sm" />
                  <span className="text-xs text-muted">due date</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="Service period start"><input type="date" value={servicePeriodStart} onChange={(e) => setServicePeriodStart(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm" /></Field>
                <Field label="Service period end"><input type="date" value={servicePeriodEnd} onChange={(e) => setServicePeriodEnd(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm" /></Field>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="Order number"><Inp v={orderNumber} on={setOrderNumber} placeholder="optional" /></Field>
                <Field label="Currency">
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm">
                    {[...new Set([currency, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
            </Section>

            <Section label="Intro text (optional)">
              <textarea value={headerText} onChange={(e) => setHeaderText(e.target.value)} rows={2} placeholder="Dear Sir or Madam, please find our invoice for the following services:"
                className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
            </Section>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Section label="Line items">
              <div className="space-y-3">
                {lines.map((l, i) => (
                  <div key={i} className="card p-3 space-y-2">
                    <div className="flex gap-2">
                      <input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Item or service"
                        className="flex-1 px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
                      <button type="button" onClick={() => removeLine(i)} aria-label="Remove" className="text-muted hover:text-foreground text-sm w-6">✕</button>
                    </div>
                    <input value={l.details} onChange={(e) => setLine(i, { details: e.target.value })} placeholder="Details (optional)"
                      className="w-full px-3 py-2 rounded-lg border border-line bg-card text-xs focus:outline-none focus:ring-2 focus:ring-foreground/20" />
                    <div className="grid grid-cols-3 gap-2">
                      <LabeledMini label="Qty"><input inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className="w-full px-2 py-1.5 rounded-lg border border-line bg-card text-sm text-right tabular-nums" /></LabeledMini>
                      <LabeledMini label="Unit"><input value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} placeholder="h, pcs…" className="w-full px-2 py-1.5 rounded-lg border border-line bg-card text-sm" /></LabeledMini>
                      <LabeledMini label="Unit price"><input inputMode="decimal" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} placeholder="0.00" className="w-full px-2 py-1.5 rounded-lg border border-line bg-card text-sm text-right tabular-nums" /></LabeledMini>
                    </div>
                    <div className="text-right text-xs text-muted">Amount: <span className="text-foreground tabular-nums">{fmtMoney(lineAmounts[i], currency)}</span></div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addLine} className="btn btn-ghost text-sm px-0 mt-1">+ Add line</button>
            </Section>

            <Section label="Discount & notes">
              <div className="grid grid-cols-[7rem_1fr] gap-2">
                <select value={discountKind} onChange={(e) => setDiscountKind(e.target.value)} className="px-3 py-2 rounded-lg border border-line bg-card text-sm">
                  <option value="amount">Amount</option>
                  <option value="percent">Percent</option>
                </select>
                <input inputMode="decimal" value={discountVal} onChange={(e) => setDiscountVal(e.target.value)} placeholder={discountKind === "percent" ? "0 %" : "0.00"}
                  className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-foreground/20" />
              </div>
              <div className="mt-3">
                <Field label="Notes (shown to customer)">
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Footer">
                  <textarea value={footer} onChange={(e) => setFooter(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
                </Field>
              </div>
            </Section>
          </div>
        )}

        {step === 2 && (
          <Section label="Review & send">
            <p className="text-sm text-muted">Check the preview on the right, then save. You can mark it sent now or keep it as a draft.</p>
            <div className="card p-4 mt-3 text-sm space-y-1">
              <Row k="Customer" v={previewCustomer?.name ?? "—"} />
              <Row k={documentType === "credit_note" ? "Credit note no." : "Invoice no."} v={previewNumber} />
              <Row k="Issue / due" v={`${issueDate} → ${dueDate || "—"}`} />
              {recurrenceKind === "recurring" && <Row k="Recurring" v={`${recurrenceInterval}${recurrenceEndAt ? ` until ${recurrenceEndAt}` : ""}`} />}
              <Row k="Total" v={fmtMoney(totalCents, currency)} bold />
            </div>
          </Section>
        )}

        <div className="flex items-center justify-between pt-2">
          <button type="button" onClick={() => (step === 0 ? router.back() : setStep(step - 1))} className="btn btn-ghost text-sm">
            {step === 0 ? "Cancel" : "Back"}
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => setStep(step + 1)} className="btn btn-primary text-sm">Next ›</button>
          ) : mode === "new" ? (
            <div className="flex gap-2">
              <button type="button" disabled={submitting} onClick={() => save(false)} className="btn btn-ghost text-sm disabled:opacity-60">{submitting ? "Saving…" : "Save draft"}</button>
              <button type="button" disabled={submitting} onClick={() => save(true)} className="btn btn-primary text-sm disabled:opacity-60">{submitting ? "Saving…" : "Save & mark sent"}</button>
            </div>
          ) : (
            <button type="button" disabled={submitting} onClick={() => save(false)} className="btn btn-primary text-sm disabled:opacity-60">{submitting ? "Saving…" : "Save changes"}</button>
          )}
        </div>
      </div>

      {/* ── Live preview pane ──────────────────────────────────────── */}
      <div className="flex-1 min-w-0">
        <div className="lg:sticky lg:top-6">
          <div className="flex justify-end mb-2">
            <button type="button" onClick={toggleLight} className="btn btn-ghost text-xs">
              {light ? "◑ White document" : "◐ Dark document"}
            </button>
          </div>
          <InvoiceDocument invoice={previewDoc} lines={previewLines} profile={profile} customer={previewCustomer} light={light} />
        </div>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-2">{label}</div>
      {children}
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
function LabeledMini({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wide text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
function Inp({ v, on, placeholder }: { v: string; on: (v: string) => void; placeholder?: string }) {
  return <input value={v} onChange={(e) => on(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />;
}
function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className="flex justify-between"><span className="text-muted">{k}</span><span className={bold ? "font-semibold tabular-nums" : "tabular-nums"}>{v}</span></div>;
}
