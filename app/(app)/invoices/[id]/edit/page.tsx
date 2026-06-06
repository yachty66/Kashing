"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { InvoiceForm, type InvoiceFormInitial } from "@/components/InvoiceForm";

export default function EditInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const [initial, setInitial] = useState<InvoiceFormInitial | null>(null);
  const [number, setNumber] = useState("");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/invoices/${id}`);
      if (!r.ok) return setNotFound(true);
      const d = await r.json();
      setNumber(d.invoice.number);
      setInitial({
        customerId: d.invoice.customerId,
        customerName: d.invoice.customerName,
        issueDate: d.invoice.issueDate,
        dueDate: d.invoice.dueDate,
        currency: d.invoice.currency,
        discountCents: Number(d.invoice.discountCents),
        notes: d.invoice.notes,
        footer: d.invoice.footer,
        lines: (d.lines ?? []).map((l: { description: string; quantity: string; unitPriceCents: number }) => ({
          description: l.description,
          quantity: l.quantity,
          unitPriceCents: Number(l.unitPriceCents),
        })),
      });
    })();
  }, [id]);

  if (notFound) return <div className="p-8 text-muted text-sm">Invoice not found.</div>;
  if (!initial) return <div className="p-8 text-muted text-sm">Loading…</div>;

  return (
    <div className="p-8 w-full">
      <div className="mb-6">
        <Link href={`/invoices/${id}`} className="text-muted hover:text-foreground text-sm">← {number}</Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Edit {number}</h1>
      </div>
      <InvoiceForm mode="edit" invoiceId={Number(id)} initial={initial} existingNumber={number} />
    </div>
  );
}
