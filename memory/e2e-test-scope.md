---
name: e2e-test-scope
description: Run targeted e2e specs or the smoke spec during work; the full suite only at milestones (end of a ticket, before a gate)
type: feedback
---

Day-to-day validation runs only the specs that cover the change, plus `tests/smoke.spec.ts`, e.g. `pnpm --filter @greenroom/e2e test:e2e events- smoke.spec` (args are Playwright path regex filters; shell globs fail because pnpm runs from the repo root) (inside the e2e lock). The full `pnpm test:e2e` suite runs only at important milestones: the end of a ticket, before a 🛑 gate, or before marking a task Done. CI still runs everything on push.

**Why:** the user said on 2026-10-21 that the full suite is too slow to run after every wave or subagent step.

**How to apply:** the orchestrator follows this when validating, and every subagent brief tells the agent to run only its own specs plus smoke, never the full suite. Related: [[parallel-agent-coordination]], [[orchestrator-role]].
