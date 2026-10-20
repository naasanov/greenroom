import { sql } from "drizzle-orm";
import type { Database } from "../client.js";

/** Truncates every app table in the public schema (migration bookkeeping lives elsewhere). */
export async function resetDatabase(db: Database): Promise<void> {
  const rows = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  const names = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await db.execute(sql.raw(`truncate table ${names} restart identity cascade`));
}
