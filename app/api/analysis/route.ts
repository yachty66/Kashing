import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, analyses } from "@/lib/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const accts = await db.select().from(accounts);

  const latestLlm = await db
    .select()
    .from(analyses)
    .where(eq(analyses.kind, "llm"))
    .orderBy(desc(analyses.createdAt))
    .limit(1);
  const latestBrief = await db
    .select()
    .from(analyses)
    .where(eq(analyses.kind, "brief"))
    .orderBy(desc(analyses.createdAt))
    .limit(1);

  return NextResponse.json({
    accounts: accts.map((a) => ({
      id: a.id,
      iban: a.iban,
      name: a.displayName,
      last_pull_at: a.lastPullAt?.toISOString() ?? null,
    })),
    analysis: latestLlm[0]?.payload ?? null,
    brief: (latestBrief[0]?.payload as { text?: string } | undefined)?.text ?? null,
    generated_at: latestLlm[0]?.createdAt?.toISOString() ?? null,
  });
}
