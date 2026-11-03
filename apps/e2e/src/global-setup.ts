import { runMigrations } from "@greenroom/db";
import { BASE_DATABASE_URL } from "./env.js";

export default async function globalSetup(): Promise<void> {
  await runMigrations(BASE_DATABASE_URL);
}
