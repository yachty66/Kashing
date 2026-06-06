import { and, desc, eq, gte, ilike, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { bills, customers, expenses, invoices, qrIssuances, suppliers, users } from "@/lib/db/schema";
import { buildFpsPayload } from "@/lib/fps-qr";
import { findEmployeeByName, getManager, type Role, type User } from "@/lib/users";
import { money } from "@/lib/money";
import { buildPaymentRequest } from "@/lib/payment-request";
import { paymentRail } from "@/lib/payment-rail";
import { arAging, createSimpleInvoice, overdueInvoices } from "@/lib/invoice-server";
import { invoiceQrMediaUrl, qrMediaUrl, type Channel } from "@/lib/agent/channel";

function monthStartDate(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
}

/** Sum of an employee's approved/reimbursed expenses this calendar month. */
async function employeeSpentThisMonthCents(userId: number): Promise<number> {
  const rows = await db
    .select({ amountCents: expenses.amountCents })
    .from(expenses)
    .where(
      and(
        eq(expenses.submittedBy, userId),
        inArray(expenses.status, ["approved", "reimbursed"]),
        gte(expenses.createdAt, monthStartDate()),
      ),
    );
  return rows.reduce((s, r) => s + (r.amountCents ?? 0), 0);
}

export type ToolContext = { user: User; channel: Channel };

type OpenAiTool = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

type Tool = {
  schema: OpenAiTool;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;
};

function periodStart(period?: string): Date | null {
  const now = new Date();
  if (period === "this_week") {
    const d = new Date(now);
    d.setDate(now.getDate() - 7);
    return d;
  }
  if (period === "this_month") return new Date(now.getFullYear(), now.getMonth(), 1);
  return null; // 'all'
}

// --- Manager tools ----------------------------------------------------------

const listExpenses: Tool = {
  schema: {
    type: "function",
    function: {
      name: "list_expenses",
      description: "List submitted expenses across the team. Use to answer questions about spending and to find expense IDs to approve.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["pending", "approved", "rejected", "all"], description: "Filter by status (default all)." },
          employee: { type: "string", description: "Optional employee name fragment to filter by." },
        },
      },
    },
  },
  async run(args) {
    const status = (args.status as string) ?? "all";
    const rows = await db
      .select({
        id: expenses.id,
        amountCents: expenses.amountCents,
        currency: expenses.currency,
        merchant: expenses.merchant,
        date: expenses.expenseDate,
        status: expenses.status,
        employee: users.name,
      })
      .from(expenses)
      .leftJoin(users, eq(expenses.submittedBy, users.id))
      .orderBy(desc(expenses.createdAt))
      .limit(50);

    let filtered = rows;
    if (status !== "all") filtered = filtered.filter((r) => r.status === status);
    if (typeof args.employee === "string" && args.employee.trim()) {
      const q = args.employee.toLowerCase();
      filtered = filtered.filter((r) => (r.employee ?? "").toLowerCase().includes(q));
    }
    if (filtered.length === 0) return "No matching expenses.";
    return JSON.stringify(
      filtered.map((r) => ({
        id: r.id,
        employee: r.employee,
        amount: money(r.amountCents, r.currency),
        merchant: r.merchant,
        date: r.date,
        status: r.status,
      })),
    );
  },
};

const expenseSummary: Tool = {
  schema: {
    type: "function",
    function: {
      name: "expense_summary",
      description: "Totals of team spending grouped by employee and status over a period.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["this_week", "this_month", "all"], description: "Time window (default this_month)." },
        },
      },
    },
  },
  async run(args) {
    const start = periodStart((args.period as string) ?? "this_month");
    const base = db
      .select({
        amountCents: expenses.amountCents,
        currency: expenses.currency,
        status: expenses.status,
        employee: users.name,
      })
      .from(expenses)
      .leftJoin(users, eq(expenses.submittedBy, users.id));
    const rows = start ? await base.where(gte(expenses.createdAt, start)) : await base;

    // Sum per currency — never add EUR and HKD into one figure.
    const approved: Record<string, number> = {};
    const pending: Record<string, number> = {};
    const byEmployee: Record<string, Record<string, number>> = {};
    const add = (acc: Record<string, number>, cur: string, cents: number) => {
      acc[cur] = (acc[cur] ?? 0) + cents;
    };
    for (const r of rows) {
      const cur = (r.currency ?? "HKD").toUpperCase();
      const cents = r.amountCents ?? 0;
      if (r.status === "approved") add(approved, cur, cents);
      if (r.status === "pending") add(pending, cur, cents);
      if (r.status !== "rejected") {
        const e = r.employee ?? "?";
        byEmployee[e] = byEmployee[e] ?? {};
        add(byEmployee[e], cur, cents);
      }
    }
    const fmt = (m: Record<string, number>) =>
      Object.fromEntries(Object.entries(m).map(([cur, v]) => [cur, money(v, cur)]));
    return JSON.stringify({
      period: (args.period as string) ?? "this_month",
      approved_total: fmt(approved),
      pending_total: fmt(pending),
      by_employee: Object.fromEntries(Object.entries(byEmployee).map(([k, v]) => [k, fmt(v)])),
    });
  },
};

/**
 * Resolve which expense a manager means. If they gave an ID, use it. If not,
 * fall back to the single pending expense when unambiguous; otherwise return a
 * message listing the candidates so the model can ask.
 */
async function resolveExpenseId(args: Record<string, unknown>): Promise<{ id: number } | { ask: string }> {
  const explicit = Number(args.expense_id);
  if (Number.isFinite(explicit)) return { id: explicit };
  const pending = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.status, "pending"))
    .orderBy(desc(expenses.createdAt));
  if (pending.length === 0) return { ask: "There are no pending expenses." };
  if (pending.length === 1) return { id: pending[0].id };
  return { ask: `There are ${pending.length} pending expenses (${pending.map((p) => `#${p.id}`).join(", ")}). Which one?` };
}

async function decideExpense(args: Record<string, unknown>, ctx: ToolContext, status: "approved" | "rejected") {
  const resolved = await resolveExpenseId(args);
  if ("ask" in resolved) return resolved.ask;
  const id = resolved.id;
  const rows = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
  const exp = rows[0];
  if (!exp) return `No expense #${id}.`;
  await db.update(expenses).set({ status, approvedBy: ctx.user.id }).where(eq(expenses.id, id));

  const sub = await db.select().from(users).where(eq(users.id, exp.submittedBy)).limit(1);
  if (sub[0]) {
    const verb = status === "approved" ? "approved ✅" : "rejected ❌";
    await ctx.channel.send(sub[0].phone, `Your expense #${id} (${money(exp.amountCents, exp.currency)} at ${exp.merchant ?? "?"}) was ${verb} by ${ctx.user.name}.`);
  }
  return `Expense #${id} marked ${status}.`;
}

const approveExpense: Tool = {
  schema: {
    type: "function",
    function: {
      name: "approve_expense",
      description: "Approve a pending expense. Pass expense_id, or omit it to approve the only pending expense when there is exactly one. Notifies the employee.",
      parameters: { type: "object", properties: { expense_id: { type: "number", description: "Optional; omit to target the single pending expense." } } },
    },
  },
  run: (args, ctx) => decideExpense(args, ctx, "approved"),
};

const rejectExpense: Tool = {
  schema: {
    type: "function",
    function: {
      name: "reject_expense",
      description: "Reject a pending expense. Pass expense_id, or omit it to reject the only pending expense when there is exactly one. Notifies the employee.",
      parameters: { type: "object", properties: { expense_id: { type: "number", description: "Optional; omit to target the single pending expense." } } },
    },
  },
  run: (args, ctx) => decideExpense(args, ctx, "rejected"),
};

const issueQr: Tool = {
  schema: {
    type: "function",
    function: {
      name: "issue_qr",
      description: "Issue an FPS payment QR code to an employee so they can pay on the company's behalf. The QR is sent to the employee on WhatsApp.",
      parameters: {
        type: "object",
        properties: {
          employee: { type: "string", description: "Employee name (fragment is fine)." },
          amount: { type: "number", description: "Amount in HKD." },
          purpose: { type: "string", description: "What the payment is for." },
        },
        required: ["employee", "amount"],
      },
    },
  },
  async run(args, ctx) {
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) return "Need a positive amount in HKD.";
    const emp = await findEmployeeByName(String(args.employee ?? ""));
    if (!emp) return `No employee matching "${args.employee}".`;
    const purpose = typeof args.purpose === "string" ? args.purpose : undefined;

    const payload = buildFpsPayload({ amount, reference: purpose ?? "Expense" });
    const inserted = await db
      .insert(qrIssuances)
      .values({
        issuedBy: ctx.user.id,
        employeeId: emp.id,
        amountCents: Math.round(amount * 100),
        currency: "HKD",
        purpose: purpose ?? null,
        payload,
        status: "issued",
      })
      .returning({ id: qrIssuances.id });
    const id = inserted[0].id;

    await ctx.channel.send(
      emp.phone,
      `${ctx.user.name} issued you an FPS QR for HK$${amount.toFixed(2)}${purpose ? ` (${purpose})` : ""}. Scan to pay, then send the receipt photo back here.`,
      [qrMediaUrl(id)],
    );
    return `Issued QR #${id} for HK$${amount.toFixed(2)} to ${emp.name} and sent it to them.`;
  },
};

const editExpense: Tool = {
  schema: {
    type: "function",
    function: {
      name: "edit_expense",
      description: "Correct a submitted expense's amount, merchant, or date — e.g. when the receipt was misread or the total is wrong. Provide only the fields to change.",
      parameters: {
        type: "object",
        properties: {
          expense_id: { type: "number", description: "Optional; omit to target the single pending expense." },
          amount: { type: "number", description: "Corrected amount in HKD." },
          merchant: { type: "string", description: "Corrected merchant name." },
          date: { type: "string", description: "Corrected date as YYYY-MM-DD." },
        },
      },
    },
  },
  async run(args) {
    const resolved = await resolveExpenseId(args);
    if ("ask" in resolved) return resolved.ask;
    const id = resolved.id;
    const rows = await db.select().from(expenses).where(eq(expenses.id, id)).limit(1);
    if (!rows[0]) return `No expense #${id}.`;

    const set: Partial<typeof expenses.$inferInsert> = {};
    if (args.amount != null && Number.isFinite(Number(args.amount))) set.amountCents = Math.round(Number(args.amount) * 100);
    if (typeof args.merchant === "string" && args.merchant.trim()) set.merchant = args.merchant.trim();
    if (typeof args.date === "string" && args.date.trim()) set.expenseDate = args.date.trim();
    if (Object.keys(set).length === 0) return "Nothing to change — specify an amount, merchant, or date.";

    await db.update(expenses).set(set).where(eq(expenses.id, id));
    const updated = (await db.select().from(expenses).where(eq(expenses.id, id)).limit(1))[0];
    return `Updated expense #${id}: ${money(updated.amountCents, updated.currency)} at ${updated.merchant ?? "?"}${updated.expenseDate ? ` on ${updated.expenseDate}` : ""} (${updated.status}).`;
  },
};

// --- Manager tools: invoicing / receivables ---------------------------------

const createInvoice: Tool = {
  schema: {
    type: "function",
    function: {
      name: "create_invoice",
      description: "Create a B2B invoice for a customer and get back an FPS payment QR to forward to them. The customer pays by scanning, tapping the PayMe link, or FPS transfer; it auto-reconciles when the money lands.",
      parameters: {
        type: "object",
        properties: {
          customer: { type: "string", description: "Customer name." },
          amount: { type: "number", description: "Amount in HKD." },
          description: { type: "string", description: "What the invoice is for." },
          terms_days: { type: "number", description: "Credit terms in days (default: the customer's terms or 30)." },
        },
        required: ["customer", "amount"],
      },
    },
  },
  async run(args, ctx) {
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) return "Need a positive amount in HKD.";
    const name = String(args.customer ?? "").trim();
    if (!name) return "Need a customer name.";
    const [existing] = await db.select().from(customers).where(ilike(customers.name, `%${name}%`)).limit(1);

    const inv = await createSimpleInvoice({
      customerName: existing?.name ?? name,
      customerId: existing?.id ?? null,
      amountCents: Math.round(amount * 100),
      description: typeof args.description === "string" ? args.description : "Services",
      termsDays: typeof args.terms_days === "number" ? args.terms_days : undefined,
    });

    const pr = await buildPaymentRequest({ amount, reference: inv.number });
    await ctx.channel.send(
      ctx.user.phone,
      `Invoice ${inv.number} — HK$${amount.toFixed(2)} to ${inv.customerName}, due ${inv.dueDate}.\nForward this to your customer:\n${pr.copyText}`,
      [invoiceQrMediaUrl(inv.id)],
    );
    return `Created ${inv.number} for HK$${amount.toFixed(2)} to ${inv.customerName} (due ${inv.dueDate}). Sent you the FPS QR to forward.`;
  },
};

const arAgingTool: Tool = {
  schema: {
    type: "function",
    function: {
      name: "ar_aging",
      description: "Accounts-receivable aging: how much customers owe, bucketed by how overdue it is.",
      parameters: { type: "object", properties: {} },
    },
  },
  async run() {
    const b = await arAging();
    return JSON.stringify({
      total_outstanding: money(b.total, "HKD"),
      current: money(b.current, "HKD"),
      overdue_1_30: money(b.d1_30, "HKD"),
      overdue_31_60: money(b.d31_60, "HKD"),
      overdue_60_plus: money(b.d60plus, "HKD"),
    });
  },
};

const listOverdueTool: Tool = {
  schema: {
    type: "function",
    function: {
      name: "list_overdue",
      description: "List invoices that are past their due date and still owed, most overdue first. Use to find which clients to chase.",
      parameters: { type: "object", properties: {} },
    },
  },
  async run() {
    const rows = await overdueInvoices();
    if (rows.length === 0) return "No overdue invoices.";
    return JSON.stringify(
      rows.map((r) => ({
        invoice: r.inv.number,
        customer: r.inv.customerName,
        outstanding: money(r.outstandingCents, r.inv.currency),
        days_overdue: r.daysOverdue,
        due_date: r.inv.dueDate,
      })),
    );
  },
};

const sendInvoiceReminder: Tool = {
  schema: {
    type: "function",
    function: {
      name: "send_invoice_reminder",
      description: "Send a polite WhatsApp payment reminder for an invoice, with the FPS QR/PayMe attached. If the customer's phone is on file it goes to them; otherwise it comes back to you to forward.",
      parameters: {
        type: "object",
        properties: {
          invoice: { type: "string", description: "Invoice number (e.g. INV-2026-0001)." },
          to_phone: { type: "string", description: "Optional client phone in E.164 to send to directly." },
        },
        required: ["invoice"],
      },
    },
  },
  async run(args, ctx) {
    const ref = String(args.invoice ?? "").trim();
    if (!ref) return "Need an invoice number.";
    const [inv] = await db.select().from(invoices).where(ilike(invoices.number, `%${ref}%`)).limit(1);
    if (!inv) return `No invoice matching "${ref}".`;
    const outstanding = Number(inv.totalCents) - Number(inv.amountPaidCents);
    if (outstanding <= 0) return `${inv.number} is already settled.`;

    const pr = await buildPaymentRequest({ amount: outstanding / 100, reference: inv.number });
    const msg = `Friendly reminder: invoice ${inv.number} for ${money(outstanding, inv.currency)} is due${inv.dueDate ? ` (${inv.dueDate})` : ""}. You can pay instantly:\n${pr.copyText}`;

    let toPhone = typeof args.to_phone === "string" && args.to_phone.trim() ? args.to_phone.trim() : null;
    if (!toPhone && inv.customerId) {
      const [c] = await db.select().from(customers).where(eq(customers.id, inv.customerId)).limit(1);
      if (c?.phone) toPhone = c.phone;
    }

    if (toPhone) {
      await ctx.channel.send(toPhone, msg, [invoiceQrMediaUrl(inv.id)]);
      return `Reminder for ${inv.number} sent to ${inv.customerName ?? toPhone}.`;
    }
    await ctx.channel.send(ctx.user.phone, `No phone on file for ${inv.customerName ?? "this customer"} — forward this:\n${msg}`, [invoiceQrMediaUrl(inv.id)]);
    return `No client phone on file for ${inv.number}; sent you the reminder + QR to forward.`;
  },
};

// --- Manager tools: reimbursements, allowances, supplier payments -----------

const reimburseExpense: Tool = {
  schema: {
    type: "function",
    function: {
      name: "reimburse_expense",
      description: "Pay approved expense(s) back to the employee via FPS. Pass expense_id for one, or omit to reimburse all approved expenses.",
      parameters: { type: "object", properties: { expense_id: { type: "number", description: "Optional; omit to reimburse all approved." } } },
    },
  },
  async run(args, ctx) {
    let rows;
    if (Number.isFinite(Number(args.expense_id))) {
      rows = await db.select().from(expenses).where(eq(expenses.id, Number(args.expense_id))).limit(1);
      if (!rows[0]) return `No expense #${args.expense_id}.`;
      if (rows[0].status !== "approved") return `Expense #${rows[0].id} is ${rows[0].status}, not approved.`;
    } else {
      rows = await db.select().from(expenses).where(eq(expenses.status, "approved"));
      if (rows.length === 0) return "No approved expenses waiting for reimbursement.";
    }

    const rail = paymentRail();
    let total = 0;
    let count = 0;
    for (const exp of rows) {
      if (exp.amountCents == null) continue;
      const [emp] = await db.select().from(users).where(eq(users.id, exp.submittedBy)).limit(1);
      const res = await rail.payout({
        amountCents: exp.amountCents,
        currency: exp.currency,
        toProxyType: "mobile",
        toProxyId: emp?.phone ?? null,
        reference: `EXP-${exp.id}`,
        payeeName: emp?.name ?? null,
      });
      if (!res.ok) continue;
      await db.update(expenses).set({ status: "reimbursed", reimbursedAt: new Date() }).where(eq(expenses.id, exp.id));
      total += exp.amountCents;
      count++;
      if (emp) {
        await ctx.channel.send(emp.phone, `Reimbursed ${money(exp.amountCents, exp.currency)} for expense #${exp.id} via FPS ✅`);
      }
    }
    return `Reimbursed ${count} expense(s), ${money(total, "HKD")} total, via FPS.`;
  },
};

const setAllowance: Tool = {
  schema: {
    type: "function",
    function: {
      name: "set_allowance",
      description: "Set an employee's spending controls (all HKD; pass only what you want to change): monthly_allowance, max_single_qr, auto_approve_under. Pass 0 to clear a limit.",
      parameters: {
        type: "object",
        properties: {
          employee: { type: "string", description: "Employee name." },
          monthly_allowance: { type: "number", description: "Monthly spend cap in HKD (0 = unlimited)." },
          max_single_qr: { type: "number", description: "Max per QR/request in HKD (0 = no cap)." },
          auto_approve_under: { type: "number", description: "Receipts under this HKD auto-approve (0 = always require approval)." },
        },
        required: ["employee"],
      },
    },
  },
  async run(args) {
    const emp = await findEmployeeByName(String(args.employee ?? ""));
    if (!emp) return `No employee matching "${args.employee}".`;
    const set: Partial<typeof users.$inferInsert> = {};
    const cents = (v: unknown) => (Number(v) > 0 ? Math.round(Number(v) * 100) : null);
    if (args.monthly_allowance != null) set.monthlyAllowanceCents = cents(args.monthly_allowance);
    if (args.max_single_qr != null) set.maxSingleQrCents = cents(args.max_single_qr);
    if (args.auto_approve_under != null) set.autoApproveUnderCents = cents(args.auto_approve_under);
    if (Object.keys(set).length === 0) return "Nothing to change — specify monthly_allowance, max_single_qr, or auto_approve_under.";
    await db.update(users).set(set).where(eq(users.id, emp.id));
    const [u] = await db.select().from(users).where(eq(users.id, emp.id)).limit(1);
    return `Updated ${emp.name}: allowance ${u.monthlyAllowanceCents != null ? money(u.monthlyAllowanceCents, "HKD") + "/mo" : "unlimited"}, max/QR ${u.maxSingleQrCents != null ? money(u.maxSingleQrCents, "HKD") : "none"}, auto-approve under ${u.autoApproveUnderCents != null ? money(u.autoApproveUnderCents, "HKD") : "off"}.`;
  },
};

const paySupplier: Tool = {
  schema: {
    type: "function",
    function: {
      name: "pay_supplier",
      description: "Record and pay a supplier purchase via FPS. Creates an AP bill and marks it paid.",
      parameters: {
        type: "object",
        properties: {
          supplier: { type: "string", description: "Supplier name." },
          amount: { type: "number", description: "Amount in HKD." },
          description: { type: "string", description: "What the purchase is for." },
        },
        required: ["supplier", "amount"],
      },
    },
  },
  async run(args) {
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) return "Need a positive amount in HKD.";
    const name = String(args.supplier ?? "").trim();
    if (!name) return "Need a supplier name.";
    let [sup] = await db.select().from(suppliers).where(ilike(suppliers.name, `%${name}%`)).limit(1);
    if (!sup) {
      [sup] = await db.insert(suppliers).values({ name, normalizedName: name.toLowerCase() }).returning();
    }
    const amountCents = Math.round(amount * 100);
    const [bill] = await db
      .insert(bills)
      .values({
        supplierId: sup.id,
        supplierName: sup.name,
        description: typeof args.description === "string" ? args.description : null,
        amountCents,
        currency: "HKD",
        status: "paid",
        paidAt: new Date(),
      })
      .returning();
    const res = await paymentRail().payout({
      amountCents,
      currency: "HKD",
      toProxyType: (sup.fpsProxyType as "mobile" | "email" | "fpsid" | null) ?? "fpsid",
      toProxyId: sup.fpsProxyId,
      reference: `BILL-${bill.id}`,
      payeeName: sup.name,
    });
    return res.ok
      ? `Paid ${sup.name} ${money(amountCents, "HKD")} via FPS (bill #${bill.id}).`
      : `Recorded bill #${bill.id} for ${sup.name} but the payout failed.`;
  },
};

// --- Employee tools ---------------------------------------------------------

const requestQr: Tool = {
  schema: {
    type: "function",
    function: {
      name: "request_qr",
      description: "Generate an FPS payment QR for yourself to pay on the company's behalf. The QR is sent to you, and your manager is notified.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount in HKD." },
          purpose: { type: "string", description: "What the payment is for." },
        },
        required: ["amount"],
      },
    },
  },
  async run(args, ctx) {
    const amount = Number(args.amount);
    if (!Number.isFinite(amount) || amount <= 0) return "Need a positive amount in HKD.";
    const amountCents = Math.round(amount * 100);

    // Enforce the manager-set controls on this employee.
    if (ctx.user.maxSingleQrCents != null && amountCents > ctx.user.maxSingleQrCents) {
      return `That's over your per-payment limit of ${money(ctx.user.maxSingleQrCents, "HKD")}. Ask your manager to raise it.`;
    }
    if (ctx.user.monthlyAllowanceCents != null) {
      const spent = await employeeSpentThisMonthCents(ctx.user.id);
      if (spent + amountCents > ctx.user.monthlyAllowanceCents) {
        const left = ctx.user.monthlyAllowanceCents - spent;
        return `That would exceed your monthly allowance (${money(ctx.user.monthlyAllowanceCents, "HKD")}; ${money(Math.max(0, left), "HKD")} left). Ask your manager.`;
      }
    }

    const purpose = typeof args.purpose === "string" ? args.purpose : undefined;

    const payload = buildFpsPayload({ amount, reference: purpose ?? "Expense" });
    const inserted = await db
      .insert(qrIssuances)
      .values({
        issuedBy: null,
        employeeId: ctx.user.id,
        amountCents: Math.round(amount * 100),
        currency: "HKD",
        purpose: purpose ?? null,
        payload,
        status: "issued",
      })
      .returning({ id: qrIssuances.id });
    const id = inserted[0].id;

    await ctx.channel.send(
      ctx.user.phone,
      `Here's your FPS QR for HK$${amount.toFixed(2)}${purpose ? ` (${purpose})` : ""}. Scan to pay, then send the receipt photo back.`,
      [qrMediaUrl(id)],
    );

    const mgr = await getManager();
    if (mgr) {
      await ctx.channel.send(
        mgr.phone,
        `${ctx.user.name} requested an FPS QR for HK$${amount.toFixed(2)}${purpose ? ` (${purpose})` : ""}.`,
      );
    }
    return `Generated QR #${id} for HK$${amount.toFixed(2)} and sent it to you. Manager notified.`;
  },
};

const listMyExpenses: Tool = {
  schema: {
    type: "function",
    function: {
      name: "list_my_expenses",
      description: "List the expenses you have submitted and their approval status.",
      parameters: {
        type: "object",
        properties: { status: { type: "string", enum: ["pending", "approved", "rejected", "all"] } },
      },
    },
  },
  async run(args, ctx) {
    const rows = await db
      .select()
      .from(expenses)
      .where(eq(expenses.submittedBy, ctx.user.id))
      .orderBy(desc(expenses.createdAt))
      .limit(50);
    const status = (args.status as string) ?? "all";
    const filtered = status === "all" ? rows : rows.filter((r) => r.status === status);
    if (filtered.length === 0) return "You have no matching expenses.";
    return JSON.stringify(
      filtered.map((r) => ({ id: r.id, amount: money(r.amountCents, r.currency), merchant: r.merchant, date: r.expenseDate, status: r.status })),
    );
  },
};

const myAllowance: Tool = {
  schema: {
    type: "function",
    function: {
      name: "my_allowance",
      description: "Show your spending allowance, per-payment limit, and how much is left this month.",
      parameters: { type: "object", properties: {} },
    },
  },
  async run(_args, ctx) {
    const spent = await employeeSpentThisMonthCents(ctx.user.id);
    const allowance = ctx.user.monthlyAllowanceCents;
    return JSON.stringify({
      monthly_allowance: allowance != null ? money(allowance, "HKD") : "unlimited",
      spent_this_month: money(spent, "HKD"),
      remaining: allowance != null ? money(Math.max(0, allowance - spent), "HKD") : "unlimited",
      max_per_payment: ctx.user.maxSingleQrCents != null ? money(ctx.user.maxSingleQrCents, "HKD") : "none",
    });
  },
};

const MANAGER_TOOLS: Tool[] = [
  listExpenses,
  expenseSummary,
  approveExpense,
  rejectExpense,
  editExpense,
  issueQr,
  reimburseExpense,
  setAllowance,
  paySupplier,
  createInvoice,
  arAgingTool,
  listOverdueTool,
  sendInvoiceReminder,
];
const EMPLOYEE_TOOLS: Tool[] = [requestQr, listMyExpenses, myAllowance];

export function toolsForRole(role: Role): { schemas: OpenAiTool[]; byName: Map<string, Tool> } {
  const tools = role === "manager" ? MANAGER_TOOLS : EMPLOYEE_TOOLS;
  return {
    schemas: tools.map((t) => t.schema),
    byName: new Map(tools.map((t) => [t.schema.function.name, t])),
  };
}
