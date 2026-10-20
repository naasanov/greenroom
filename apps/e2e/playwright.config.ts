import { defineConfig, devices } from "@playwright/test";
import {
  API_PORT,
  API_URL,
  TEST_DATABASE_URL,
  WEB_PORT,
  WEB_URL,
} from "./src/env.js";

// One shared database, so tests run serially in a single worker.
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./src/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: WEB_URL,
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
  // Built servers (run `pnpm build` first; `pnpm test:e2e` does this via turbo).
  webServer: [
    {
      command: "node dist/main.js",
      cwd: "../api",
      url: `${API_URL}/health`,
      env: {
        API_PORT: String(API_PORT),
        DATABASE_URL: TEST_DATABASE_URL,
        INTEGRATIONS_MODE: "fake",
        NODE_ENV: "test",
        WEB_URL,
        WEB_ORIGIN: WEB_URL,
        API_PUBLIC_URL: API_URL,
      },
    },
    {
      command: `pnpm exec next start -p ${WEB_PORT}`,
      cwd: "../web",
      url: WEB_URL,
    },
  ],
});
