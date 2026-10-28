---
name: parallel-agent-coordination
description: How parallel Sonnet agents share this repo safely (one lockfile owner, orchestrator pre-installs deps, e2e mutex lock)
type: feedback
---

Rules for running Sonnet agents in parallel on the same working tree:

- Only one agent per wave may run `pnpm add`/`pnpm install` (it owns `pnpm-lock.yaml`). If another agent needs packages, the orchestrator installs them before launching the wave.
- Agents run only their own specs plus smoke, never the full suite (see [[e2e-test-scope]]). e2e runs share ports 3100/4100 and the test DB, so every agent wraps them in a mutex: `until mkdir /tmp/greenroom-e2e.lock 2>/dev/null; do sleep 10; done; pnpm test:e2e -- <spec filters>; rc=$?; rmdir /tmp/greenroom-e2e.lock; exit $rc`. If a stale lock blocks runs and no agent is running, remove the dir. `/tmp` works on both machines (on macOS it is a symlink to `/private/tmp`).
- Never let an agent run `pnpm format` across the whole repo; format only owned files.
- While any agent is running, the orchestrator commits with explicit paths only (`git add <paths>`), never `git commit -a` or `git add -A`: on 2026-10-22 a docs commit swept an agent's half-finished files onto main.
- The factory had ~4 GB RAM until 2026-10-27, when three agents building at once made `nest build` OOM and Chromium segfault; it now has 8 GB. Still keep it to two or three agents, since concurrent `next build` runs collide ("Another next build process is already running") and e2e runs serialize on the lock anyway.
- Agents' acceptance checks can leave servers running (a stray `node dist/main.js` happened in Phase 0); check `lsof -i tcp:<port>` after a wave.

**Why:** concurrent installs race on the lockfile, and concurrent e2e runs collide on ports and DB state.

**How to apply:** put the ownership list, install rule, and lock command in every parallel brief. Related: [[orchestrator-role]].
