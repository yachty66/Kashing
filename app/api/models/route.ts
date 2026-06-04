import { NextResponse } from "next/server";
import { STATIC_TOP_MODELS, type ModelOption } from "@/lib/models";

export const runtime = "nodejs";

/**
 * Returns the top-weekly list of OpenRouter models — the same source that
 * powers https://openrouter.ai/models with "Most Popular" selected. The
 * upstream endpoint (`/api/frontend/models/find?order=top-weekly`) is
 * undocumented, so this route caches and falls back to STATIC_TOP_MODELS
 * if anything goes wrong.
 */

type Cache = { ts: number; data: ModelOption[] };
let cache: Cache | null = null;
const TTL_MS = 60 * 60 * 1000; // 1h

type FrontendModel = {
  slug?: string;
  short_name?: string;
  name?: string;
  hidden?: boolean;
  output_modalities?: string[];
};

async function fetchTopWeekly(): Promise<ModelOption[]> {
  const r = await fetch("https://openrouter.ai/api/frontend/models/find?order=top-weekly", {
    headers: { Accept: "application/json" },
    // Don't let Next cache this — we manage cache ourselves with TTL.
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  const json = (await r.json()) as { data?: { models?: FrontendModel[] } };
  const models = json.data?.models ?? [];
  const out: ModelOption[] = [];
  for (const m of models) {
    if (m.hidden) continue;
    if (!m.output_modalities?.includes("text")) continue;
    const slug = m.slug;
    const label = m.short_name ?? m.name;
    if (!slug || !label) continue;
    out.push({ slug, label });
    if (out.length === 20) break;
  }
  if (out.length === 0) throw new Error("no models in response");
  return out;
}

export async function GET() {
  const now = Date.now();
  if (cache && now - cache.ts < TTL_MS) {
    return NextResponse.json({ source: "cache", models: cache.data });
  }
  try {
    const fresh = await fetchTopWeekly();
    cache = { ts: now, data: fresh };
    return NextResponse.json({ source: "live", models: fresh });
  } catch (err) {
    // Either return the previous cached value even if stale, or the static
    // baked-in list — whichever is fresher.
    if (cache) {
      return NextResponse.json({ source: "stale-cache", models: cache.data, error: String(err) });
    }
    return NextResponse.json({ source: "static-fallback", models: STATIC_TOP_MODELS, error: String(err) });
  }
}
