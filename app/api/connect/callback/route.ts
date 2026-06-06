import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, finverseIdentities, requisitions } from "@/lib/db/schema";
import { getAccountDetails, getRequisition } from "@/lib/gocardless";
import { exchangeCode, getLoginIdentity, listAccounts } from "@/lib/finverse";

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

/**
 * Finverse Link redirects here with response_mode=form_post, so the code and
 * state arrive as a POST form body (not query params like GoCardless). We
 * reconcile the PENDING identity by `state`, exchange the code for a login
 * identity token, then upsert that identity's accounts tagged provider=finverse.
 */
export async function POST(req: NextRequest) {
  const publicBase = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const redirectUrl = `${publicBase}/api/connect/callback`;
  try {
    const form = await req.formData();
    const code = form.get("code")?.toString();
    const state = form.get("state")?.toString();
    const error = form.get("error")?.toString();
    if (error) {
      return NextResponse.redirect(`${publicBase}/subscriptions?error=${encodeURIComponent(error)}`);
    }
    if (!code || !state) {
      return NextResponse.redirect(`${publicBase}/subscriptions?error=finverse_missing_code`);
    }

    const pending = await db
      .select()
      .from(finverseIdentities)
      .where(eq(finverseIdentities.state, state))
      .limit(1);
    if (pending.length === 0) {
      return NextResponse.redirect(`${publicBase}/subscriptions?error=finverse_unknown_state`);
    }
    const row = pending[0];

    const { accessToken, expiresAt } = await exchangeCode(code, redirectUrl);
    const li = await getLoginIdentity(accessToken);

    await db
      .update(finverseIdentities)
      .set({
        loginIdentityId: li.login_identity_id,
        institutionName: li.institution?.institution_name ?? null,
        accessToken,
        tokenExpiresAt: expiresAt,
        status: li.status ?? "CONNECTED",
      })
      .where(eq(finverseIdentities.id, row.id));

    const fvAccounts = await listAccounts(accessToken);
    for (const a of fvAccounts) {
      const exists = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.gocardlessId, a.account_id))
        .limit(1);
      if (exists.length > 0) continue;
      const balanceCents =
        a.balance?.amount != null ? Math.round(a.balance.amount * 100) : null;
      await db.insert(accounts).values({
        gocardlessId: a.account_id, // provider external account id
        provider: "finverse",
        finverseIdentityId: row.id,
        institutionId: li.institution?.institution_id ?? null,
        displayName: a.account_name ?? a.institution_name ?? li.institution?.institution_name ?? null,
        ...(balanceCents != null ? { balanceCents, balanceUpdatedAt: new Date() } : {}),
      });
    }
    return NextResponse.redirect(`${publicBase}/subscriptions?connected=1`);
  } catch (e) {
    return NextResponse.redirect(`${publicBase}/subscriptions?error=${encodeURIComponent(String(e))}`);
  }
}
