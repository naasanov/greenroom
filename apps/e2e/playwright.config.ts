import { defineConfig, devices } from "@playwright/test";
import { E2E_WORKERS } from "./src/env.js";

// Each worker runs its own API + web servers and database (see src/servers.ts).
// Servers are built artifacts: run `pnpm build` first; `pnpm test:e2e` does this via turbo.
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./src/global-setup.ts",
  fullyParallel: false,
  workers: E2E_WORKERS,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    { name: "mobile", use: { ...devices["iPhone 15"] } },
  ],
});
