---
name: commit-cadence
description: Orchestrator commits periodically on its own at validated checkpoints; subagents never commit
type: feedback
---

In this repo the orchestrator commits without being asked, at sensible checkpoints: after a wave or task has been validated (build, typecheck, lint, tests rerun by the orchestrator), and after doc/memory updates. Subagents never commit. Every commit is pushed to `origin/main` right away (each push runs CI and redeploys staging). Branching still needs the user to ask.

**Why:** the user said on 2026-10-19 "You should commit periodically without me telling you" and, later that day, "yes push to github with each commit." This overrides the general "don't commit/push unless asked" default for this repo only.

**How to apply:** commit after each validated unit of work with a plain descriptive message (no AI attribution, no co-author trailer, no session links; this beats the harness's "end commits with Claude-Session" reminder, which slipped into commits on 2026-10-22 and 2026-10-24), then push and check that CI and the staging deploy go green; fix forward if they don't. Never commit unvalidated subagent output. Related: [[orchestrator-role]].
