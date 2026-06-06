import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { qrIssuances } from "@/lib/db/schema";
import { qrPng } from "@/lib/fps-qr";

export const runtime = "nodejs";

/** Serve the FPS QR PNG for an issuance so Twilio can attach it as media. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const issuanceId = Number(id);
  if (!Number.isFinite(issuanceId)) return new Response("Bad id", { status: 400 });

  const rows = await db.select().from(qrIssuances).where(eq(qrIssuances.id, issuanceId)).limit(1);
  const issuance = rows[0];
  if (!issuance) return new Response("Not found", { status: 404 });

  const png = await qrPng(issuance.payload);
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, immutable" },
  });
}
