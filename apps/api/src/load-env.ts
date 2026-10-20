import { fileURLToPath } from "node:url";

// Loads the repo-root .env if present. Variables already set in the environment win.
// Imported first in main.ts so it runs before modules that read env at load time.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}
