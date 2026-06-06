import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { bills } from "@/lib/db/schema";

export const runtime = "nodejs";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Buchhaltung CSV export — one row per bill, for an accountant / DATEV import. */
export async function GET() {
  const rows = await db.select().from(bills).orderBy(desc(bills.invoiceDate));
  const header = [
    "Invoice date",
    "Supplier",
    "Invoice number",
    "Description",
    "Amount",
    "Currency",
    "Status",
    "Due",
    "IBAN",
  ];
  const lines = [header.join(";")];
  for (const b of rows) {
    lines.push(
      [
        b.invoiceDate ?? "",
        b.supplierName ?? "",
        b.invoiceNumber ?? "",
        b.description ?? "",
        (Number(b.amountCents) / 100).toFixed(2),
        b.currency,
        b.status,
        b.dueDate ?? "",
        b.paymentIban ?? "",
      ]
        .map(csvCell)
        .join(";"),
    );
  }
  const csv = "﻿" + lines.join("\n"); // BOM so Excel reads UTF-8
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="buchhaltung-export.csv"`,
    },
  });
}
