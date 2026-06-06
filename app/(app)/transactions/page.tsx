"use client";

import { TransactionsView } from "@/components/TransactionsView";

export default function TransactionsPage() {
  return (
    <div className="p-8 w-full">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="text-muted text-sm mt-1">Your live bank feed.</p>
      </header>
      <TransactionsView />
    </div>
  );
}
