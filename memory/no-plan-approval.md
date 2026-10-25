---
name: no-plan-approval
description: Never present a plan for approval (no plan mode, no ExitPlanMode); design internally and start delegating right away
type: feedback
---

Do not enter plan mode or present a plan for the user to approve, even for multi-wave features where the `opus-delegate` skill suggests plan mode. Work out the waves internally and launch the agents. Genuine product questions the design doc can't answer still go to the user.

**Why:** the user said on 2026-10-25, after approving a Phase 4 plan: "never give me a plan. just do."

**How to apply:** use the skill's chat-mode flow for everything: converge, delegate, validate. Record product decisions in `docs/design.md` as usual. Related: [[orchestrator-role]].
