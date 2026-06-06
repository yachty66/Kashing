import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, finverseIdentities, requisitions } from "@/lib/db/schema";
import { getAccountDetails, getRequisition } from "@/lib/gocardless";
import { exchangeCode, getLoginIdentity, listAccounts } from "@/lib/finverse";

export const runtime = "nodejs";

function base(): string {
  return (process.env.PUBLIC_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
}

// Finverse Link calls the redirect_uri via a cross-origin fetch (not a plain
// navigation), so the callback must answer CORS preflight and tag its
// responses, or the browser blocks the call and Finverse retries forever.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/**
 * Finishes either as a real browser redirect (top-level navigation, e.g.
 * GoCardless or Finverse's final navigation) or, when the request is a
 * cross-origin fetch from Finverse Link (has an Origin header), as a small
 * CORS-tagged 200 so the fetch resolves and Finverse can move on.
 */
function finish(req: NextRequest, target: string): NextResponse {
  if (req.headers.get("origin")) {
    return NextResponse.json({ ok: true, redirect: target }, { headers: CORS });
  }
  return NextResponse.redirect(target);
}

/**
 * GET callback. Both providers redirect the browser here at the end of the
 * consent flow. Finverse arrives with a `code` + `state` in the query string;
 * GoCardless arrives without either, so we branch on the presence of `code`.
 */
export async function GET(req: NextRequest) {
  const publicBase = base();
  const params = req.nextUrl.searchParams;
  const error = params.get("error");
  if (error) {
    return finish(req, `${publicBase}/subscriptions?error=${encodeURIComponent(error)}`);
  }

  // Finverse path: a code in the query string is its signature.
  const code = params.get("code");
  const state = params.get("state");
  if (code && state) {
    return completeFinverse(req, code, state);
  }

  // GoCardless path (always a real browser navigation).
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

/** POST callback. Fallback for Finverse's form_post response_mode. */
export async function POST(req: NextRequest) {
  const publicBase = base();
  try {
    const form = await req.formData();
    const error = form.get("error")?.toString();
    if (error) {
      return finish(req, `${publicBase}/subscriptions?error=${encodeURIComponent(error)}`);
    }
    const code = form.get("code")?.toString();
    const state = form.get("state")?.toString();
    if (!code || !state) {
      return finish(req, `${publicBase}/subscriptions?error=finverse_missing_code`);
    }
    return completeFinverse(req, code, state);
  } catch (e) {
    return finish(req, `${publicBase}/subscriptions?error=${encodeURIComponent(String(e))}`);
  }
}

/**
 * Shared Finverse completion: reconcile the PENDING identity by `state`,
 * exchange the code for a login identity token, then upsert that identity's
 * accounts tagged provider=finverse. Idempotent on repeated calls (the same
 * code/state can arrive more than once during the Link handshake).
 */
async function completeFinverse(req: NextRequest, code: string, state: string): Promise<NextResponse> {
  const publicBase = base();
  const redirectUrl = `${publicBase}/api/connect/callback`;
  const ok = `${publicBase}/subscriptions?connected=1`;
  try {
    const pending = await db
      .select()
      .from(finverseIdentities)
      .where(eq(finverseIdentities.state, state))
      .limit(1);
    if (pending.length === 0) {
      return finish(req, `${publicBase}/subscriptions?error=finverse_unknown_state`);
    }
    const row = pending[0];

    // If we already completed this identity (Link may call us several times),
    // just acknowledge so the widget can finish.
    if (row.accessToken) return finish(req, ok);

    const { accessToken, expiresAt, loginIdentityId } = await exchangeCode(code, redirectUrl);
    const li = await getLoginIdentity(accessToken);
    const institutionName = li.institution?.institution_name ?? null;
    const institutionId = li.institution?.institution_id ?? null;

    await db
      .update(finverseIdentities)
      .set({
        loginIdentityId: li.login_identity?.login_identity_id ?? loginIdentityId ?? null,
        institutionName,
        accessToken,
        tokenExpiresAt: expiresAt,
        status: "CONNECTED",
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
      const balanceCents = a.balance?.value != null ? Math.round(a.balance.value * 100) : null;
      await db.insert(accounts).values({
        gocardlessId: a.account_id, // provider external account id
        provider: "finverse",
        finverseIdentityId: row.id,
        institutionId,
        displayName: a.account_name ?? institutionName,
        ...(balanceCents != null ? { balanceCents, balanceUpdatedAt: new Date() } : {}),
      });
    }
    return finish(req, ok);
  } catch (e) {
    console.error("finverse callback failed", e);
    return finish(req, `${publicBase}/subscriptions?error=${encodeURIComponent(String(e))}`);
  }
}
