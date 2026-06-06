import { NextResponse } from "next/server";
import { runDunning } from "@/lib/dunning";
import { twilioChannel } from "@/lib/twilio";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Run the dunning cadence over all overdue invoices. For a "Send reminders"
 * button or a cron job. */
export async function POST() {
  try {
    const result = await runDunning(twilioChannel());
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
