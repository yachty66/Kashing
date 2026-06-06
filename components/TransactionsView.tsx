"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  id: number;
  bookingDate: string | null;
  valueDate: string | null;
  amountCents: number;
  currency: string;
  creditorName: string | null;
  debtorName: string | null;
  memo: string | null;
  status: string;
  category: string | null;
  accountName: string | null;
  accountIban: string | null;
};

const fmtMoney = (cents: number, currency = "EUR") => {
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
      signDisplay: "always",
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
};

/** The live bank-feed table. Rendered inside the Bookkeeping hub's first tab. */
export function TransactionsView() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [query, setQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState<string>("");

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/transactions");
      if (!r.ok) return setRows([]);
      setRows((await r.json()).transactions);
    })();
  }, []);

  const accountOptions = useMemo(() => {
    if (!rows) return [] as string[];
    const set = new Set<string>();
    for (const r of rows) if (r.accountName) set.add(r.accountName);
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [] as Row[];
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (accountFilter && r.accountName !== accountFilter) return false;
      if (!q) return true;
      const hay = [r.creditorName, r.debtorName, r.memo, r.accountName, r.bookingDate]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, accountFilter]);

  if (rows === null) return <div className="text-muted text-sm py-8">Loading transactions…</div>;

  if (rows.length === 0) {
    return (
      <p className="text-muted text-sm py-8">
        No transactions yet. Connect a bank on the Contracts page and hit
        <strong className="text-foreground"> Pull &amp; analyze</strong> to import them.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex gap-2 items-center justify-end flex-wrap">
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-line bg-card text-sm"
        >
          <option value="">All accounts</option>
          {accountOptions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <input
          type="search"
          placeholder="Search merchant or memo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="px-3 py-2 rounded-lg border border-line bg-card text-sm w-64 focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>

      <div className="card">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="text-muted text-left">
              <th className="font-medium px-4 py-3 border-b border-line">Date</th>
              <th className="font-medium px-4 py-3 border-b border-line">Merchant</th>
              <th className="font-medium px-4 py-3 border-b border-line text-right">Amount</th>
              <th className="font-medium px-4 py-3 border-b border-line">Category</th>
              <th className="font-medium px-4 py-3 border-b border-line">Account</th>
              <th className="font-medium px-4 py-3 border-b border-line">Memo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const date = r.bookingDate ?? r.valueDate ?? "";
              const merchant = r.amountCents < 0 ? r.creditorName : r.debtorName;
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-2.5 border-t border-line text-muted whitespace-nowrap tabular-nums">{date}</td>
                  <td className="px-4 py-2.5 border-t border-line">
                    <div className="font-medium">{merchant || <span className="text-muted">—</span>}</div>
                    {r.status === "pending" && <span className="pill text-[10px] mt-0.5 inline-block">pending</span>}
                  </td>
                  <td className="px-4 py-2.5 border-t border-line text-right tabular-nums whitespace-nowrap text-foreground">
                    {fmtMoney(r.amountCents, r.currency)}
                  </td>
                  <td className="px-4 py-2.5 border-t border-line whitespace-nowrap">
                    {r.category ? <span className="pill">{r.category}</span> : <span className="text-muted text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5 border-t border-line text-muted whitespace-nowrap">
                    {r.accountName ?? r.accountIban ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 border-t border-line text-muted text-xs max-w-[24rem] truncate" title={r.memo ?? ""}>
                    {r.memo || ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
