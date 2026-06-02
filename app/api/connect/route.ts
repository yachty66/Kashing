import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requisitions } from "@/lib/db/schema";
import { createRequisition, findInstitution } from "@/lib/gocardless";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { institution_id } = (await req.json()) as { institution_id?: string };
  if (!institution_id) {
    return NextResponse.json({ error: "institution_id required" }, { status: 400 });
  }
  try {
    const inst = await findInstitution(institution_id);
    const reference = `local-${Date.now()}`;
    const publicBase = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
    const req = await createRequisition({
      institutionId: institution_id,
      redirectUrl: `${publicBase}/api/connect/callback`,
      reference,
    });
    await db.insert(requisitions).values({
      gocardlessId: req.id,
      institutionId: institution_id,
      reference,
      status: req.status ?? "CR",
      link: req.link,
    });
    return NextResponse.json({ link: req.link, institution: inst.name });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
