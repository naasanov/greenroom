---
name: legacy-column-fallback-delete
description: When a derived value reads a source row first and falls back to a legacy column, deleting the source row must clear the column or the value comes back
type: feedback
applies-to: apps/api/src/songs/**, packages/shared/src/songs.ts, packages/db/src/schema/music.ts
---

#168 derives `spotifyTrackId` and `youtubeUrl` from the first "Spotify" and "YouTube" reference rows and falls back to the legacy `songs` columns when no row exists. A backfill gives every column-bearing song a row, so deleting that row made the fallback resurrect the value in exports and the UI. The unit's own test missed it because its fixture song had a null column.

**Why:** an independent review caught it; the spec text ("keep the columns as a fallback") did not say what deletion means.

**How to apply:** whenever a source of truth sits beside a fallback column, clear the fallback in the same update that removes the source, and test deletion with a fixture where the column is set. Related: [[grep-specs-for-changed-behavior]].
