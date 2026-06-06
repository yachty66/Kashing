import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { customers } from "@/lib/db/schema";
import { overdueInvoices } from "@/lib/invoice-server";
import { buildPaymentRequest } from "@/lib/payment-request";
import { money } from "@/lib/money";
import { invoiceQrMediaUrl, type Channel } from "@/lib/agent/channel";

export type DunningResult = {
  sent: number;
  reminders: { invoice: string; customer: string | null; daysOverdue: number }[];
  skipped: { invoice: string; reason: string }[];
};

/** Tone escalates with age — courtesy → firm → final notice. */
function reminderText(number: string, amount: string, daysOverdue: number, dueDate: string | null): string {
  const due = dueDate ? ` (due ${dueDate})` : "";
  if (daysOverdue > 60) return `FINAL NOTICE: invoice ${number} for ${amount}${due} is ${daysOverdue} days overdue. Please settle immediately to avoid your account being placed on hold.`;
  if (daysOverdue > 30) return `Reminder: invoice ${number} for ${amount}${due} is now ${daysOverdue} days overdue. Kindly arrange payment as soon as possible.`;
  return `Friendly reminder: invoice ${number} for ${amount}${due} is ${daysOverdue} day(s) past due. You can pay instantly below.`;
}

/**
 * Run the dunning cadence over every overdue invoice: send the customer a
 * WhatsApp reminder (tone scaled to how overdue it is) with the FPS QR + pay
 * details attached. Customers without a phone on file are reported back so the
 * manager can follow up. Triggered by the agent ("chase overdue"), a dashboard
 * button, or a cron hitting /api/dunning.
 */
export async function runDunning(channel: Channel): Promise<DunningResult> {
  const overdue = await overdueInvoices();
  const reminders: DunningResult["reminders"] = [];
  const skipped: DunningResult["skipped"] = [];

  for (const { inv, outstandingCents, daysOverdue } of overdue) {
    let phone: string | null = null;
    if (inv.customerId) {
      const [c] = await db.select().from(customers).where(eq(customers.id, inv.customerId)).limit(1);
      phone = c?.phone ?? null;
    }
    if (!phone) {
      skipped.push({ invoice: inv.number, reason: "no phone on file" });
      continue;
    }
    const pr = await buildPaymentRequest({ amount: outstandingCents / 100, reference: inv.number });
    const body = `${reminderText(inv.number, money(outstandingCents, inv.currency), daysOverdue, inv.dueDate)}\n${pr.copyText}`;
    await channel.send(phone, body, [invoiceQrMediaUrl(inv.id)]);
    reminders.push({ invoice: inv.number, customer: inv.customerName, daysOverdue });
  }

  return { sent: reminders.length, reminders, skipped };
}
