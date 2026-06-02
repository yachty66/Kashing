import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, requisitions } from "@/lib/db/schema";
import { getAccountDetails, getRequisition } from "@/lib/gocardless";

export const runtime = "nodejs";

/**
 * GoCardless redirects the browser back here after the user finishes the
 * bank consent. We look up the latest requisition, verify it's now linked,
 * upsert the account rows we got, then bounce the user to /subscriptions.
 */
export async function GET(req: NextRequest) {
  const publicBase = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const error = req.nextUrl.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(`${publicBase}/subscriptions?error=${encodeURIComponent(error)}`);
  }
  try {
    const latest = await db.select().from(requisitions).orderBy(desc(requisitions.createdAt)).limit(1);
    if (latest.length === 0) {
      return NextResponse.redirect(`${publicBase}/subscriptions?error=no_requisition`);
    }
    const req0 = latest[0];
    const remote = await getRequisition(req0.gocardlessId);
    await db
      .update(requisitions)
      .set({ status: remote.status })
      .where(eq(requisitions.id, req0.id));

    if (remote.status !== "LN") {
      return NextResponse.redirect(`${publicBase}/subscriptions?error=not_linked`);
    }

    for (const aid of remote.accounts) {
      const exists = await db.select().from(accounts).where(eq(accounts.gocardlessId, aid)).limit(1);
      if (exists.length > 0) continue;
      let iban: string | null = null;
      let displayName: string | null = null;
      try {
        const details = await getAccountDetails(aid);
        iban = details.account?.iban ?? null;
        displayName = details.account?.name ?? details.account?.ownerName ?? null;
      } catch {
        // Spaces / sub-accounts sometimes 4xx on /details; we still keep the row.
      }
      await db.insert(accounts).values({
        gocardlessId: aid,
        institutionId: req0.institutionId,
        iban,
        displayName,
      });
    }
    return NextResponse.redirect(`${publicBase}/subscriptions?connected=1`);
  } catch (e) {
    return NextResponse.redirect(`${publicBase}/subscriptions?error=${encodeURIComponent(String(e))}`);
  }
}
