---
name: batch-pushes
description: CI cancels in-progress runs on each push to main, so batch commits into one push instead of pushing every few minutes
type: feedback
---

Batch validated commits and push them together, rather than pushing each small commit minutes apart. Docs-only pushes (docs/, memory/, *.md) skip CI and are fine to push anytime.

**Why:** CI uses `cancel-in-progress`, so each code push restarts the run; on 2026-10-22 several pushes in a row delayed the staging deploy the user was waiting on by 15+ minutes and the user asked why CI was so slow.

**How to apply:** when several agents land close together, commit each separately but push once after the last one is validated. See [[commit-cadence]].
