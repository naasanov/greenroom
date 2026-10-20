import { test as base, expect } from "@playwright/test";
import { createDb, type Database } from "@greenroom/db";
import { API_URL, TEST_DATABASE_URL, WEB_URL } from "./env.js";
import { TestApi, type LoginResult } from "./test-api.js";

interface TestFixtures {
  testApi: TestApi;
  /** Logs the browser context in as this email (user is created if needed). */
  loginAs: (email: string) => Promise<LoginResult>;
  /** Runs before every test and leaves an empty database with fresh fakes. */
  cleanSlate: void;
}

interface WorkerFixtures {
  /** Direct handle on the test database for assertions. */
  db: Database;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  db: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const handle = createDb(TEST_DATABASE_URL, { max: 2 });
      await use(handle.db);
      await handle.close();
    },
    { scope: "worker" },
  ],
  testApi: async ({ playwright }, use) => {
    const request = await playwright.request.newContext({ baseURL: API_URL });
    await use(new TestApi(request));
    await request.dispose();
  },
  loginAs: async ({ testApi, context }, use) => {
    await use(async (email) => {
      const result = await testApi.login(email);
      await context.addCookies([
        { ...result.cookie, url: WEB_URL, httpOnly: true, sameSite: "Lax" },
      ]);
      return result;
    });
  },
  cleanSlate: [
    async ({ testApi }, use) => {
      await testApi.reset();
      await use();
    },
    { auto: true },
  ],
});

export { expect };
