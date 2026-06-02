import { db } from "@/lib/db";
import { subscriptionAdditions, subscriptionDismissals } from "@/lib/db/schema";

export type SubscriptionLike = {
  name: string;
  merchant_strings?: string[];
  monthly_amount_eur: number;
  cadence?: string;
  confidence?: "high" | "medium" | "low";
  evidence?: string;
  category?: string;
  domain?: string;
  manual?: boolean;
  manual_id?: number;
};

/**
 * Take the LLM-detected subscriptions and apply the user's manual overrides:
 *  1. Drop anything they've dismissed (matched by name OR shared merchant string)
 *  2. Append any subscriptions they added by hand
 *
 * Returns the merged list. Order: original LLM order minus dismissed,
 * followed by manual additions newest-first.
 */
export async function applyOverlay(llmSubs: SubscriptionLike[]): Promise<SubscriptionLike[]> {
  const [dismissals, additions] = await Promise.all([
    db.select().from(subscriptionDismissals),
    db.select().from(subscriptionAdditions),
  ]);

  const dismissNames = new Set(dismissals.map((d) => d.name.toLowerCase()));
  const dismissMerchants = new Set<string>();
  for (const d of dismissals) {
    for (const m of (d.merchantStrings as string[] | null) ?? []) {
      if (m) dismissMerchants.add(m.toLowerCase());
    }
  }

  const filteredLlm = llmSubs.filter((s) => {
    if (dismissNames.has(s.name.toLowerCase())) return false;
    for (const m of s.merchant_strings ?? []) {
      if (dismissMerchants.has(m.toLowerCase())) return false;
    }
    return true;
  });

  const manual: SubscriptionLike[] = additions
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((a) => ({
      name: a.name,
      monthly_amount_eur: parseFloat(a.monthlyAmountEur),
      cadence: a.cadence,
      category: a.category ?? undefined,
      domain: a.domain ?? undefined,
      evidence: a.evidence ?? "manually added",
      confidence: "high" as const,
      manual: true,
      manual_id: a.id,
    }));

  return [...filteredLlm, ...manual];
}
