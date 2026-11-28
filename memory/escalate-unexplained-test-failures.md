---
name: escalate-unexplained-test-failures
description: When a Sonnet build agent cannot find the cause of a failing or flaky test, escalate the unit to an Opus agent instead of quarantining the test
type: feedback
applies-to: apps/e2e/**
---

Owner instruction (2026-11-25, #137): quarantine is not the answer to a failure nobody can explain.

**Why:** a quarantined spec stops guarding its area, and the cause stays unknown.

**How to apply:** if an implementer or fix attempt cannot determine why a spec fails or flakes, spawn an Opus agent (`model: opus`) on the failing spec with the logs and the diff rather than adding it to `apps/e2e/quarantine.json`. See [[flaky-e2e-specs]].
