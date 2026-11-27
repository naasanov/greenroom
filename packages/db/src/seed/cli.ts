import { createDb } from "../client.js";
import { guardRemoteDbOrExit } from "../guard-remote-db.js";
import { seedScenario } from "./index.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
guardRemoteDbOrExit(url);

const { db, close } = createDb(url, { max: 1 });
try {
  await seedScenario(db, "band");
  console.log("Seeded the band scenario into the dev database.");
} finally {
  await close();
}
