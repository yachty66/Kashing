"use client";

import { useEffect, useState } from "react";
import { TransactionsView } from "@/components/TransactionsView";
import { BillsView } from "@/components/BillsView";

type Tab = "transactions" | "bills";

/**
 * Bookkeeping hub — the single place for the money side. Merges the live bank
 * feed (Transactions) and recorded supplier bills (Bills, AP) into one tabbed
 * page, replacing the previously separate top-level Transactions + Bookkeeping
 * entries. Deep-linkable via ?tab=bills.
 */
export default function BookkeepingPage() {
  const [tab, setTab] = useState<Tab>("transactions");

  // Honour ?tab=bills (client-only; avoids the useSearchParams Suspense rule).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "bills" || t === "transactions") setTab(t);
  }, []);

  function select(t: Tab) {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url.toString());
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "transactions", label: "Transactions" },
    { key: "bills", label: "Bills" },
  ];

  return (
    <div className="p-8 w-full">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Bookkeeping</h1>
        <p className="text-muted text-sm mt-1">Your bank feed and the bills you owe — one place.</p>
      </header>

      <div className="flex items-center gap-1 mb-5 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => select(t.key)}
            className={`px-4 py-2 text-sm -mb-px border-b-2 transition ${
              tab === t.key
                ? "border-foreground text-foreground font-medium"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "transactions" ? <TransactionsView /> : <BillsView />}
    </div>
  );
}
