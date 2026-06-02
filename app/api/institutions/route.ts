import { NextRequest, NextResponse } from "next/server";
import { listInstitutions } from "@/lib/gocardless";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const country = req.nextUrl.searchParams.get("country") ?? "DE";
  try {
    const raw = await listInstitutions(country);
    return NextResponse.json({
      country: country.toUpperCase(),
      institutions: raw.map((i) => ({
        id: i.id,
        name: i.name,
        bic: i.bic ?? null,
        logo: i.logo ?? null,
        transaction_total_days: i.transaction_total_days ?? null,
        countries: i.countries ?? [],
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
