---
name: folder-link-provenance
description: drive_file_song_links.source_folder_id marks auto-added folder links (null means hand-made); upserts, backfill and poller must respect it
type: project
applies-to: apps/api/src/files/**, apps/api/src/media/**, packages/db/src/schema/media.ts
---

`drive_file_song_links.source_folder_id` is null for hand-made links and holds the Drive folder id for links auto-added by a folder link (migration 0024, #145). Rules:

- Any upsert that represents a hand link must set `source_folder_id` to null on conflict, so a manual link takes over an auto link (otherwise unlinking the folder removes it).
- The folder backfill and poller upserts must keep the `source_folder_id IS NOT NULL` guard so they never overwrite a manual link.
- The backfill insert is chunked at 500 rows (Postgres 65,535 bind parameter limit).
- `setSongs` for a folder takes the same per-band `drive-poll` advisory lock as the poller (helpers in `apps/api/src/media/folder-song-links.ts`) before listing children.

**Why:** found in review of #145 on 2026-11-24.

**How to apply:** read these rules before touching link upserts or the poller `apply()`.
