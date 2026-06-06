import { NextRequest, NextResponse } from "next/server";
import { asc, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { normalizePhone } from "@/lib/users";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db.select().from(users).orderBy(desc(users.role), asc(users.name));
  return NextResponse.json({ users: rows });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => null)) as
    | { name?: string; phone?: string; role?: string }
    | null;
  if (!b?.name?.trim() || !b?.phone?.trim()) {
    return NextResponse.json({ error: "Name and phone are required" }, { status: 400 });
  }
  const role = b.role === "manager" ? "manager" : "employee";
  try {
    const [row] = await db
      .insert(users)
      .values({ name: b.name.trim(), phone: normalizePhone(b.phone), role })
      .returning();
    return NextResponse.json({ user: row });
  } catch {
    return NextResponse.json({ error: "That phone number is already registered" }, { status: 409 });
  }
}
