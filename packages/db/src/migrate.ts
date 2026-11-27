import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { assertLocalDatabase } from "./guard-remote-db.js";

// Migrations ship next to dist, so the folder resolves the same from src or dist.
const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../migrations", import.meta.url),
);

/** Applies all pending migrations; non-local hosts need ALLOW_REMOTE_DB=1. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  assertLocalDatabase(databaseUrl);
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
}
