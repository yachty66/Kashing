import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { businessProfile } from "@/lib/db/schema";
import { getOrCreateBusinessProfile } from "@/lib/invoice-server";

export const runtime = "nodejs";

export async function GET() {
  const profile = await getOrCreateBusinessProfile();
  return NextResponse.json({ profile });
}

const EDITABLE = [
  "name",
  "brNumber",
  "addressLines",
  "email",
  "phone",
  "paymentInstructions",
  "defaultCurrency",
  "invoicePrefix",
  "footerNote",
] as const;

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const profile = await getOrCreateBusinessProfile();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of EDITABLE) {
    if (key in body) {
      const v = body[key];
      patch[key] = typeof v === "string" ? v.trim() || (key === "name" ? "My Business" : null) : v;
    }
  }
  // Currency / prefix should never be blanked.
  if (patch.defaultCurrency === null) delete patch.defaultCurrency;
  if (patch.invoicePrefix === null) delete patch.invoicePrefix;

  const [row] = await db
    .update(businessProfile)
    .set(patch)
    .where(eq(businessProfile.id, profile.id))
    .returning();
  return NextResponse.json({ profile: row });
}
