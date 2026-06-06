import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { accounts, analyses, finverseIdentities, requisitions, transactions } from "@/lib/db/schema";
import { deleteRequisition } from "@/lib/gocardless";

export const runtime = "nodejs";

/** Wipes every connected bank + transaction + analysis. Local-first nuke. */
export async function POST() {
  const reqs = await db.select().from(requisitions);
  for (const r of reqs) {
    try {
      await deleteRequisition(r.gocardlessId);
    } catch (e) {
      console.warn("could not delete remote requisition", r.gocardlessId, e);
    }
  }
  await db.delete(transactions);
  await db.delete(accounts);
  await db.delete(requisitions);
  await db.delete(finverseIdentities);
  await db.delete(analyses);
  return NextResponse.json({ ok: true });
}
