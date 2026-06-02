import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, analyses } from "@/lib/db/schema";
import { applyOverlay, type SubscriptionLike } from "@/lib/subscription-overlay";

export const runtime = "nodejs";

type AnalysisPayload = {
  subscriptions?: SubscriptionLike[];
  recurring_obligations?: { name: string; monthly_amount_eur: number; type: string }[];
  excluded?: { merchant: string; reason: string }[];
  summary?: {
    monthly_subscription_total_eur: number;
    monthly_obligation_total_eur: number;
    subscription_count: number;
  };
};

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

  const llmPayload = (latestLlm[0]?.payload as AnalysisPayload | undefined) ?? null;
  let analysis: AnalysisPayload | null = null;

  if (llmPayload) {
    const merged = await applyOverlay(llmPayload.subscriptions ?? []);
    const subTotal = merged.reduce((s, x) => s + (x.monthly_amount_eur || 0), 0);
    analysis = {
      ...llmPayload,
      subscriptions: merged,
      summary: {
        monthly_subscription_total_eur: Math.round(subTotal * 100) / 100,
        monthly_obligation_total_eur:
          llmPayload.summary?.monthly_obligation_total_eur ?? 0,
        subscription_count: merged.length,
      },
    };
  } else {
    // No LLM analysis yet, but user might still have manual additions
    const merged = await applyOverlay([]);
    if (merged.length > 0) {
      const subTotal = merged.reduce((s, x) => s + (x.monthly_amount_eur || 0), 0);
      analysis = {
        subscriptions: merged,
        recurring_obligations: [],
        summary: {
          monthly_subscription_total_eur: Math.round(subTotal * 100) / 100,
          monthly_obligation_total_eur: 0,
          subscription_count: merged.length,
        },
      };
    }
  }

  return NextResponse.json({
    accounts: accts.map((a) => ({
      id: a.id,
      iban: a.iban,
      name: a.displayName,
      last_pull_at: a.lastPullAt?.toISOString() ?? null,
    })),
    analysis,
    brief: (latestBrief[0]?.payload as { text?: string } | undefined)?.text ?? null,
    generated_at: latestLlm[0]?.createdAt?.toISOString() ?? null,
  });
}
