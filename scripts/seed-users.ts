/**
 * Seed the two demo WhatsApp users (manager + employee).
 *
 *   npm run seed
 *
 * Phone numbers and names come from env (.env.local), with placeholders so
 * the script is safe to run before you've filled them in:
 *   MANAGER_PHONE, MANAGER_NAME, EMPLOYEE_PHONE, EMPLOYEE_NAME
 * Phones must be E.164, e.g. +85291234567 (no "whatsapp:" prefix).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const { db } = await import("../lib/db");
  const { users } = await import("../lib/db/schema");

  const seed = [
    {
      phone: process.env.MANAGER_PHONE || "+85200000001",
      name: process.env.MANAGER_NAME || "Manager",
      role: "manager",
    },
    {
      phone: process.env.EMPLOYEE_PHONE || "+85200000002",
      name: process.env.EMPLOYEE_NAME || "Employee",
      role: "employee",
    },
  ];

  for (const u of seed) {
    await db
      .insert(users)
      .values(u)
      .onConflictDoUpdate({ target: users.phone, set: { name: u.name, role: u.role } });
    console.log(`✓ ${u.role}: ${u.name} (${u.phone})`);
  }

  console.log("Done. Edit MANAGER_/EMPLOYEE_ vars in .env.local and re-run to update.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
