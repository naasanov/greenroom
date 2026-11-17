---
name: flaky-e2e-specs
description: E2E specs known to fail intermittently in CI, and how agents should treat a failure in them
type: project
applies-to: apps/e2e/**, apps/web/src/components/files/**, apps/web/src/components/media/**
---

Known flaky in CI (seen in factory builds 2026-11-11 and 2026-11-12, both passing on rerun with unrelated diffs):
- `apps/e2e/tests/files-import.spec.ts`, desktop project: Drive import. Root cause fixed 2026-11-17 (#73): the gigs-root step renders only after the Drive link POST succeeds, so specs wait for the "Where do your gigs go?" heading before reading `driveStatus`; reading the API state right after the click raced. Seen again 2026-11-17.
- `apps/e2e/tests/setlist-gig.spec.ts` "a row can be reordered by dragging its handle" (desktop): the pointer drag intermittently drops the row in the wrong place (seen 2026-11-17 on #87 and #84, passed on rerun). Not fixed yet.
- `apps/e2e/tests/media-upload.spec.ts` wake lock test, mobile project: the tray tile leaves as soon as the upload reaches the gallery, so asserting `data-status=done` raced; now asserts the tile is gone and the file is in the gallery (fixed 2026-11-15, seen again 2026-11-15 on #77).

**Why:** a one-line CSS change failed CI twice on these, which cost two fix attempts on a correct diff.
**How to apply:** when a spec reads API state right after a UI click, first wait for the UI signal produced by that mutation's success. If only these specs fail and the diff does not touch their area, rerun the failed jobs once (`gh run rerun <id> --failed`) before treating it as a real failure; do not count that as a fix attempt. Never add retries, skips or weaker assertions to make them pass inside an unrelated unit. A structural fix is tracked as a `[factory]` issue.
