import { NextRequest, NextResponse } from "next/server";
import { desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { bills, sepaFiles } from "@/lib/db/schema";
import { getOrCreateBusinessProfile } from "@/lib/invoice-server";
import { generateSepaXml, validateSepaBills, type SepaBill } from "@/lib/sepa";

export const runtime = "nodejs";

/** List generated SEPA files (without the XML payload). */
export async function GET() {
  const rows = await db
    .select({
      id: sepaFiles.id,
      filename: sepaFiles.filename,
      entityName: sepaFiles.entityName,
      count: sepaFiles.count,
      totalCents: sepaFiles.totalCents,
      status: sepaFiles.status,
      createdAt: sepaFiles.createdAt,
    })
    .from(sepaFiles)
    .orderBy(desc(sepaFiles.createdAt));
  return NextResponse.json({ files: rows });
}

/** POST { billIds: number[] } — bundle unpaid bills into one SEPA file. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { billIds?: number[] } | null;
  const ids = (body?.billIds ?? []).filter((n) => Number.isInteger(n));
  if (ids.length === 0) return NextResponse.json({ error: "No bills selected" }, { status: 400 });

  const profile = await getOrCreateBusinessProfile();
  const entity = { name: profile.name, iban: profile.iban, bic: profile.bic };

  const rows = (await db.select().from(bills).where(inArray(bills.id, ids))).filter(
    (b) => b.status !== "paid",
  );
  if (rows.length === 0) return NextResponse.json({ error: "No open bills found" }, { status: 400 });

  // Pre-flight validation (debtor + every creditor).
  const errors = validateSepaBills(
    rows.map((b) => ({
      id: b.id,
      invoice_number: b.invoiceNumber,
      supplier: b.supplierName,
      amountCents: Number(b.amountCents),
      currency: b.currency,
      payment_iban: b.paymentIban,
      payment_bic: b.paymentBic,
    })),
    entity,
  );
  if (errors.length) return NextResponse.json({ error: "Validation failed", validation: errors }, { status: 422 });

  const sepaBills: SepaBill[] = rows.map((b) => ({
    id: b.id,
    supplier: b.supplierName ?? "Unknown",
    amountCents: Number(b.amountCents),
    payment_iban: b.paymentIban,
    payment_bic: b.paymentBic,
    invoice_number: b.invoiceNumber,
    description: b.description,
  }));

  const now = new Date();
  const xml = generateSepaXml(sepaBills, entity, now.getTime(), now.toISOString());
  const totalCents = rows.reduce((s, b) => s + Number(b.amountCents), 0);

  const seq = (await db.select({ id: sepaFiles.id }).from(sepaFiles)).length + 1;
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const filename = `sepa-${yy}${mm}${dd}-${String(seq).padStart(3, "0")}.xml`;

  const [file] = await db
    .insert(sepaFiles)
    .values({
      filename,
      entityName: entity.name,
      debtorIban: (entity.iban ?? "").replace(/\s/g, "").toUpperCase(),
      count: rows.length,
      totalCents,
      xml,
    })
    .returning({ id: sepaFiles.id, filename: sepaFiles.filename, count: sepaFiles.count, totalCents: sepaFiles.totalCents });

  // Mark the bundled bills as paid + link to this file.
  await db
    .update(bills)
    .set({ status: "paid", paidAt: now, sepaFileId: file.id, updatedAt: now })
    .where(inArray(bills.id, rows.map((b) => b.id)));

  return NextResponse.json({ file }, { status: 201 });
}
