---
name: status-updates-immediate
description: Update docs/execution-plan.md statuses and push the moment work starts, lands, gets blocked, or a gate changes; the /status page reads it from GitHub main
type: feedback
---

Whenever a task or gate changes state (agent launched, wave validated, blocked, gate awaiting review, feedback received, approved), edit the Status line in `docs/execution-plan.md` and commit + push that docs change right away, before doing anything else. Do not batch status updates with later code commits. Staging's `/status` page renders the plan straight from `raw.githubusercontent.com/.../main/docs/execution-plan.md`, so an unpushed status is an invisible status.

**Why:** the user said on 2026-10-20 that usage limits can end a session at any moment and they don't want the status page left stale.

**How to apply:** docs-only commits are fine and expected; stage only the docs files (agents may have uncommitted code in the tree). Keep status text specific (what's running, what's waiting on the user). Related: [[commit-cadence]], [[orchestrator-role]].
