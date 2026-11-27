import { guardRemoteDbOrExit } from "./guard-remote-db.js";

// Runs before `drizzle-kit migrate`; checks the same URL drizzle.config.ts resolves.
guardRemoteDbOrExit(
  process.env.DATABASE_URL ??
    "postgres://greenroom:greenroom@localhost:5432/greenroom",
);
