import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { bills, suppliers } from "@/lib/db/schema";
import { normalizeIban, normalizeBic } from "@/lib/iban";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db.select().from(bills).orderBy(desc(bills.createdAt));
  return NextResponse.json({ bills: rows });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as {
    supplierId?: number | null;
    supplierName?: string;
    invoiceNumber?: string;
    invoiceDate?: string;
    dueDate?: string;
    description?: string;
    amountCents?: number;
    currency?: string;
    paymentIban?: string;
    paymentBic?: string;
  } | null;
  if (!b) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const amountCents = Math.round(Number(b.amountCents) || 0);
  if (amountCents <= 0) return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });

  // Snapshot supplier name + default banking from the supplier record.
  let supplierName = b.supplierName?.trim() || null;
  let supplierId: number | null = null;
  let iban = normalizeIban(b.paymentIban);
  let bic = normalizeBic(b.paymentBic);
  if (typeof b.supplierId === "number") {
    const [s] = await db.select().from(suppliers).where(eq(suppliers.id, b.supplierId));
    if (s) {
      supplierId = s.id;
      supplierName = supplierName ?? s.name;
      iban = iban ?? s.iban;
      bic = bic ?? s.bic;
    }
  }
  if (!supplierName) return NextResponse.json({ error: "Supplier is required" }, { status: 400 });

  const [row] = await db
    .insert(bills)
    .values({
      supplierId,
      supplierName,
      invoiceNumber: b.invoiceNumber?.trim() || null,
      invoiceDate: b.invoiceDate?.trim() || null,
      dueDate: b.dueDate?.trim() || null,
      description: b.description?.trim() || null,
      amountCents,
      currency: b.currency?.trim() || "EUR",
      paymentIban: iban,
      paymentBic: bic,
    })
    .returning();
  return NextResponse.json({ bill: row }, { status: 201 });
}
