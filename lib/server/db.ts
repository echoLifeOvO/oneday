import { Pool } from "pg";
import { databaseTls } from "./database-tls.ts";

const state = globalThis as typeof globalThis & { oneDayPool?: Pool };
export function dataMode() {
  if (process.env.DATABASE_URL) return "database" as const;
  // Never turn a broken/missing production database into a successful local save.
  if (process.env.NODE_ENV !== "production" || process.env.ONE_DAY_PREVIEW === "1") return "preview" as const;
  throw new Error("DATABASE_NOT_CONFIGURED");
}
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  if (!state.oneDayPool) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 5000,
      statement_timeout: 8000,
      ...databaseTls(),
    });
    pool.on("error", () => console.error("[database] idle connection failed"));
    state.oneDayPool = pool;
  }
  return state.oneDayPool;
}
