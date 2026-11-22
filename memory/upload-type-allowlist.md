---
name: upload-type-allowlist
description: Upload type exceptions must still go through the per-link allow callback, never bypass it
type: feedback
applies-to: apps/api/src/media/uploads.service.ts, apps/api/src/media/public-links.service.ts
---
`UploadsService.create` receives an `allow(mime)` callback: members use `memberUploadTypeAllowed`, public upload links restrict by `allowedMimePrefixes`. A special case for a file kind (HEIC with an empty or octet-stream type) must normalize the type and still ask `allow`, for example `allow(mime) || (isHeic(...) && allow(heicMime(...)))`, so a link limited to `video/` still rejects images.
**Why:** the first HEIC change accepted any HEIC regardless of `allow`, which bypassed link restrictions (caught in review of #85).
**How to apply:** when widening what an upload accepts, test a restricted public link as well as the member path.
