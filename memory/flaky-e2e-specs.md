---
name: flaky-e2e-specs
description: E2E specs known to fail intermittently in CI, and how agents should treat a failure in them
type: project
applies-to: apps/e2e/**, apps/web/src/components/files/**, apps/web/src/components/media/**
---

Known flaky in CI (seen in factory builds 2026-11-11 and 2026-11-12, both passing on rerun with unrelated diffs):
- `apps/e2e/tests/files-import.spec.ts`, desktop project: Drive import.
- `apps/e2e/tests/media-upload.spec.ts` around line 374, mobile project: wake lock.

**Why:** a one-line CSS change failed CI twice on these, which cost two fix attempts on a correct diff.
**How to apply:** if only these specs fail and the diff does not touch their area, rerun the failed jobs once (`gh run rerun <id> --failed`) before treating it as a real failure; do not count that as a fix attempt. Never add retries, skips or weaker assertions to make them pass inside an unrelated unit. A structural fix is tracked as a `[factory]` issue.
