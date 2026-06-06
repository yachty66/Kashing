"use client";

import { BillsView } from "@/components/BillsView";

export default function BillsPage() {
  return (
    <div className="p-8 w-full">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Bills</h1>
      </header>
      <BillsView />
    </div>
  );
}
