---
name: escalate-unknown-test-failures
description: Owner rule - a Sonnet agent that cannot find why a test fails hands it to an Opus agent
type: feedback
applies-to: all
---
If a sonnet agent can't determine the cause of a failing test, promote it to an opus agent. (Owner, 2026-11-23, #137.)

**Why:** repeated Sonnet fix attempts on failures they cannot explain burn CI rounds and tend to weaken tests instead of fixing causes.

**How to apply:** in briefs, tell implementers to stop and report when they cannot explain a failure; the orchestrator then reruns that investigation with `model: opus` instead of another Sonnet attempt. Related: [[flaky-e2e-specs]].
