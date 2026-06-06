import { NextRequest, NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db.select().from(customers).orderBy(asc(customers.name));
  return NextResponse.json({ customers: rows });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    email?: string;
    addressLines?: string;
    brNumber?: string;
    phone?: string;
    defaultCurrency?: string;
  } | null;
  if (!body?.name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const [row] = await db
    .insert(customers)
    .values({
      name: body.name.trim(),
      email: body.email?.trim() || null,
      addressLines: body.addressLines?.trim() || null,
      brNumber: body.brNumber?.trim() || null,
      phone: body.phone?.trim() || null,
      defaultCurrency: body.defaultCurrency?.trim() || "HKD",
    })
    .returning();
  return NextResponse.json({ customer: row }, { status: 201 });
}
