---
name: audio-worklet-bundling
description: Libraries that build AudioWorklet code from Function#toString break when bundled; serve them unbundled from public/
type: project
applies-to: apps/web/src/components/audio-player/**, apps/web/public/**, apps/web/package.json
---
signalsmith-stretch builds its AudioWorklet module from `Function#toString` of its own code. Bundled by Next, a free `process` reference inside it was rewritten to a bundle import, so the worklet threw `ReferenceError` in its constructor and the player sat in "loading" forever, only in the production build (2026-11-23, #148). The fix serves a verbatim copy from `apps/web/public/audio/signalsmith-stretch.mjs`, loaded with `import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)`; the npm package stays a devDependency for types.

**Why:** typecheck and lint pass while the runtime is broken; only a browser run against `next build` shows it.

**How to apply:** for any worklet or worker library, check how it ships its worklet code before bundling it; when the package version changes, refresh the public copy. Verify audio engine changes in a real browser run (the audio-player e2e spec), not only typecheck. Related: [[webkit-audio-e2e]], [[public-assets-proxy-matcher]].
