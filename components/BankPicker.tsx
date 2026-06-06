"use client";

import { useEffect, useMemo, useState } from "react";

type Institution = {
  id: string;
  name: string;
  bic?: string | null;
  logo?: string | null;
  transaction_total_days?: number | string | null;
};

const COUNTRIES = [
  { code: "DE", name: "Germany" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "CZ", name: "Czech Republic" },
  { code: "DK", name: "Denmark" },
  { code: "ES", name: "Spain" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" },
  { code: "LU", name: "Luxembourg" },
  { code: "NL", name: "Netherlands" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "SE", name: "Sweden" },
];

export function BankPicker({ onClose }: { onClose: () => void }) {
  const [region, setRegion] = useState<"eu" | "hk">("eu");
  const [country, setCountry] = useState("DE");
  const [query, setQuery] = useState("");
  const [institutions, setInstitutions] = useState<Institution[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [fvConnecting, setFvConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (region !== "eu") return;
    let alive = true;
    setLoading(true);
    setError(null);
    setInstitutions(null);
    (async () => {
      const r = await fetch(`/api/institutions?country=${country}`);
      if (!alive) return;
      if (!r.ok) {
        setError(`Couldn't load banks (${r.status}). ${await r.text()}`);
        setLoading(false);
        return;
      }
      const data = await r.json();
      setInstitutions(data.institutions ?? []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [country, region]);

  const filtered = useMemo(() => {
    if (!institutions) return [];
    const q = query.trim().toLowerCase();
    if (!q) return institutions;
    return institutions.filter(
      (i) => i.name.toLowerCase().includes(q) || (i.bic ?? "").toLowerCase().includes(q),
    );
  }, [institutions, query]);

  async function connectFinverse() {
    setFvConnecting(true);
    setError(null);
    try {
      const r = await fetch("/api/connect/finverse", { method: "POST" });
      const text = await r.text();
      if (!r.ok) {
        setError(`Connect failed (${r.status}): ${text}`);
        setFvConnecting(false);
        return;
      }
      const data = JSON.parse(text);
      if (!data.link || !data.state) {
        setError("Server returned no bank link.");
        setFvConnecting(false);
        return;
      }

      // Finverse Link runs in its own page and hands data back via a
      // cross-origin call to our callback, not a navigation. So we open it in
      // a popup, keep this page open, and poll until the connection lands,
      // then refresh into the connected state.
      const popup = window.open(data.link, "finverse_link", "width=460,height=780");
      const started = Date.now();
      const poll = setInterval(async () => {
        if (Date.now() - started > 5 * 60_000) {
          clearInterval(poll);
          setFvConnecting(false);
          setError("Timed out waiting for the bank connection. Please try again.");
          return;
        }
        try {
          const s = await fetch(`/api/connect/finverse/status?state=${data.state}`);
          const { status } = await s.json();
          if (status === "CONNECTED") {
            clearInterval(poll);
            try {
              popup?.close();
            } catch {
              // cross-origin popup; user can close it
            }
            window.location.href = "/subscriptions?connected=1";
          }
        } catch {
          // transient; keep polling
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setFvConnecting(false);
    }
  }

  async function pick(inst: Institution) {
    setConnecting(inst.id);
    setError(null);
    try {
      const r = await fetch("/api/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institution_id: inst.id }),
      });
      const text = await r.text();
      if (!r.ok) {
        setError(`Connect failed (${r.status}): ${text}`);
        return;
      }
      const data = JSON.parse(text);
      if (data.link) window.location.href = data.link;
      else setError("Server returned no bank link.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(null);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card w-full max-w-xl max-h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-lg font-semibold">Connect a bank</h2>
          <button onClick={onClose} className="btn btn-ghost text-sm" aria-label="Close">✕</button>
        </div>

        <div className="px-6 pt-4 flex gap-2">
          <button
            onClick={() => setRegion("eu")}
            className={`px-3 py-1.5 rounded-lg text-sm border ${region === "eu" ? "bg-foreground text-background border-foreground" : "border-line hover:bg-card/60"}`}
          >
            Europe & UK
          </button>
          <button
            onClick={() => setRegion("hk")}
            className={`px-3 py-1.5 rounded-lg text-sm border ${region === "hk" ? "bg-foreground text-background border-foreground" : "border-line hover:bg-card/60"}`}
          >
            Hong Kong & Asia
          </button>
        </div>

        {region === "eu" && (
        <div className="px-6 py-4 flex gap-3 border-b border-line">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="px-3 py-2 rounded-lg border border-line bg-card text-sm"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Search bank or BIC…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-line bg-card text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
          />
        </div>
        )}

        {error && (
          <div className="px-6 py-3 bg-card border-b border-foreground text-foreground text-sm">{error}</div>
        )}

        {region === "eu" && (
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <p className="px-6 py-8 text-muted text-sm">Loading banks…</p>
          ) : !filtered.length ? (
            <p className="px-6 py-8 text-muted text-sm">No banks match.</p>
          ) : (
            <ul className="divide-y divide-line">
              {filtered.map((inst) => (
                <li key={inst.id}>
                  <button
                    onClick={() => pick(inst)}
                    disabled={connecting !== null}
                    className="w-full px-6 py-3 flex items-center gap-3 hover:bg-card/60 disabled:opacity-60 text-left"
                  >
                    {inst.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={inst.logo} alt="" width={28} height={28} className="rounded" />
                    ) : (
                      <div className="w-7 h-7 rounded bg-line" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{inst.name}</div>
                      <div className="text-xs text-muted truncate">
                        {inst.bic && <>{inst.bic} · </>}
                        {inst.transaction_total_days != null && <>up to {inst.transaction_total_days}d of history</>}
                      </div>
                    </div>
                    {connecting === inst.id && <span className="text-xs text-muted">Opening…</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}

        {region === "hk" && (
        <div className="overflow-y-auto flex-1 px-6 py-8 flex flex-col items-center text-center gap-4">
          <p className="text-sm text-muted max-w-sm">
            Connect a Hong Kong or Asian bank (HSBC, DBS, Bank of China, BEA, UOB
            and more) via Finverse. You'll pick your bank and approve read-only
            access on Finverse's secure page.
          </p>
          <button
            onClick={connectFinverse}
            disabled={fvConnecting}
            className="btn btn-primary text-sm disabled:opacity-60"
          >
            {fvConnecting ? "Opening…" : "Connect via Finverse"}
          </button>
        </div>
        )}

        <div className="px-6 py-3 border-t border-line text-xs text-muted">
          {region === "eu" ? (
            <>You'll be redirected to your bank to approve read-only access via GoCardless. We never see your password.</>
          ) : (
            <>You'll be redirected to Finverse to approve read-only access. We never see your password.</>
          )}
        </div>
      </div>
    </div>
  );
}
