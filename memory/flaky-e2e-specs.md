---
name: flaky-e2e-specs
description: E2E specs known to fail intermittently in CI, and how agents should treat a failure in them
type: project
applies-to: apps/e2e/**, apps/web/src/components/files/**, apps/web/src/components/media/**, apps/web/src/components/events/**
---

Known flaky in CI (seen in factory builds 2026-11-11 and 2026-11-12, both passing on rerun with unrelated diffs):
- `apps/e2e/tests/files-import.spec.ts`, desktop project: Drive import.
- `apps/e2e/tests/agenda-drawer.spec.ts` "tapping another card while a drawer is open hands off to it", mobile project: fixed 2026-11-20 by dropping the transient `data-exiting` count assertion; the spec now asserts only the settled hand-off state. Do not reintroduce a check on the exit window, it is too brief to observe reliably. Seen 2026-11-18 on #98 and 2026-11-19 on #99.
- `apps/e2e/tests/media-upload.spec.ts` wake lock test, mobile project: the tray tile leaves as soon as the upload reaches the gallery, so asserting `data-status=done` raced; now asserts the tile is gone and the file is in the gallery (fixed 2026-11-15, seen again 2026-11-15 on #77). Seen again: 2026-11-20, #128 (upload tile `exif-6.jpg` never reached `done` on mobile; passed after the next push).

**Why:** a one-line CSS change failed CI twice on these, which cost two fix attempts on a correct diff.
**How to apply:** if only these specs fail and the diff does not touch their area, rerun the failed jobs once (`gh run rerun <id> --failed`) before treating it as a real failure; do not count that as a fix attempt. Never add retries, skips or weaker assertions to make them pass inside an unrelated unit. A structural fix is tracked as a `[factory]` issue.
