---
name: commit-cadence
description: Orchestrator commits periodically on its own at validated checkpoints; subagents never commit
type: feedback
---

In this repo the orchestrator commits without being asked, at sensible checkpoints: after a wave or task has been validated (build, typecheck, lint, tests rerun by the orchestrator), and after doc/memory updates. Subagents never commit. Branching and pushing still need the user to ask.

**Why:** the user said on 2026-10-19 "You should commit periodically without me telling you." This overrides the general "don't commit unless asked" default for this repo only.

**How to apply:** commit after each validated unit of work with a plain descriptive message (no AI attribution, no co-author trailer). Never commit unvalidated subagent output. Related: [[orchestrator-role]].
