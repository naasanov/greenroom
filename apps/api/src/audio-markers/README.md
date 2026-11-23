# Audio markers

Band-shared markers on Drive audio files. Types and Zod schemas: `packages/shared/src/audio.ts`. All routes use `@BandMember()`; any member can edit or delete any marker.

| Route                                         | Purpose                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `GET /bands/:bandId/files/items/:fileId/markers`  | Markers of the file, ordered by `positionMs` then `createdAt`.                                       |
| `POST /bands/:bandId/files/items/:fileId/markers` | `{ positionMs, title }`. The file must be reachable in the band's Drive and `audio/*` (else 400); at most 200 markers per file (else 400). 201. |
| `PATCH /bands/:bandId/audio-markers/:markerId`    | Partial `{ positionMs, title }`, at least one field.                                                 |
| `DELETE /bands/:bandId/audio-markers/:markerId`   | 204.                                                                                                 |

Marker ids are uuids; a malformed id or a marker of another band is 404. `createdBy` joins `users.display_name` and is `null` when the creator was deleted.
