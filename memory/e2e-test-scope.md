---
name: e2e-test-scope
description: Never run the full e2e suite locally; run targeted specs plus smoke, and let CI run the full suite on push
type: feedback
---

Local validation (orchestrator and subagents) runs only the specs that cover the change plus `tests/smoke.spec.ts`, e.g. `pnpm test:e2e -- events- smoke.spec` from the repo root (args are Playwright path regex filters, not shell globs). Never run the full `pnpm test:e2e` locally, not even at the end of a ticket or before a gate: CI runs the whole suite (4 shards, desktop + iPhone) on every code push to `main`, and that run is the full-suite check. Never use `pnpm --filter @greenroom/e2e test:e2e`: it skips the turbo rebuild and silently tests a stale `.next` build (false failures on 2026-10-21).

**Why:** the user said on 2026-10-21 that the full suite is too slow to run after every wave, and on 2026-10-27, after a local full run was followed by the same full run in CI: "we should never run all e2e tests locally. That's CI's job."

**How to apply:** before a gate, push the validated work and wait for CI green (plus the staging deploy) instead of running the suite locally; fix CI failures with targeted local reruns of the failing specs. Every subagent brief says to run only its own specs plus smoke. Related: [[parallel-agent-coordination]], [[batch-pushes]], [[orchestrator-role]].
