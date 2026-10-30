# Media

Google Drive structure, gig media metadata, the Drive changes poller, and profile photos. Credentials come from `google-connect` (`GoogleLinksService.getAccessToken(bandId, "drive")`); Drive calls go through the `GOOGLE_DRIVE` adapter (fake in `INTEGRATIONS_MODE=fake`). Everything is referenced by Drive file id, never by path or name.

## Structure
- `drive-structure.service.ts`: root folder setup, `Gigs` / `Profile photos` pointers (`bands.drive_*`), lazy gig folders (`YY-MM-DD <title>`, e.g. `26-10-30 Club night`; created on first media touch, never renamed with the gig). New gigs get no default subfolders.
- `media.service.ts`: gig media read, folder CRUD, item rename/move/trash, song links, thumbnail/content lookup.
- `drive-poller.service.ts`: changes poller (pg-boss queue `drive-changes-poll`, cron every minute, singleton policy).
- `profile-photos.service.ts`: band photo, plus the user's single profile photo (stored in `user_photos`, mirrored best effort into every linked band's `Profile photos` folder).
- `uploads.service.ts` / `uploads.controller.ts`: server-brokered resumable uploads (below). `media-zip.service.ts`: streamed zip downloads. Public upload links (6.3) reuse `UploadsService.create(actor, input, limits)`.

## Endpoints
All need a session and band membership (non-members 404) unless noted. Drive not linked or no folder chosen is `409 { code: "GOOGLE_NOT_LINKED" }` on write routes.

| Route | Notes |
| --- | --- |
| `GET /bands/:id/integrations/google/drive/status` | `DriveStatus`. `folderName` is read live from Drive (null when unset or unreadable), so Drive-side renames show up. |
| `POST /bands/:id/integrations/google/drive/folder` `{ folderId }` | Any member. 422 `DRIVE_NOT_A_FOLDER` for a missing, trashed, or non-folder id. Reuses `Gigs` / `Profile photos` children by name else creates them; starts the changes cursor on a fresh link. Picking another folder only replaces the pointers: existing gig folders and files stay where they are, and gigs keep their `drive_folder_id`. Returns `DriveStatus`. |
| `POST /bands/:id/integrations/google/drive/folders` `{ name }` | Any member. Creates a folder named `name` (1 to 200 chars) in My Drive root through the Drive adapter, then sets it as the band folder exactly like `POST .../drive/folder`. 409 `GOOGLE_NOT_LINKED`. Returns `DriveStatus`. |
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
| `GET /bands/:id/media/:itemId/content[?download=1]` | Streams the file. `attachment` with `download=1` or for types unsafe to render inline (html, svg, ...); `Cache-Control: private, max-age=60`. Honors a single `Range: bytes=a-b`, `a-` or `-n` with `206` + `Content-Range`; `Accept-Ranges: bytes` always; `416` with `Content-Range: bytes */size` past the end. |
| `GET /bands/:id/media/zip?ids=a,b,c` | Members. 1 to 200 ids, all non-trashed items of this band (else 422). Streams a stored zip named `<gig title> media.zip` (one gig) or `Greenroom media.zip`; duplicate names get ` (2)` suffixes; files gone from Drive are skipped and listed in `missing.txt`. |
| `PUT /bands/:id/photo` | Band admins. Multipart `photo`, image/* (not svg), max 10 MB (413 above, 422 wrong type, 400 missing). Uploads to `Profile photos`, trashes the previous file, sets `photo_drive_file_id` and `bands.photo_url` = `${API_PUBLIC_URL}/bands/<id>/photo?v=<fileId>`. Returns `{ photoUrl }`. |
| `DELETE /bands/:id/photo` | Admins. 204; trashes the file and clears the fields. |
| `GET /bands/:id/photo` | PUBLIC, long immutable cache, 404 when none or Drive unavailable. |
| `PUT /users/me/photo` | Any signed-in user. Same upload rules. Stores the one profile photo in `user_photos` (works with no Drive), sets `users.avatar_url` = `${API_PUBLIC_URL}/users/<id>/photo?v=<ts>`, then for each band the user belongs to with Drive set up uploads a copy to `Profile photos`, trashes the previous copy, and records it in `memberships.photo_drive_file_id`. Per band failures are logged and never fail the request. Returns `{ photoUrl }`. |
| `DELETE /users/me/photo` | 204; clears `avatar_url`, deletes the stored photo, and trashes the Drive copies. |
| `GET /users/:userId/photo` | Signed-in users (`me` allowed), 404 when none. |
| `GET /bands/:id/members/:userId/photo` | Band members only. Serves the Drive copy of a member photo, 404 when none. Members lists no longer carry a separate `photoUrl`; use `avatarUrl`. |

## Poller rules
Per band with Drive linked and a cursor (skipped on a revoked link), inside one transaction guarded by a per-band advisory lock: `getChanges`, apply, advance the cursor. Scheduled passes skip a locked band; manual passes wait.
- New file whose parent is a gig folder: Unsorted item; parent is a known subfolder: item in that folder (`uploaded_by_user_id` null). Other files are ignored.
- New folder directly under a gig folder: a `media_folders` row. Subfolder renames update the row. Subfolders moved out, trashed, or deleted drop the row (items: removed, trashed, or missing respectively).
- Rename: updates the name and sets `name_customized`. Move among the gig's folders: updates `folder_id`. Move out of the gig's folders: soft delete (`deleted_at`). Trash: `trashed_at`. Permanent delete: `missing = true`. Un-trashing or moving back restores the item.
- Idempotent: items upsert on `(band_id, drive_file_id)`, folders on `drive_folder_id`.

## Fake-only routes
`/__test__/media/*` exist only when `testingEnabled()`: `GET files`, `GET files/:id/content`, `POST external` (`{ action: add|folder|rename|move|trash|delete, fileId?, parentId?, name?, content?, mimeType? }`), `POST poll` (one synchronous pass, returns per-band results). Plus `GET .../drive/fake-picker` above.

## Uploads
Browser sends chunks to the API, the API relays them to a Drive resumable session; the DB (`upload_sessions`) only tracks pointers and progress. Sessions are owned by the creating user (or link); other members get 404.

| Route | Notes |
| --- | --- |
| `POST /bands/:id/gigs/:gigId/uploads` `{ fileName, mimeType, totalBytes, fingerprint, folderId: uuid\|null, songId?: uuid\|null }` | Returns `UploadSession` (200). Members: image/*, video/*, audio/*, application/pdf only (422 `UPLOAD_TYPE_NOT_ALLOWED`), max 10 GB (422 `UPLOAD_TOO_LARGE`). 409 `GOOGLE_NOT_LINKED`. 422 for a folder of another gig or unknown song. |
| `PUT /bands/:id/uploads/:sessionId` | Raw `application/octet-stream` body (max 9 MB) with `Content-Range: bytes start-end/total` (inclusive). Returns `UploadSession` (`status: "uploading"` with `bytesReceived`, or `"complete"` with `item`). |
| `GET /bands/:id/uploads/:sessionId` | `UploadSession`. |
| `PATCH /bands/:id/uploads/:sessionId` `{ folderId?, fileName?, songId? }` | At least one field. `fileName` sets `name_customized`. After completion the change goes to the media item (move / rename / song link). |
| `PATCH /bands/:id/uploads` `{ ids, folderId?, songId? }` | Bulk version for the tray pickers; returns `UploadSession[]`; 404 if any id is not yours. |
| `DELETE /bands/:id/uploads/:sessionId` | Cancels (returns the session with `status: "cancelled"`); 409 `UPLOAD_NOT_ACTIVE` when already complete. The Drive session is dropped locally and left to expire. |
| `GET /bands/:id/gigs/:gigId/uploads?mine=1` | The caller's sessions from the last 7 days, not cancelled, newest first. |

`UploadSession { id, gigId, status: pending|uploading|complete|failed|cancelled, bytesReceived, totalBytes, chunkSize (8 MiB), fileName, mimeType, fingerprint, folderId, songId, createdAt, item: MediaItem | null }`.

- Chunks: every chunk except the last must be a multiple of 256 KiB (else 422 `UPLOAD_BAD_CHUNK`, as is a body length or total that disagrees with the header). Send `chunkSize` bytes at a time starting at `bytesReceived`. Concurrent chunks for one session are serialised in-process.
- `409 { code: "UPLOAD_OFFSET_MISMATCH", bytesReceived }`: the start offset is not what Drive holds (or the Drive session expired, then `bytesReceived` is 0 and a fresh Drive session was started). Seek to `bytesReceived` and continue.
- `502 { code: "UPLOAD_DRIVE_ERROR", bytesReceived }`: Drive failed mid-chunk; `bytesReceived` is re-read from Drive. Resume from it.
- Resume / skip: `POST` with the same gig + fingerprint (same user) returns the existing session. Complete (and the item still live): `status: "complete"` with `item` (skip). Incomplete: the offset is re-read from Drive; a gone session is restarted at 0. Cancelled sessions, or ones whose item was trashed or deleted, start fresh. The existing session keeps its edited folder / name / song.
- Edits while uploading are stored on the session and applied at completion: the file is moved in Drive if the folder changed since the Drive session started, renamed to the session's `fileName`, the media item is created with `name_customized`, then the song link runs `MediaService.linkSong` (song-title rename unless customized).
- Stale cleanup: pg-boss queue `upload-sessions-cleanup`, daily, marks `pending` / `uploading` sessions untouched for 7 days as `failed`.
- Fake-only: `/__test__/media/uploads/:sessionId/{interrupt,expire,age}` and `/__test__/media/uploads/cleanup`.

## Public upload links

A band member can create one link per gig (`POST /bands/:b/gigs/:g/upload-links`, `?new=1` forces another; `GET` lists recent ones; `DELETE /bands/:b/upload-links/:id` revokes, any member). The URL is `${WEB_URL}/u/<token>`; the token is 32 random bytes as base64url, stored in `public_upload_links.token` (plain, so the admin UI can show the link again). Creating needs Drive set up (409 `GOOGLE_NOT_LINKED` otherwise).

Public routes (`@Public()`, no session, no cookies needed), all keyed by the token:

| Route | Notes |
| --- | --- |
| `GET /public/upload-links/:token` | `{ bandName, bandPhotoUrl, gigTitle, gigDate, expiresAt, maxFileBytes, allowedMimePrefixes }` and nothing else. |
| `POST .../uploads` | `{ fileName, mimeType, totalBytes, fingerprint, uploaderName? }`. Same create/resume/skip protocol as members. Returns only `{ id, status, bytesReceived, totalBytes, chunkSize, fileName }`. |
| `PUT .../uploads/:sessionId` | `Content-Range` chunk, same 409 `UPLOAD_OFFSET_MISMATCH` / 502 `UPLOAD_DRIVE_ERROR` behaviour. |
| `DELETE .../uploads/:sessionId` | Cancels. |

Unknown, revoked, and expired tokens all return 404 `{ code: "UPLOAD_LINK_INVALID", reason: "unknown" | "revoked" | "expired" }`. A session created through a link is only visible through that same link (owner is `uploaded_via_link_id`); member routes never see it.

Hardening:
- Files always land in the gig's Unsorted (`unsortedOnly`), tagged with `uploaded_via_link_id`; the optional uploader name is stored on `upload_sessions.uploader_name`.
- Expiry: 1, 7 (default), or 30 days after the gig date, ending at 00:00 UTC of the following day. A link made after the gig counts from today instead.
- Type allowlist: `image/` and `video/` prefixes (422 `UPLOAD_TYPE_NOT_ALLOWED`). Per-file cap 4 GB (422 `UPLOAD_TOO_LARGE`). Per-link total 50 GB across non-failed, non-cancelled sessions (422 `UPLOAD_LINK_FULL`); re-sending a counted fingerprint resumes instead of adding bytes.
- Rate limits (429), on session creation only: 200 files per hour per link (`UPLOAD_LINK_FILES_PER_HOUR`), 60 per hour per IP (`UPLOAD_LINK_FILES_PER_IP_HOUR`). Every public request is also capped at 1500 per minute per IP (`UPLOAD_LINK_REQUESTS_PER_MINUTE`). Counters are in memory per API process. With fakes enabled, an `x-test-ip` header overrides the IP so specs get their own bucket.
- Revoking sets `revoked_at`; further requests fail immediately, including chunks of in-flight uploads.

Follow-ups, not built: CAPTCHA on session creation, virus/malware scanning of uploaded files, hashing the token at rest (needs the admin UI to stop re-showing the URL), and showing members who uploaded what (the data is on `upload_sessions.uploader_name`).
