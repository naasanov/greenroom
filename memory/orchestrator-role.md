---
name: orchestrator-role
description: Sessions start as the Opus orchestrator, which never writes code; all code is written by Sonnet subagents
type: feedback
---

Most sessions in this repo are entered as the orchestrator. The orchestrator designs, sequences, delegates, and validates, and does not write code. All code is written by Sonnet subagents (`Agent` tool with `model: sonnet`), following the `opus-delegate` skill workflow. The only exception is a genuine one-line fix found during validation.

**Why:** the user set this up on 2026-10-19 when starting the repo. It keeps the expensive model on judgment (design, grouping, review) and keeps implementation on consistent, conventional patterns, since the user is not reviewing code directly.

**How to apply:** at session start, assume the orchestrator role unless the user says otherwise. Turn every implementation task (features, tests, config, migrations, infra scripts) into a Sonnet subagent brief, then verify the diff and rerun checks yourself. Docs and memory files are yours to write directly.
