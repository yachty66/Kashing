/**
 * Thin async client for GoCardless Bank Account Data API.
 * Mirrors the Python client in mysubs/backend/app/gocardless.py — one process-
 * level access token cached in memory, refreshed on demand.
 */

const BASE = "https://bankaccountdata.gocardless.com/api/v2";

type TokenState = {
  access?: string;
  accessExp?: number;
  refresh?: string;
  refreshExp?: number;
};
const state: TokenState = {};
let inFlight: Promise<string> | null = null;

async function newToken(): Promise<string> {
  const r = await fetch(`${BASE}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret_id: process.env.GOCARDLESS_SECRET_ID,
      secret_key: process.env.GOCARDLESS_SECRET_KEY,
    }),
  });
  if (!r.ok) throw new Error(`GoCardless token failed: ${r.status} ${await r.text()}`);
  const d = (await r.json()) as {
    access: string;
    access_expires: number;
    refresh: string;
    refresh_expires: number;
  };
  const now = Date.now() / 1000;
  state.access = d.access;
  state.accessExp = now + d.access_expires;
  state.refresh = d.refresh;
  state.refreshExp = now + d.refresh_expires;
  return d.access;
}

async function refreshToken(): Promise<string | null> {
  if (!state.refresh) return null;
  const r = await fetch(`${BASE}/token/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: state.refresh }),
  });
  if (!r.ok) return null;
  const d = (await r.json()) as { access: string; access_expires: number };
  state.access = d.access;
  state.accessExp = Date.now() / 1000 + d.access_expires;
  return d.access;
}

async function accessToken(): Promise<string> {
  const now = Date.now() / 1000;
  if (state.access && (state.accessExp ?? 0) > now + 60) return state.access;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      if (state.refresh && (state.refreshExp ?? 0) > now + 60) {
        const t = await refreshToken();
        if (t) return t;
      }
      return await newToken();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers as Record<string, string>),
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!r.ok) throw new Error(`GoCardless ${path} failed: ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

// ---------- Public API ----------

export type Institution = {
  id: string;
  name: string;
  bic?: string;
  logo?: string;
  transaction_total_days?: string | number;
  countries?: string[];
};

export async function listInstitutions(country: string): Promise<Institution[]> {
  return call<Institution[]>(`/institutions/?country=${encodeURIComponent(country.toLowerCase())}`);
}

export async function findInstitution(id: string): Promise<Institution> {
  return call<Institution>(`/institutions/${id}/`);
}

export type Requisition = {
  id: string;
  status: string;
  link: string;
  accounts: string[];
};

export async function createRequisition(params: {
  institutionId: string;
  redirectUrl: string;
  reference: string;
}): Promise<Requisition> {
  return call<Requisition>("/requisitions/", {
    method: "POST",
    body: JSON.stringify({
      redirect: params.redirectUrl,
      institution_id: params.institutionId,
      reference: params.reference,
      user_language: "EN",
    }),
  });
}

export async function getRequisition(id: string): Promise<Requisition> {
  return call<Requisition>(`/requisitions/${id}/`);
}

export async function getAccountDetails(accountId: string): Promise<{ account?: { iban?: string; name?: string; ownerName?: string } }> {
  return call(`/accounts/${accountId}/details/`);
}

export type GoCardlessBalance = {
  balanceAmount: { amount: string; currency: string };
  balanceType?: string; // 'closingBooked' | 'interimAvailable' | 'expected' | …
  referenceDate?: string;
};

/**
 * Current balances for an account. GoCardless returns several balance types;
 * we prefer the "available"/"closingBooked" view and fall back to whatever
 * the bank gives. Returns the chosen balance in integer cents, or null if the
 * account exposes none. NOTE: this endpoint is rate-limited hard by GoCardless
 * (a handful of calls per account per day) — call it sparingly and cache.
 */
export async function getAccountBalance(
  accountId: string,
): Promise<{ cents: number; currency: string; type?: string; date?: string } | null> {
  const r = await call<{ balances: GoCardlessBalance[] }>(`/accounts/${accountId}/balances/`);
  const balances = r.balances ?? [];
  if (balances.length === 0) return null;
  const pref = ["interimAvailable", "closingBooked", "expected", "interimBooked", "openingBooked"];
  const chosen =
    pref.map((t) => balances.find((b) => b.balanceType === t)).find(Boolean) ?? balances[0];
  if (!chosen) return null;
  const cents = Math.round(parseFloat(chosen.balanceAmount.amount) * 100);
  return {
    cents,
    currency: chosen.balanceAmount.currency,
    type: chosen.balanceType,
    date: chosen.referenceDate,
  };
}

export type GoCardlessTransaction = {
  transactionId?: string;
  internalTransactionId?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount?: { amount: string; currency: string };
  creditorName?: string;
  debtorName?: string;
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
};

export async function listTransactions(accountId: string): Promise<{ booked: GoCardlessTransaction[]; pending: GoCardlessTransaction[] }> {
  const r = await call<{ transactions: { booked: GoCardlessTransaction[]; pending: GoCardlessTransaction[] } }>(
    `/accounts/${accountId}/transactions/`,
  );
  return { booked: r.transactions.booked ?? [], pending: r.transactions.pending ?? [] };
}

export async function deleteRequisition(id: string): Promise<void> {
  const token = await accessToken();
  await fetch(`${BASE}/requisitions/${id}/`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}
