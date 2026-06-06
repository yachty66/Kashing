import { NextResponse } from "next/server";
import { forecastCashflow } from "@/lib/cashflow";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await forecastCashflow());
}
