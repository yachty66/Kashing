"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { InvoiceDocument } from "@/components/InvoiceDocument";

type Line = { id: number; description: string; quantity: string; unitPriceCents: number; amountCents: number };
type Invoice = {
  number: string; customerName: string | null; issueDate: string; dueDate: string | null; currency: string;
  status: string; subtotalCents: number; discountCents: number; totalCents: number; amountPaidCents: number;
  notes: string | null; footer: string | null;
};
type Profile = { name: string; brNumber: string | null; addressLines: string | null; email: string | null; phone: string | null; paymentInstructions: string | null } | null;
type Customer = { name: string; email: string | null; addressLines: string | null; brNumber: string | null } | null;

export default function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<{ invoice: Invoice; lines: Line[]; profile: Profile; customer: Customer } | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/public/invoice/${token}`);
      if (!r.ok) return setNotFound(true);
      setData(await r.json());
    })();
  }, [token]);

  if (notFound) return <div className="min-h-screen flex items-center justify-center text-muted text-sm">Invoice not found.</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-muted text-sm">Loading…</div>;

  const { invoice: inv, lines, profile, customer } = data;

  return (
    <div className="min-h-screen flex flex-col items-center py-10 px-4">
      <div className="w-full max-w-2xl mb-4 flex justify-end no-print">
        <button onClick={() => window.print()} className="btn btn-primary text-sm">Print / Save PDF</button>
      </div>
      <div className="w-full max-w-2xl">
        <InvoiceDocument invoice={inv} lines={lines} profile={profile} customer={customer} />
      </div>
    </div>
  );
}
