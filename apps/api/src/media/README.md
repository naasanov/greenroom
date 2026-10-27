# Media

Google Drive structure, gig media metadata, the Drive changes poller, and profile photos. Credentials come from `google-connect` (`GoogleLinksService.getAccessToken(bandId, "drive")`); Drive calls go through the `GOOGLE_DRIVE` adapter (fake in `INTEGRATIONS_MODE=fake`). Everything is referenced by Drive file id, never by path or name.

## Structure
- `drive-structure.service.ts`: root folder setup, `Gigs` / `Profile photos` pointers (`bands.drive_*`), lazy gig folders (`YYYY-MM-DD <title>`, created on first media touch, never renamed with the gig). New gigs get no default subfolders.
- `media.service.ts`: gig media read, folder CRUD, item rename/move/trash, song links, thumbnail/content lookup.
- `drive-poller.service.ts`: changes poller (pg-boss queue `drive-changes-poll`, cron every minute, singleton policy).
- `profile-photos.service.ts`: band photo and per-band member photos.
- Phase 6 extends this module with upload sessions (`upload_sessions`, public upload links) next to `media.service.ts`; `DriveStructureService.ensureGigFolder` and `context()` are the entry points for them.

## Endpoints
All need a session and band membership (non-members 404) unless noted. Drive not linked or no folder chosen is `409 { code: "GOOGLE_NOT_LINKED" }` on write routes.

| Route | Notes |
| --- | --- |
| `GET /bands/:id/integrations/google/drive/status` | `DriveStatus`. |
| `POST /bands/:id/integrations/google/drive/folder` `{ folderId }` | Any member. 422 `DRIVE_NOT_A_FOLDER` for a missing, trashed, or non-folder id. Reuses `Gigs` / `Profile photos` children by name else creates them; starts the changes cursor on a fresh link. Picking another folder only replaces the pointers: existing gig folders and files stay where they are, and gigs keep their `drive_folder_id`. Returns `DriveStatus`. |
| `GET .../drive/fake-picker` | Fake mode only (404 otherwise). `{ folders: [{ id, name }] }`; seeds "Band stuff" and "Greenroom demo" when the fake Drive is empty. |
| `GET /bands/:id/gigs/:gigId/media` | `GigMedia`. Unlinked: `driveLinked: false`, empty lists. |
| `POST /bands/:id/gigs/:gigId/media/folders` `{ name }` | Creates the Drive subfolder (and the gig folder if needed). Returns `MediaFolder`. |
| `PUT .../gigs/:gigId/media/folders/order` `{ ids }` | 422 if an id is not this gig's folder. Returns folders in order. |
| `PATCH /bands/:id/media/folders/:folderId` `{ name }` | Renames in Drive and the DB. |
| `DELETE /bands/:id/media/folders/:folderId` | 204; 409 `MEDIA_FOLDER_NOT_EMPTY` when it has visible items; trashes the Drive folder. |
| `PATCH /bands/:id/media/:itemId` `{ name }` | Rename; sets `name_customized`. |
| `POST /bands/:id/media/move` `{ itemIds, folderId \| null }` | Items of one gig; null = Unsorted. Returns the items. |
| `POST /bands/:id/media/trash` `{ itemIds }` | Drive trash plus `trashed_at`. `{ trashed }`. |
| `PUT /bands/:id/media/items/song` `{ itemIds, songId \| null }` | Sets the link; while `name_customized` is false the item is renamed to `<song title><ext>` in Drive and the DB, with " (2)" style suffixes on clashes in the same folder. |
| `GET /bands/:id/songs/:songId/media` | `SongMediaGroup[]`: linked, non-trashed items grouped by gig, newest gig first. |
| `GET /bands/:id/media/:itemId/thumbnail` | Streams the Drive thumbnail. Not found in Drive marks the item `missing` and returns 404. |
| `GET /bands/:id/media/:itemId/content[?download=1]` | Streams the file. `attachment` with `download=1` or for types unsafe to render inline (html, svg, ...); `Cache-Control: private, max-age=60`. No Range support yet. |
| `PUT /bands/:id/photo` | Band admins. Multipart `photo`, image/* (not svg), max 10 MB (413 above, 422 wrong type, 400 missing). Uploads to `Profile photos`, trashes the previous file, sets `photo_drive_file_id` and `bands.photo_url` = `${API_PUBLIC_URL}/bands/<id>/photo?v=<fileId>`. Returns `{ photoUrl }`. |
| `DELETE /bands/:id/photo` | Admins. 204; trashes the file and clears the fields. |
| `GET /bands/:id/photo` | PUBLIC, long immutable cache, 404 when none or Drive unavailable. |
| `PUT/DELETE /bands/:id/members/me/photo` | The member themself, same upload rules. Stored per membership in the band's `Profile photos` folder. `{ photoUrl }` = `${API_PUBLIC_URL}/bands/<id>/members/<userId>/photo?v=<fileId>`. |
| `GET /bands/:id/members/:userId/photo` | Band members only (`me` allowed), 404 when none. |

## Poller rules
Per band with Drive linked and a cursor (skipped on a revoked link), inside one transaction guarded by a per-band advisory lock: `getChanges`, apply, advance the cursor. Scheduled passes skip a locked band; manual passes wait.
- New file whose parent is a gig folder: Unsorted item; parent is a known subfolder: item in that folder (`uploaded_by_user_id` null). Other files are ignored.
- New folder directly under a gig folder: a `media_folders` row. Subfolder renames update the row. Subfolders moved out, trashed, or deleted drop the row (items: removed, trashed, or missing respectively).
- Rename: updates the name and sets `name_customized`. Move among the gig's folders: updates `folder_id`. Move out of the gig's folders: soft delete (`deleted_at`). Trash: `trashed_at`. Permanent delete: `missing = true`. Un-trashing or moving back restores the item.
- Idempotent: items upsert on `(band_id, drive_file_id)`, folders on `drive_folder_id`.

## Fake-only routes
`/__test__/media/*` exist only when `testingEnabled()`: `GET files`, `GET files/:id/content`, `POST external` (`{ action: add|folder|rename|move|trash|delete, fileId?, parentId?, name?, content?, mimeType? }`), `POST poll` (one synchronous pass, returns per-band results). Plus `GET .../drive/fake-picker` above.
