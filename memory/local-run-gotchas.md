---
name: local-run-gotchas
description: Full e2e runs that cross local midnight fail date-relative specs; `pnpm format` rewrites files instead of checking
type: project
---

- A full `pnpm test:e2e` run (about 18 min) that crosses local midnight fails ~30 calendar, agenda, and event drawer specs, because seeds and the app compute "today" at different moments. Rerun the failed files before treating them as regressions (seen 2026-10-22).
- `pnpm format` (and `pnpm format --check`) runs prettier in write mode across the repo and reformats unrelated files. Revert anything outside the task's scope before committing.

**Why:** both cost a debugging detour in the 2026-10-22 pre-Gate-2 validation.

**How to apply:** avoid starting the full suite near midnight; check `git status` after running format. See [[e2e-test-scope]].
