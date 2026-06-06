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
      const v = d.invoice;
      setInitial({
        customerId: v.customerId,
        customerName: v.customerName,
        documentType: v.documentType ?? "invoice",
        issueDate: v.issueDate,
        dueDate: v.dueDate,
        currency: v.currency,
        discountKind: v.discountKind ?? "amount",
        discountPercent: v.discountPercent ?? null,
        discountCents: Number(v.discountCents),
        recurrenceKind: v.recurrenceKind ?? "one_off",
        recurrenceInterval: v.recurrenceInterval ?? null,
        recurrenceEndAt: v.recurrenceEndAt ?? null,
        servicePeriodStart: v.servicePeriodStart ?? null,
        servicePeriodEnd: v.servicePeriodEnd ?? null,
        orderNumber: v.orderNumber ?? null,
        headerText: v.headerText ?? null,
        notes: v.notes,
        footer: v.footer,
        lines: (d.lines ?? []).map((l: { description: string; details: string | null; unit: string | null; quantity: string; unitPriceCents: number }) => ({
          description: l.description,
          details: l.details ?? null,
          unit: l.unit ?? null,
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
