# Auth

Every route requires a session by default (global `AuthGuard`, 401 otherwise).

```ts
import { CurrentUser, Public } from "../auth/index.js";
import type { User } from "@greenroom/shared";

@Get("mine")
list(@CurrentUser() user: User) {}        // user = { id, email, displayName, avatarUrl }

@Public() @Get("open") open() {}          // opt out per route or per controller
```

- Validate input with `new ZodPipe(schema)` from `src/common/zod.pipe.ts`; put schemas in `packages/shared`.
- Session: opaque token in an httpOnly cookie (`SESSION_COOKIE_NAME`, `COOKIE_DOMAIN`), SHA-256 hash in `sessions`, 30 days, sliding.
- `redirectTo` values go through `safeRedirect` (same-site relative paths only).
- Endpoints: `POST /auth/magic-link`, `POST /auth/magic-link/verify`, `GET /auth/google/start`, `GET /auth/google/callback`, `GET|PATCH /auth/me`, `POST /auth/logout`.
- Env: `WEB_URL`, `WEB_ORIGIN` (CORS, comma-separated), `API_PUBLIC_URL` (Google redirect URI).
- E2E: `testApi.loginAs(email)` logs a browser context in; see `apps/e2e/README.md`.

Band access guards (`@BandMember()`, `@BandAdmin()`, `@CurrentMembership()`): see `src/bands/README.md`.
