import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { finverseIdentities } from "@/lib/db/schema";
import { generateLinkToken, isConfigured } from "@/lib/finverse";

export const runtime = "nodejs";

/**
 * Start the Finverse connect flow for HK/Asia banks. Mints a Link URL and
 * records a PENDING identity keyed by `state`; the callback reconciles on it.
 * The user picks their actual bank inside Finverse's hosted UI.
 */
export async function POST() {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Finverse not configured. Set FINVERSE_CLIENT_ID and FINVERSE_CLIENT_SECRET." },
      { status: 400 },
    );
  }
  try {
    const state = randomUUID();
    const publicBase = (process.env.PUBLIC_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
    const { linkUrl } = await generateLinkToken({
      userId: "local-user", // single-user local-first app
      redirectUrl: `${publicBase}/api/connect/callback`,
      state,
    });
    await db.insert(finverseIdentities).values({ state, status: "PENDING" });
    return NextResponse.json({ link: linkUrl });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
