import "dotenv/config";
import { config } from "dotenv";
import type { Config } from "drizzle-kit";

// Drizzle Kit doesn't auto-load .env.local (Next's convention); do it ourselves.
config({ path: ".env.local" });

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
