---
name: local-run-gotchas
description: Full e2e runs that cross local midnight fail date-relative specs; `pnpm format` rewrites files; WebKit crashes on the factory
type: project
applies-to: apps/e2e/**
---

- A full `pnpm test:e2e` run (about 18 min) that crosses local midnight fails ~30 calendar, agenda, and event drawer specs, because seeds and the app compute "today" at different moments. Rerun the failed files before treating them as regressions (seen 2026-10-22).
- `pnpm format` (and `pnpm format --check`) runs prettier in write mode across the repo and reformats unrelated files. Revert anything outside the task's scope before committing.

**Why:** both cost a debugging detour in the 2026-10-22 pre-Gate-2 validation.

**How to apply:** avoid starting the full suite near midnight; check `git status` after running format. See [[e2e-test-scope]].
- On the factory, Playwright WebKit dies at launch with a Bus error (exit 135), even outside the tests (seen 2026-10-27), so local runs use `pnpm test:e2e -- --project=desktop <filters>` and mobile coverage comes from CI.
- On the factory, page loads under parallel agent builds take about 35s, so stage specs stall on their spinner at the default 30s timeout. Run targeted specs with `--timeout=120000`. Gig deep links (`/gigs/<id>`) do not open the event drawer there, so `deep-links`, `setlist-gig` and the library-chords setlist icon test fail locally but pass in CI (seen 2026-11-18, #95).
- If the system Postgres on the factory is down (the `postgres` user owns the data dir, `dev` cannot restart it), local e2e still works against a private cluster: `initdb -D <tmp>/pg --auth=trust -U greenroom`, `pg_ctl -o "-p 5433"`, create `greenroom` and `greenroom_test`, then export `DATABASE_URL` and `TEST_DATABASE_URL` pointing at port 5433 (seen 2026-11-17).
- Never wrap `pnpm test:e2e` in a short `timeout`: killing it mid-run orphans the detached API (4100) and web (3100) servers, which keep serving the old build and make every later run fail oddly. A cold turbo build alone can take several minutes on the factory.
- A dev-owned cluster started with `initdb -U greenroom -D ~/pgdata-dev` and `pg_ctl -o "-k /tmp -p 5432"` (create the `greenroom` and `greenroom_test` DBs) needs no env changes (seen 2026-11-19).
Seen again: 2026-11-23 (system Postgres down at build start; the dev-owned cluster in `~/pgdata-dev` on :5432 worked, escalated in #141).
Seen again: 2026-11-23, epic #148 (Postgres down again; same `~/pgdata-dev` workaround, started with `/usr/lib/postgresql/17/bin/pg_ctl` since `pg_ctl` is not on PATH).
- On the factory, Playwright's Chromium headless shell build 1248 segfaults at launch (exit 139). Run local e2e with `PLAYWRIGHT_BROWSERS_PATH` pointing at a directory whose `*-1248` entries symlink to the working `*-1234` builds in `~/.cache/ms-playwright` (seen 2026-11-23, #148).
