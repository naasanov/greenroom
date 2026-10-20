# Songs (Music Library)

All routes are under `/bands/:bandId/songs` and use `@BandMember()` (non-members get 404). Every member can do everything; nothing in the design is admin-only. Shared types and Zod schemas: `packages/shared/src/songs.ts`.

| Route | Purpose |
| --- | --- |
| `GET /` | List. Query `q` (title/artist, case-insensitive) and `sort`: `recent` (default), `title`, `artist`, `lastPlayed`, `mostPlayed`. |
| `POST /` | Create. 201 with the song detail plus `suggestedReference`. 409 on duplicates unless `force: true`. |
| `GET /:songId` | Detail: `references` (ordered by position), `setlistCount`, `lastPlayedDate`, `usedIn`. |
| `PATCH /:songId` | Partial update. `references`, when present, replaces all rows in the given order (`[]` clears). |
| `DELETE /:songId` | Soft delete. Returns `{ id, setlistCount }` so the UI can say "This is in 3 setlists". Detail already carries `setlistCount` for the warning before delete. |
| `POST /resolve` | Smart add: `{ input }` returns `{ kind, candidates }`. |
| `POST /suggest-tab` | `{ title, artist? }` returns `{ suggestedReference }` (for showing the Songsterr suggestion before saving). |
| `POST /import` | Start a Spotify playlist import. 202 with progress. 404 `PLAYLIST_NOT_FOUND_OR_PRIVATE` if not visible with app credentials; 400 if not a playlist link. |
| `GET /imports/:importId` | Poll `{ status, total, done, added, skipped, failed, playlistName, error }`. |

## Smart add
`kind` is `spotify-link`, `youtube-link`, `search`, or `playlist` (the UI should switch to the import flow). A link yields at most one candidate, prefilled with title, artist, duration (Spotify only), image, `spotifyTrackId` / `youtubeUrl`, and a `references` row for the source link. Free text searches Spotify (app credentials, 10 results). Unknown links, unknown ids, and no-match searches return `candidates: []` so the UI can offer manual entry. Each candidate has `existingSongId` when it is already in the library.

## Duplicates
A new song is a duplicate when a non-deleted song in the same band has the same `spotifyTrackId`, or the same normalized title + artist (lowercase, accents and punctuation stripped, missing artist equals empty). The 409 body is `{ code: "DUPLICATE_SONG", songId, message }`. `force: true` skips the check ("add anyway"). Updates are not checked. Playlist imports skip duplicates silently and count them as `skipped`, including repeats inside the playlist.

## Songsterr
`POST /` looks up a tab by title and artist and returns it as `suggestedReference` (`{ label: "Songsterr", value: url }`). It is never saved automatically; the client appends it to `references` on the next save. It is `null` when nothing matches, the lookup fails, or the song already has a Songsterr row.

## Sorts and "played"
`mostPlayed` is the number of distinct setlists containing the song (gig and practice setlists both count). `lastPlayed` is the latest non-deleted gig on or before today whose setlist has the song (practices and future gigs are ignored). Ties and missing values fall back to title A-Z; songs never played sort last.

## Used in
`usedIn` lists gigs (`kind: "gig"`, newest first) and practice series assignments (`kind: "practice"`) whose setlist contains the song. Soft-deleting a song keeps its `setlist_items` rows; setlist readers must filter `songs.deleted_at is null`.

## Playlist import flow
1. `POST /import` parses the link, fetches the playlist once (so private/missing fails fast with 404), generates an `importId`, and enqueues a pg-boss job (`songs-playlist-import`, no retries) whose id is the `importId`.
2. The worker refetches the playlist, then inserts tracks one by one (song plus a `Spotify` reference row), updating counters in memory.
3. `GET /imports/:importId` returns the live counters. After a restart (or on another instance) it falls back to the pg-boss job: the final summary is the job output, so completed imports stay readable; in-flight counters are not persisted.
Status is `queued`, `running`, `completed`, or `failed`. Per-track insert errors count as `failed` and do not stop the import.
