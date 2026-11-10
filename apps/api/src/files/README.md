# Files

Drive-style browse and management of the band's Files root (`bands.drive_root_folder_id`), song links for any Drive file or folder, and linking an existing folder to a gig. Drive is browsed live through `DriveStructureService.context()` and the `GOOGLE_DRIVE` adapter; the DB stores only `drive_file_song_links` and the gig pointers.

Every route is `@BandMember()` (any member, non-members 404). Drive not linked or no folder chosen is `409 GOOGLE_NOT_LINKED`. A Drive id that is missing, trashed, or not the Files root or a descendant of it is `404` on every `files` route (checked by walking parents up to the root, memoized per request).

## Routes

| Route                                                          | Notes                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /bands/:id/files/folder[/:folderId]`                      | `FilesFolderListing`. Omitted id or `root` is the Files root. Folders first, then files, case-insensitive by name; capped at 1000 entries (`truncated`). Entries carry `gig` (non-deleted gig whose `drive_folder_id` is that folder), `isGigsRoot`, and `songLinks`.                                                     |
| `POST /bands/:id/files/folders` `{ parentId, name }`           | Creates a folder (`parentId` may be `root`). 201 `FileEntry`.                                                                                                                                                                                                                                                             |
| `PATCH /bands/:id/files/items/:fileId` `{ name }`              | Renames in Drive. Gig folders and the gigs root can be renamed; the Files root is `409 FILES_ROOT_PROTECTED`.                                                                                                                                                                                                             |
| `POST /bands/:id/files/items/trash` `{ ids }`                  | Drive trash, all or nothing. `{ trashed }`. `409 FILES_GIG_FOLDER_PROTECTED` when any id is the Files root, the gigs root, a gig folder, or a folder containing one. Media rows follow through the changes poller.                                                                                                        |
| `GET .../files/items/:fileId/thumbnail`                        | Same streaming rules as the gig media routes. Folders 404.                                                                                                                                                                                                                                                                |
| `GET .../files/items/:fileId/content[?download=1]`             | Same range, disposition, and cache rules as gig media (`media-util.ts` helpers). Google-native docs have no byte content and 404.                                                                                                                                                                                         |
| `PUT .../files/items/:fileId/songs` `{ songIds }`              | Replaces the complete song set for the file or folder (max 100). 422 for unknown, deleted, or other-band songs. Returns `{ songLinks }`.                                                                                                                                                                                  |
| `GET /bands/:id/songs/:songId/files`                           | `SongFile[]`, oldest link first. `available: false` when the file is trashed, gone, or outside the Files root; the link row is never deleted by this check. Name and mime snapshots refresh from Drive. Deleting a song cascades its links.                                                                               |
| `DELETE /bands/:id/songs/:songId/files/:fileId`                | 204. Deletes that song's link to the Drive file id; no Drive call, so trashed or missing files unlink too. 404 for an unknown song or no such link.                                                                                                                                                                       |
| `POST /bands/:id/gigs/:gigId/media/link-folder` `{ folderId }` | Attaches a Drive folder as the gig's folder and returns `GigMedia`. Files directly in it become Unsorted items, subfolders become `media_folders` rows with their files as items (uploaded_by null, idempotent on band + drive file id, same upsert as the poller in `media/media-ingest.ts`). Deeper levels are ignored. |

Uploads into any Files folder use the shared resumable pipeline in `media/` (`UploadsService.createInFolder`):

| Route                                                                                       | Notes                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /bands/:id/files/uploads` `{ fileName, mimeType, totalBytes, fingerprint, folderId }` | `folderId` is a Drive folder id or `root`. Returns an `UploadSession` with `gigId: null`; chunks go to `PUT /bands/:id/uploads/:sessionId`. Completion returns `file` and no media item. Details in `media/README.md`. |
| `GET /bands/:id/files/uploads?mine=1`                                                       | The caller's Files uploads from the last 7 days.                                                                                                                                                                       |

Drive-controller additions (`media/`):

- `POST /bands/:id/integrations/google/drive/gigs-folder` `{ folderId } | { create: true, name? }`: sets `bands.drive_gigs_folder_id` and returns `DriveStatus`. Existing gig folders stay where they are.
- `POST .../drive/folder` accepts optional `gigsFolderId` (must be inside the chosen folder); omitted keeps reuse or create of `Gigs`.

## Errors

| Status / code                     | When                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 404                               | Files route: file not under the Files root, trashed, or missing.                                                                                               |
| 409 `FILES_GIG_FOLDER_PROTECTED`  | Trash of the Files root, gigs root, a gig folder, or a folder containing one.                                                                                  |
| 409 `FILES_ROOT_PROTECTED`        | Rename of the Files root.                                                                                                                                      |
| 409 `GIG_ALREADY_HAS_FOLDER`      | link-folder on a gig with `drive_folder_id`.                                                                                                                   |
| 409 `FILES_FOLDER_ALREADY_LINKED` | link-folder target is another non-deleted gig's folder.                                                                                                        |
| 422 `FILES_USE_GIG_MEDIA`         | Files upload targets a gig folder or a folder beneath one, or PATCHes folder/song on a Files upload.                                                           |
| 422 `FILES_OUTSIDE_ROOT`          | gigs-folder, link-folder, or `gigsFolderId` target is not a live descendant of the Files root (or is the root itself; link-folder also refuses the gigs root). |
| 422 `DRIVE_NOT_A_FOLDER`          | Target exists inside the root but is a file.                                                                                                                   |

## Tests

`apps/e2e/tests/api-files.spec.ts` drives the fake Drive with the existing `/__test__/media/external` actions (`folder` with `parentId` builds nested trees). `api-files-uploads.spec.ts` covers Files uploads. The fake adapter also records its calls (`GET /__test__/media/calls`) and honors `FAKE_DRIVE_LATENCY_MS`.

## Ancestry cache

`DriveAncestryCache` (60s TTL) holds verified folder chains up to the Files root, so a listing skips the per-ancestor `getFile` walk. Listed child folders are cached as verified, and the GOOGLE_DRIVE adapter is wrapped to clear the cache after createFolder, rename, move, and trash. Edits made directly in Drive show up when the TTL lapses. The folder listing runs concurrently with the authorization walk and is discarded if the walk fails.
