import { test as base, expect } from "@playwright/test";
import { createDb, type Database } from "@greenroom/db";
import { API_URL, TEST_DATABASE_URL } from "./env.js";
import { TestApi } from "./test-api.js";

interface TestFixtures {
  testApi: TestApi;
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
  cleanSlate: [
    async ({ testApi }, use) => {
      await testApi.reset();
      await use();
    },
    { auto: true },
  ],
});

export { expect };
