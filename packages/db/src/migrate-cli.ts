import { guardRemoteDbOrExit } from "./guard-remote-db.js";
import { runMigrations } from "./migrate.js";

// Fly release_command entry point: node packages/db/dist/migrate-cli.js
// Non-local hosts need ALLOW_REMOTE_DB=1 (set in the infra/fly api tomls).
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
guardRemoteDbOrExit(databaseUrl);
await runMigrations(databaseUrl);
console.log("migrations applied");
