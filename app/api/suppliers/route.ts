import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import { normalizeIban, normalizeBic } from "@/lib/iban";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db.select().from(suppliers).orderBy(asc(suppliers.name));
  return NextResponse.json({ suppliers: rows });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as Record<string, string> | null;
  if (!b?.name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const [row] = await db
    .insert(suppliers)
    .values({
      name: b.name.trim(),
      normalizedName: b.name.trim().toLowerCase(),
      taxId: b.taxId?.trim() || null,
      addressLines: b.addressLines?.trim() || null,
      postalCode: b.postalCode?.trim() || null,
      city: b.city?.trim() || null,
      country: b.country?.trim() || null,
      email: b.email?.trim() || null,
      iban: normalizeIban(b.iban),
      bic: normalizeBic(b.bic),
      fpsProxyType: b.fpsProxyType?.trim() || null,
      fpsProxyId: b.fpsProxyId?.trim() || null,
    })
    .returning();
  return NextResponse.json({ supplier: row }, { status: 201 });
}
