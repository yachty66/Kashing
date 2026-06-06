"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { InvoiceForm } from "@/components/InvoiceForm";

export default function NewInvoicePage() {
  const [defaultCurrency, setDefaultCurrency] = useState("HKD");

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/business-profile");
      if (r.ok) setDefaultCurrency((await r.json()).profile?.defaultCurrency ?? "HKD");
    })();
  }, []);

  return (
    <div className="p-8 w-full max-w-4xl">
      <div className="mb-6">
        <Link href="/invoices" className="text-muted hover:text-foreground text-sm">← Invoices</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">New invoice</h1>
      </div>
      <InvoiceForm mode="new" defaultCurrency={defaultCurrency} />
    </div>
  );
}
