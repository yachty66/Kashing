import { desc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses, qrIssuances, users } from "@/lib/db/schema";
import { buildFpsPayload } from "@/lib/fps-qr";
import { findEmployeeByName, getManager, type Role, type User } from "@/lib/users";
import { money } from "@/lib/money";
import { qrMediaUrl, type Channel } from "@/lib/agent/channel";

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

const MANAGER_TOOLS: Tool[] = [listExpenses, expenseSummary, approveExpense, rejectExpense, editExpense, issueQr];
const EMPLOYEE_TOOLS: Tool[] = [requestQr, listMyExpenses];

export function toolsForRole(role: Role): { schemas: OpenAiTool[]; byName: Map<string, Tool> } {
  const tools = role === "manager" ? MANAGER_TOOLS : EMPLOYEE_TOOLS;
  return {
    schemas: tools.map((t) => t.schema),
    byName: new Map(tools.map((t) => [t.schema.function.name, t])),
  };
}
