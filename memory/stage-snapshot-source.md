---
name: stage-snapshot-source
description: Stage mode renders from the offline snapshot, not React Query; mutations and failed fetches must respect that
type: project
applies-to: apps/web/src/components/stage/**, apps/web/src/lib/queries/stage.ts
---

Stage mode reads its data from the per-gig offline snapshot (`use-stage-snapshot.ts`, `offline.ts`, `stage-storage.ts`), not from the React Query cache. A mutation that only updates the query cache does not show in stage, and the snapshot keeps the old value offline. A fetch helper that turns an error into an empty value (`{}`, `[]`) makes the offline sync overwrite stored data with nothing, because the "keep prior" fallback only runs for `undefined`.

**Why:** the chords unit (#95) shipped both bugs to review: "Set as band key" reverted in stage, and a failed chords index request wiped the cached sheets.
**How to apply:** when stage shows data that can change, overlay fresh query data on the snapshot and write it back into the snapshot. Snapshot fetch helpers return `undefined` on failure and an empty value only for a real "none".
