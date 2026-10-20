import { runMigrations } from "./migrate.js";

// Fly release_command entry point: node packages/db/dist/migrate-cli.js
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
await runMigrations(databaseUrl);
console.log("migrations applied");
