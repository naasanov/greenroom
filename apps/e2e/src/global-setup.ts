import { runMigrations } from "@greenroom/db";
import { TEST_DATABASE_URL } from "./env.js";

export default async function globalSetup(): Promise<void> {
  await runMigrations(TEST_DATABASE_URL);
}
