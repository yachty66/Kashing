import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { agentMessages, expenses } from "@/lib/db/schema";
import { DEFAULT_MODEL } from "@/lib/models";
import { getManager, type User } from "@/lib/users";
import { money } from "@/lib/money";
import { parseReceipt } from "@/lib/receipt-vision";
import { type Channel } from "@/lib/agent/channel";
import { toolsForRole, type ToolContext } from "@/lib/agent/tools";

const AGENT_MODEL = process.env.AGENT_MODEL || DEFAULT_MODEL;
const OR_URL = "https://openrouter.ai/api/v1/chat/completions";
const HISTORY_LIMIT = 12;

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

function systemPrompt(user: User): string {
  const today = new Date().toISOString().slice(0, 10);
  const common = `You are Jacob, a company's AI CFO, replying on WhatsApp. Today is ${today}.
Keep replies short and mobile-friendly — a sentence or two, no markdown headings.
Show each amount with the currency symbol exactly as it appears in the tool data (e.g. €85.20, HK$200.00); never convert between currencies. Use the tools for any real data or action; never invent numbers or IDs.`;
  if (user.role === "manager") {
    return `${common}
You are talking to ${user.name}, the manager. You can: look up and summarize team expenses, approve/reject/edit expenses, reimburse approved expenses via FPS (reimburse_expense), set an employee's allowance/limits (set_allowance), pay a supplier via FPS (pay_supplier), issue FPS QR codes to employees, create B2B invoices with an FPS QR (create_invoice), check receivables aging (ar_aging), list overdue invoices (list_overdue), send one payment reminder (send_invoice_reminder), and chase all overdue customers at once (chase_overdue).
Be decisive — when an instruction is unambiguous, just do it. If they say "approve"/"reject" without an ID and there is exactly one pending expense, act on that one (the tools do this automatically). Only ask for clarification when there are genuinely multiple candidates. If they ask to fix or set an expense's amount/merchant/date, use edit_expense — don't say you can't.`;
  }
  return `${common}
You are talking to ${user.name}, an employee. You can: generate an FPS payment QR code for them to pay on the company's behalf (within their allowance/limits), list their own expenses, and show their remaining allowance (my_allowance). To submit an expense, they simply send a photo of the receipt — you don't need a tool for that.`;
}

async function loadHistory(userId: number): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(agentMessages)
    .where(eq(agentMessages.userId, userId))
    .orderBy(asc(agentMessages.createdAt));
  return rows.slice(-HISTORY_LIMIT).map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
}

async function saveTurn(userId: number, role: "user" | "assistant", content: string) {
  await db.insert(agentMessages).values({ userId, role, content });
}

async function callOpenRouter(messages: ChatMessage[], tools: unknown[]): Promise<ChatMessage> {
  const res = await fetch(OR_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.PUBLIC_BASE_URL ?? "http://localhost:3001",
      "X-Title": "Jacob CFO agent",
    },
    body: JSON.stringify({ model: AGENT_MODEL, messages, tools, max_tokens: 1024 }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { choices?: { message?: ChatMessage }[] };
  const msg = json.choices?.[0]?.message;
  if (!msg) throw new Error("OpenRouter returned no message");
  return msg;
}

export type AgentReply = { text: string };

/** Run the role-aware tool-calling agent on a text message. */
export async function respond(user: User, text: string, channel: Channel): Promise<AgentReply> {
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not set");
  const { schemas, byName } = toolsForRole(user.role as "manager" | "employee");
  const ctx: ToolContext = { user, channel };

  const history = await loadHistory(user.id);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(user) },
    ...history,
    { role: "user", content: text },
  ];

  let final = "";
  for (let i = 0; i < 6; i++) {
    const msg = await callOpenRouter(messages, schemas);
    messages.push(msg);

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const call of msg.tool_calls) {
        const tool = byName.get(call.function.name);
        let result: string;
        if (!tool) {
          result = `Unknown tool ${call.function.name}.`;
        } else {
          try {
            const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
            result = await tool.run(args, ctx);
          } catch (e) {
            result = `Error running ${call.function.name}: ${e instanceof Error ? e.message : String(e)}`;
          }
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      continue; // let the model read tool results and continue
    }

    final = (msg.content ?? "").trim();
    break;
  }

  if (!final) final = "Sorry, I couldn't process that — try rephrasing.";
  await saveTurn(user.id, "user", text);
  await saveTurn(user.id, "assistant", final);
  return { text: final };
}

/**
 * Handle an inbound receipt photo from an employee: read it with vision,
 * record a pending expense, notify the manager, and confirm to the employee.
 */
export async function handleReceipt(
  user: User,
  receipt: { imageDataUrl: string; mediaUrl: string },
  channel: Channel,
): Promise<AgentReply> {
  const parsed = await parseReceipt(receipt.imageDataUrl);
  const amountCents = parsed.amount != null ? Math.round(parsed.amount * 100) : null;

  // Auto-approve under the employee's manager-set threshold (if any).
  const limit = user.autoApproveUnderCents;
  const autoApproved = amountCents != null && limit != null && amountCents <= limit;

  const inserted = await db
    .insert(expenses)
    .values({
      submittedBy: user.id,
      amountCents,
      currency: parsed.currency || "HKD",
      merchant: parsed.merchant,
      brNumber: parsed.brNumber,
      category: parsed.category,
      expenseDate: parsed.date,
      receiptUrl: receipt.mediaUrl,
      rawParse: parsed.raw as object,
      status: autoApproved ? "approved" : "pending",
    })
    .returning({ id: expenses.id });
  const id = inserted[0].id;

  const amountStr = amountCents != null ? money(amountCents, parsed.currency) : "an unreadable amount";
  const where = parsed.merchant ? ` at ${parsed.merchant}` : "";
  const when = parsed.date ? ` on ${parsed.date}` : "";

  const mgr = await getManager();
  if (mgr) {
    await channel.send(
      mgr.phone,
      autoApproved
        ? `Auto-approved expense from ${user.name}: ${amountStr}${where}${when} (#${id}, under limit).`
        : `New expense from ${user.name}: ${amountStr}${where}${when} (#${id}). Reply "approve ${id}" or "reject ${id}".`,
    );
  }

  await saveTurn(user.id, "user", "[sent a receipt photo]");
  const reply = autoApproved
    ? `Got your receipt — ${amountStr}${where}${when}. Auto-approved ✅ (#${id}). It'll be reimbursed in the next run.`
    : `Got your receipt — ${amountStr}${where}${when}. Submitted for approval ✅ (#${id})`;
  await saveTurn(user.id, "assistant", reply);
  return { text: reply };
}
