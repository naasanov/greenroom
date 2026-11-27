---
name: public-assets-proxy-matcher
description: Files in apps/web/public go through the sign-in redirect unless the proxy matcher excludes their extension
type: project
applies-to: apps/web/public/**, apps/web/src/proxy.ts
---
`apps/web/src/proxy.ts` redirects requests without a session cookie to `/sign-in`, and its matcher only skips listed static extensions. A new public file type (`.mjs` for the vendored audio module, 2026-11-23, #148) returned a 307 to sign-in on staging until `mjs` was added to the matcher's extension list.

**How to apply:** when adding a file under `apps/web/public/` with a new extension, add the extension to the matcher and `curl -I` it on staging signed out. Related: [[audio-worklet-bundling]].
