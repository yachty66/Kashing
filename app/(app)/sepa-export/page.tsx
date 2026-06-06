"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Bill = {
  id: number;
  supplierName: string | null;
  invoiceNumber: string | null;
  amountCents: number;
  currency: string;
  paymentIban: string | null;
  status: string;
};
type SepaFile = {
  id: number;
  filename: string;
  entityName: string;
  count: number;
  totalCents: number;
  status: string;
  createdAt: string;
};
type ValErr = { billId: number | "entity"; supplier: string; errors: string[] };

const fmt = (cents: number, cur = "EUR") => {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: cur }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${cur}`;
  }
};

export default function SepaExportPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [files, setFiles] = useState<SepaFile[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [valErrors, setValErrors] = useState<ValErr[]>([]);

  const load = useCallback(async () => {
    const [bRes, fRes] = await Promise.all([fetch("/api/bills"), fetch("/api/sepa")]);
    const allBills: Bill[] = bRes.ok ? (await bRes.json()).bills : [];
    setBills(allBills.filter((b) => b.status === "unpaid"));
    setFiles(fRes.ok ? (await fRes.json()).files : []);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const allSelected = bills.length > 0 && selected.size === bills.length;
  const selectedTotal = useMemo(
    () => bills.filter((b) => selected.has(b.id)).reduce((s, b) => s + b.amountCents, 0),
    [bills, selected],
  );

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(bills.map((b) => b.id)));
  }

  async function generate() {
    setError(null);
    setValErrors([]);
    const ids = [...selected];
    if (ids.length === 0) return setError("Please select at least one bill.");
    setGenerating(true);
    try {
      const r = await fetch("/api/sepa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ billIds: ids }) });
      const data = await r.json().catch(() => ({}));
      if (r.status === 422 && data.validation) {
        setValErrors(data.validation);
        return;
      }
      if (!r.ok) throw new Error(data.error ?? "Generation failed");
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <div className="p-8 text-muted text-sm">Loading…</div>;

  return (
    <div className="p-8 w-full">
      <header className="mb-5 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">SEPA Export</h1>
          <p className="text-muted text-sm mt-1">Bundle open incoming bills into a SEPA credit transfer (pain.001) file</p>
        </div>
        <button onClick={generate} disabled={generating || selected.size === 0} className="btn btn-primary text-sm disabled:opacity-50">
          {generating ? "Generating…" : `Generate${selected.size ? ` (${selected.size})` : ""}`}
        </button>
      </header>

      {error && <div className="mb-4 px-4 py-3 rounded-lg bg-card border border-foreground text-sm">{error}</div>}
      {valErrors.length > 0 && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-card border border-foreground text-sm space-y-1">
          <div className="font-medium">Validation failed — please fix:</div>
          {valErrors.map((v) => (
            <div key={String(v.billId)} className="text-muted">• {v.supplier}: {v.errors.join(", ")}</div>
          ))}
          <div className="text-xs text-muted pt-1">Tip: set the sender IBAN in Invoices → Settings, and the payee IBAN on the supplier/bill.</div>
        </div>
      )}

      {/* Unpaid bills */}
      <div className="card mb-6">
        <div className="px-4 py-3 border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-semibold">Unpaid bills ({bills.length})</h2>
          {selected.size > 0 && <span className="text-sm text-muted tabular-nums">Selected: {fmt(selectedTotal)}</span>}
        </div>
        {bills.length === 0 ? (
          <div className="px-4 py-10 text-center text-muted text-sm">No unpaid bills</div>
        ) : (
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-muted text-left">
                <th className="px-4 py-3 border-b border-line w-8"><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
                <th className="font-medium px-4 py-3 border-b border-line">SUPPLIER</th>
                <th className="font-medium px-4 py-3 border-b border-line">NUMBER</th>
                <th className="font-medium px-4 py-3 border-b border-line text-right">AMOUNT</th>
                <th className="font-medium px-4 py-3 border-b border-line">IBAN</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id} className="align-top hover:bg-foreground/[0.03] cursor-pointer" onClick={() => toggle(b.id)}>
                  <td className="px-4 py-3 border-t border-line"><input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} onClick={(e) => e.stopPropagation()} /></td>
                  <td className="px-4 py-3 border-t border-line font-medium">{b.supplierName || "—"}</td>
                  <td className="px-4 py-3 border-t border-line text-muted">{b.invoiceNumber || "—"}</td>
                  <td className="px-4 py-3 border-t border-line text-right tabular-nums whitespace-nowrap">{fmt(b.amountCents, b.currency)}</td>
                  <td className="px-4 py-3 border-t border-line text-muted tabular-nums">{b.paymentIban || <span className="text-red-500">missing</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Generated files */}
      <div className="card">
        <div className="px-4 py-3 border-b border-line"><h2 className="text-sm font-semibold">Generated SEPA files ({files.length})</h2></div>
        {files.length === 0 ? (
          <div className="px-4 py-8 text-center text-muted text-sm">No files generated yet</div>
        ) : (
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-muted text-left">
                <th className="font-medium px-4 py-3 border-b border-line">FILE</th>
                <th className="font-medium px-4 py-3 border-b border-line text-right">BILLS</th>
                <th className="font-medium px-4 py-3 border-b border-line text-right">TOTAL</th>
                <th className="font-medium px-4 py-3 border-b border-line">STATUS</th>
                <th className="font-medium px-4 py-3 border-b border-line">CREATED</th>
                <th className="font-medium px-4 py-3 border-b border-line w-24"></th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="hover:bg-foreground/[0.03]">
                  <td className="px-4 py-3 border-t border-line font-medium">{f.filename}</td>
                  <td className="px-4 py-3 border-t border-line text-right tabular-nums">{f.count}</td>
                  <td className="px-4 py-3 border-t border-line text-right tabular-nums whitespace-nowrap">{fmt(f.totalCents)}</td>
                  <td className="px-4 py-3 border-t border-line"><span className="pill pill-medium">{f.status}</span></td>
                  <td className="px-4 py-3 border-t border-line text-muted tabular-nums whitespace-nowrap">{f.createdAt?.slice(0, 10)}</td>
                  <td className="px-4 py-3 border-t border-line text-right"><a href={`/api/sepa/${f.id}/download`} className="text-foreground hover:underline text-sm">Download</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
