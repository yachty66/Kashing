/**
 * Thin async client for the Finverse Data API (Hong Kong / Asia banks).
 * Mirrors lib/gocardless.ts: one process-level customer token cached in
 * memory, refreshed on demand.
 *
 * Key difference from GoCardless: Finverse uses a hosted Link UI. The user
 * picks their bank (HSBC, DBS, Bank of China, BEA, UOB, ...) inside Finverse,
 * so there is no list-institutions step. We just mint a Link URL and redirect.
 *
 * Flow:
 *   1. customerAccessToken()      POST /auth/customer/token   (client creds)
 *   2. generateLinkToken()        POST /link/token            -> link_url
 *   3. user links at link_url, Finverse POSTs code+state back to redirect_uri
 *   4. exchangeCode()             POST /auth/token            -> login identity token
 *   5. getLoginIdentity()/listAccounts()/listTransactions()   with that token
 *
 * Base URL defaults to production; override with FINVERSE_BASE_URL for sandbox.
 * Endpoint paths follow the documented Finverse Data API. Verify against your
 * Finverse dashboard once credentials exist (we can't test without them).
 */

const BASE = (process.env.FINVERSE_BASE_URL ?? "https://api.prod.finverse.net").replace(/\/$/, "");

let customerToken: { value?: string; exp?: number } = {};
let inFlight: Promise<string> | null = null;

function creds(): { id: string; secret: string } {
  const id = process.env.FINVERSE_CLIENT_ID;
  const secret = process.env.FINVERSE_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("Finverse not configured: set FINVERSE_CLIENT_ID and FINVERSE_CLIENT_SECRET");
  }
  return { id, secret };
}

export function isConfigured(): boolean {
  return Boolean(process.env.FINVERSE_CLIENT_ID && process.env.FINVERSE_CLIENT_SECRET);
}

async function newCustomerToken(): Promise<string> {
  const { id, secret } = creds();
  const r = await fetch(`${BASE}/auth/customer/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: "client_credentials" }),
  });
  if (!r.ok) throw new Error(`Finverse customer token failed: ${r.status} ${await r.text()}`);
  const d = (await r.json()) as { access_token: string; expires_in?: number };
  customerToken.value = d.access_token;
  customerToken.exp = Date.now() / 1000 + (d.expires_in ?? 3600);
  return d.access_token;
}

async function customerAccessToken(): Promise<string> {
  const now = Date.now() / 1000;
  if (customerToken.value && (customerToken.exp ?? 0) > now + 60) return customerToken.value;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      return await newCustomerToken();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

// ---------- Connect (Link) flow ----------

/**
 * Mint a Finverse Link URL. We redirect the browser here; the user selects
 * their bank and authenticates inside Finverse's hosted UI. On completion
 * Finverse POSTs `code` + `state` back to `redirectUrl` (response_mode=form_post).
 */
export async function generateLinkToken(params: {
  userId: string;
  redirectUrl: string;
  state: string;
}): Promise<{ linkUrl: string }> {
  const token = await customerAccessToken();
  const { id } = creds();
  const r = await fetch(`${BASE}/link/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: id,
      user_id: params.userId,
      redirect_uri: params.redirectUrl,
      state: params.state,
      response_type: "code",
      response_mode: "form_post",
      grant_type: "client_credentials",
      // Bias the hosted picker toward Hong Kong banks. Drop/extend to widen.
      countries: ["HK"],
    }),
  });
  if (!r.ok) throw new Error(`Finverse link token failed: ${r.status} ${await r.text()}`);
  const d = (await r.json()) as { link_url: string };
  return { linkUrl: d.link_url };
}

/** Exchange the authorization code from the callback for a login-identity token. */
export async function exchangeCode(
  code: string,
  redirectUrl: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const { id, secret } = creds();
  const r = await fetch(`${BASE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUrl,
    }),
  });
  if (!r.ok) throw new Error(`Finverse token exchange failed: ${r.status} ${await r.text()}`);
  const d = (await r.json()) as { access_token: string; expires_in?: number };
  return {
    accessToken: d.access_token,
    expiresAt: new Date(Date.now() + (d.expires_in ?? 3600) * 1000),
  };
}

// ---------- Data (uses the login-identity access token) ----------

async function liCall<T>(path: string, accessToken: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`Finverse ${path} failed: ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

export type FinverseLoginIdentity = {
  login_identity_id: string;
  status?: string;
  institution?: { institution_id?: string; institution_name?: string };
};

export async function getLoginIdentity(accessToken: string): Promise<FinverseLoginIdentity> {
  return liCall<FinverseLoginIdentity>("/login_identity", accessToken);
}

export type FinverseAccount = {
  account_id: string;
  account_name?: string;
  account_number?: { number?: string; masked?: string };
  currency?: string;
  balance?: { amount?: number; currency?: string };
  institution_name?: string;
};

export async function listAccounts(accessToken: string): Promise<FinverseAccount[]> {
  const r = await liCall<{ accounts: FinverseAccount[] }>("/accounts", accessToken);
  return r.accounts ?? [];
}

export type FinverseTransaction = {
  transaction_id?: string;
  account_id?: string;
  posted_date?: string; // YYYY-MM-DD
  transaction_date?: string;
  amount?: number; // positive magnitude; sign comes from `type`
  currency?: string;
  description?: string;
  type?: string; // 'CREDIT' | 'DEBIT'
  merchant_name?: string;
};

/**
 * Transactions for the whole login identity (all of its accounts), paged.
 * Finverse caps page size; we page until exhausted or `max` is reached.
 */
export async function listTransactions(
  accessToken: string,
  max = 2000,
): Promise<FinverseTransaction[]> {
  const out: FinverseTransaction[] = [];
  const limit = 500;
  let offset = 0;
  while (out.length < max) {
    const r = await liCall<{ transactions: FinverseTransaction[] }>(
      `/transactions?offset=${offset}&limit=${limit}`,
      accessToken,
    );
    const batch = r.transactions ?? [];
    out.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return out;
}

/**
 * Normalize a Finverse transaction into the integer-cents, signed convention
 * used by our `transactions` table (negative = money out, matching GoCardless).
 */
export function normalizeAmountCents(tx: FinverseTransaction): number {
  const magnitude = Math.round((tx.amount ?? 0) * 100);
  const isDebit = (tx.type ?? "").toUpperCase() === "DEBIT";
  return isDebit ? -Math.abs(magnitude) : Math.abs(magnitude);
}
