import { eq, ilike, and, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export type Role = "manager" | "employee";
export type User = typeof users.$inferSelect;

/** Strip the WhatsApp transport prefix and whitespace, keep E.164. */
export function normalizePhone(raw: string): string {
  return raw.replace(/^whatsapp:/i, "").replace(/\s+/g, "").trim();
}

export async function getUserByPhone(phone: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.phone, normalizePhone(phone))).limit(1);
  return rows[0] ?? null;
}

/** The CFO. We assume a single manager for the demo; returns the first one. */
export async function getManager(): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.role, "manager")).limit(1);
  return rows[0] ?? null;
}

/** Best-effort employee lookup by name fragment, for `issue_qr`. */
export async function findEmployeeByName(name: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.role, "employee"), ilike(users.name, `%${name}%`)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listEmployees(): Promise<User[]> {
  return db.select().from(users).where(eq(users.role, "employee"));
}

/** Everyone except the given user — used to fan out notifications if needed. */
export async function others(userId: number): Promise<User[]> {
  return db.select().from(users).where(ne(users.id, userId));
}
