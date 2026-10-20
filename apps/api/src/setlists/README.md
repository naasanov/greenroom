# Setlists

All routes are under `/bands/:bandId/...` and use `@BandMember()` (non-members get 404). Every member can do everything. Shared schemas and types: `packages/shared/src/setlists.ts`. A setlist is just an id owned by the band; gigs and practice occurrences point at it.

| Route | Purpose |
| --- | --- |
| `GET /gigs/:gigId/setlist` | The gig's setlist (`gig_setlists` is one per gig), created empty on first access. Returns the setlist plus `gigId`. |
| `GET /setlists/:setlistId` | `items` (title, artist, duration, image), `songCount`, `totalDurationSeconds` (known durations only) and `unknownDurationCount`. |
| `PUT /setlists/:setlistId/items` | `{ songIds }`: replaces the whole order (reorder, add, remove in one call). |
| `POST /setlists/:setlistId/items` | `{ songId }`: append (tap-to-add). |
| `DELETE /setlists/:setlistId/items/:songId` | Remove one song. |
| `POST /setlists/:setlistId/copy` | `{ sourceSetlistId, mode: replace (default) \| append }`: duplicate a past setlist into this one. |
| `GET /setlists/history?q=&limit=` | Past gigs (date today or earlier) whose setlist has songs, newest first; `q` matches title or venue. Each entry has `setlistId` to copy from. |
| `POST /setlists/:setlistId/songs` | Add-song-in-place: body is the songs create body (`force` included); creates the song and appends it. Returns `{ song, setlist }`. 409 `DUPLICATE_SONG` like songs create. |

Practice occurrence setlists are managed through the events routes (`POST|PUT|DELETE /practices/:seriesId/occurrences/:key/setlist`, see `events/README.md`); their items use the routes above.

## Decisions
- A song appears at most once per setlist (the design's "tap a checked song again to remove it"). `PUT items` with repeats is 400 `DUPLICATE_SONG_IN_SETLIST`; append of a song already present, and remove of an absent one, are no-ops.
- Every song id must be a live song of the band, otherwise 400 `SONG_NOT_FOUND` with the offending `songIds`.
- Reads skip soft-deleted songs (their `setlist_items` rows stay) and renumber `position` from 0. A replace drops those hidden rows too.
- Edits run in a transaction holding a row lock on the setlist, so concurrent appends do not collide on position.
- Copy never touches the source; append skips songs already present.
