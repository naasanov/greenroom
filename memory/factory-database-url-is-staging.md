---
name: factory-database-url-is-staging
description: The factory shell exports DATABASE_URL pointing at the staging database; export local URLs before any db, migrate, api test or e2e command
type: feedback
applies-to: all
---

On the factory box the shell exports `DATABASE_URL` pointing at the staging database host (`greenroom-staging-db.internal`). Any `pnpm db:migrate`, seed, api test or e2e run in a shell that inherited it hits staging, not local Postgres. On 2026-11-24 a build agent applied migration 0024 to the staging database this way (additive, no harm).

**Why:** the variable is exported by the box environment for Fly tooling.

**How to apply:** every agent brief must tell the agent to run `export DATABASE_URL=postgres://greenroom:greenroom@localhost:5432/greenroom TEST_DATABASE_URL=postgres://greenroom:greenroom@localhost:5432/greenroom_test` in the same shell command before any db, migrate, api test or e2e command, and to verify it with `echo "$DATABASE_URL" | sed 's/:.*@/:***@/'`. Related: [[local-run-gotchas]].

Seen again: 2026-11-26, #168. The brief said "localhost only" but did not give the export line, and the agent ran `pnpm --filter @greenroom/db migrate` in the inherited shell, which most likely applied migration 0026 to staging before the deploy (additive, idempotent backfill, no harm). Escalated in a `[factory]` issue.

Update 2026-11-27: `packages/db` migrate, runMigrations and seed now refuse any non-local host unless `ALLOW_REMOTE_DB=1` (set only in the Fly api tomls and CI). In the inherited shell the staging URL therefore fails loudly instead of migrating staging. Never export `ALLOW_REMOTE_DB` on the factory. The export line above is still needed until the box env defaults to localhost (#177 box half).
