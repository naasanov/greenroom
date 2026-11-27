---
name: migration-journal-collisions
description: Parallel branches claim the same migration number and conflict in meta/_journal.json; rebuild the journal in ascending when order and never rename an applied migration
type: feedback
applies-to: packages/db/migrations/**
---

Parallel factory branches each generate the next migration number from the same base, so three open PRs (#157, #160, #161) all claimed 0024 or 0025, and the `meta/_journal.json` and snapshot files conflict when they are merged into a staging preview. Drizzle applies migrations whose journal `when` is greater than the last applied row's `created_at`, so the merged journal must list entries in ascending `when` order (idx contiguous), and a migration already applied to an environment must never be renamed or regenerated.

Resolve a preview merge by rebuilding the journal entries from `origin/main` plus each branch's entries in `when` order, keeping each branch's SQL file as is (snapshots are only used by `drizzle-kit generate`).

**Why:** hit in the staging preview of 2026-11-24.

**How to apply:** when a unit adds a migration while other open PRs also do, say in the report which one must renumber on its merge to main (the second one to merge regenerates its journal entry and snapshot after rebasing), and never reuse a staging-applied migration's tag.

Seen again: 2026-11-26, #167 and #168 (stacked on #161 with 145, 148, 107 staged): the preview merge conflicted again in the journal, a snapshot and `file-viewer.tsx`, and was rebuilt by hand. `0024_audio_markers` carries a `when` older than the already applied 0025, so a database that has applied 0025 never runs it; give it a later `when` before it merges. Escalated in a `[factory]` issue.

Seen again: 2026-11-27, #145: the local test DB had applied a later migration (0026), so #145's `0024_song_folder_auto_links` (older `when`) never ran locally and every song-files API call returned 500 on a missing column. Reset the local test DB (`DROP SCHEMA drizzle, public` on greenroom_test, localhost only) after switching between branches that carry different migrations. Structural fix landed 2026-11-27: the `Check migration journal against base branch` CI step (`scripts/check-migration-journal.mjs`) and the factory `staging-preview` helper that renumbers colliding migrations in the preview.
