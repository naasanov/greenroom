# Chords (Ultimate Guitar)

All routes are under `/bands/:bandId/chords` and use `@BandMember()` (non-members get 404). Shared types and Zod schemas: `packages/shared/src/chords.ts`. Errors are `{ code, message }`.

## Feature flag

`CHORDS_BANDS` is read on every request: `*` enables every band, otherwise a comma-separated list of band ids or slugs. Unset or empty means off. A disabled band gets 404 on every route except `GET /`, which returns `{ enabled: false, songIds: [] }`.

| Route                            | Purpose                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /`                          | `{ enabled, songIds }`: non-deleted songs of the band that have a sheet.                                                                                                              |
| `POST /suggest`                  | `{ title, artist? }` returns `{ match, versions }`. Always 200; failures give `{ match: null, versions: [] }`.                                                                        |
| `POST /sheets`                   | `{ songIds }` (max 200) returns `{ sheets }` for this band's non-deleted songs; other ids are ignored.                                                                                |
| `GET /songs/:songId`             | The `SongChordSheet`. 404 `NO_CHORD_SHEET` when none; plain 404 when the song is not in the band or is deleted.                                                                       |
| `POST /songs/:songId/import`     | `{ url }` imports from Ultimate Guitar. 400 `UG_INVALID_LINK`, 422 `UG_OFFICIAL_NOT_SUPPORTED`, 502 `UG_IMPORT_FAILED` (unavailable, unparseable, or no chords found).               |
| `PUT /songs/:songId`             | `{ text }` in the plain-text editor format. Creates a `manual` sheet, or replaces the sheet and sets `editedAt` when the source is Ultimate Guitar. Empty sheet gives 400.            |
| `PUT /songs/:songId/band-transpose` | `{ semitones }` (-11..11) sets the shared band key offset. 404 `NO_CHORD_SHEET` when none.                                                                                        |
| `DELETE /songs/:songId`          | Removes the sheet. 204.                                                                                                                                                              |

## Suggest

The Ultimate Guitar search (`${title} ${artist}`) is cached in `ug_search_cache` for 30 days under the normalized `title|artist` key from `songs/song-match.ts`; failures are never cached. Candidates are public `Chords` results without a marketing type whose normalized title equals the song's (and artist, when both exist). The match is the highest rating among candidates with at least 20 votes, else the one with the most votes. `versions` holds the other candidates, rating descending, at most 10; official results are excluded.

## Import

The page markup is parsed with `parseUgMarkup`, then transposed up by the page capo so the stored sheet is at concert pitch. `key`, `capo` and `tuning` are kept as metadata (`key` is the page's concert key), `importedAt` is set and `editedAt` cleared. Re-importing keeps `bandTranspose`.
