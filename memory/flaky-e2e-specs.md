---
name: flaky-e2e-specs
description: E2E specs known to fail intermittently in CI, and how agents should treat a failure in them
type: project
applies-to: apps/e2e/**, apps/web/src/components/files/**, apps/web/src/components/media/**, apps/web/src/components/events/**
---

Quarantined in CI (#137): the tests listed in `apps/e2e/quarantine.json` are excluded from the blocking `e2e (...)` shard jobs and run in the non-blocking `e2e quarantine (desktop|mobile)` jobs (`continue-on-error`, one retry, report artifact `playwright-quarantine-report-<project>`). A red quarantine check is not a merge blocker and is not a fix attempt. Remove an entry from the JSON once its cause is fixed and the quarantine check has been green on several runs.
- `setlist-gig.spec.ts` "a row can be reordered by dragging its handle" (desktop): the pointer drag intermittently drops the row in the wrong place (seen 2026-11-17 on #87 and #84). Cause unknown, still quarantined.
- `media-upload.spec.ts` wake lock and EXIF tests (mobile only): the tray tile leaves as soon as the file reaches the gallery, so asserting `data-status=done` raced (#77, #128). The EXIF test now waits on the stored bytes and the tile leaving; both stay quarantined on mobile until that is confirmed green in WebKit. Desktop runs them in the blocking job.
- `agenda-drawer.spec.ts` "tapping another card while a drawer is open hands off to it" (mobile only): the transient `data-exiting` assertion was dropped on 2026-11-20 (#127); it stays quarantined until confirmed in WebKit. Do not reintroduce a check on the exit window.
- `files-import.spec.ts` gigs root step, 4 tests (desktop only): the specs already wait for the "Where do your gigs go?" heading before reading `driveStatus` (#73), yet the step flaked again (2026-11-11, 2026-11-12, 2026-11-17). Remaining cause unknown, still quarantined.

**Why:** a one-line CSS change failed CI twice on these, which cost two fix attempts on a correct diff.
**How to apply:** when a spec reads API state right after a UI click, first wait for the UI signal produced by that mutation's success. A failure in the blocking jobs is real: rerun once only if the failing spec is not in `quarantine.json` and the diff does not touch its area. Quarantined specs report in the `e2e quarantine` check only. To promote one, remove it from `apps/e2e/quarantine.json` once green on several runs. Never add retries, skips or weaker assertions to make them pass inside an unrelated unit. A structural fix is tracked as a `[factory]` issue.
