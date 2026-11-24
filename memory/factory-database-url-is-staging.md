---
name: factory-database-url-is-staging
description: The factory shell exports DATABASE_URL pointing at the staging database; export local URLs before any db, migrate, api test or e2e command
type: feedback
applies-to: all
---

On the factory box the shell exports `DATABASE_URL` pointing at the staging database host (`greenroom-staging-db.internal`). Any `pnpm db:migrate`, seed, api test or e2e run in a shell that inherited it hits staging, not local Postgres. On 2026-11-24 a build agent applied migration 0024 to the staging database this way (additive, no harm).

**Why:** the variable is exported by the box environment for Fly tooling.

**How to apply:** every agent brief must tell the agent to run `export DATABASE_URL=postgres://greenroom:greenroom@localhost:5432/greenroom TEST_DATABASE_URL=postgres://greenroom:greenroom@localhost:5432/greenroom_test` in the same shell command before any db, migrate, api test or e2e command, and to verify it with `echo "$DATABASE_URL" | sed 's/:.*@/:***@/'`. Related: [[local-run-gotchas]].
