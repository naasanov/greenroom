# @greenroom/e2e

Playwright tests against built servers: API on 4100, web on 3100, `greenroom_test` DB, `INTEGRATIONS_MODE=fake`.
Projects: `desktop` (Chromium 1280x800) and `mobile` (iPhone 15, WebKit).
Each worker starts its own API + web servers (`src/servers.ts`) on ports 4100+N / 3100+N and uses DB `greenroom_test` (N=0) or `greenroom_test_wN`.
`E2E_WORKERS` sets the worker count (default 1; CI uses 2). `API_URL`, `WEB_URL` and `TEST_DATABASE_URL` from `src/env.ts` resolve per worker.

## Run
- One-time: `pnpm db:up` (Mac; on the factory Postgres already runs natively, skip it) and `pnpm --filter @greenroom/e2e exec playwright install chromium webkit`.
- `pnpm test:e2e` from the root builds everything first, then runs.
- Fast loop after a build: `cd apps/e2e && pnpm exec playwright test --project=desktop -g "name"`.
- Global setup migrates the base test DB; extra worker DBs are created and migrated on first use. Set `TEST_DATABASE_URL` to override it.

## Write a spec
Put it in `tests/*.spec.ts` and import from `../src/fixtures.js`:
- `testApi.seed("band")` returns fixture ids/handles (`USERS`, `BANDS`, `GIG_IDS`... are also exported from `@greenroom/db`).
- `testApi.reset()`, `testApi.magicLinksFor(email)`.
- `loginAs(email)` creates the user + session and adds the session cookie to the browser `context`; `testApi.login(email)` returns the raw cookie for API-level `request` use.
- `db` is a Drizzle handle on the test DB for assertions.
- An auto fixture resets DB and fakes before every test, so start from `empty` and seed what you need.

## Add a fake-control endpoint
1. Add the method to `apps/api/src/testing/testing.controller.ts` (read or mutate `this.registry.<fake>`, return JSON).
2. Add a matching typed method in `src/test-api.ts`.
3. New seed data goes in `packages/db/src/seed/` (add a scenario to `SCENARIOS` in `index.ts`).
The `/__test__` routes exist only when `INTEGRATIONS_MODE=fake` and `NODE_ENV` is not production.

Note: `NEXT_PUBLIC_*` vars are inlined at web build time, so the web build reads the API URL from the build environment.
