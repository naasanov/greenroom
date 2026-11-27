---
name: submit-button-double-fire
description: A type=submit button with its own onClick inside a form runs the action twice; export specs that destructure the first created playlist hide it
type: feedback
applies-to: apps/web/src/components/**, apps/e2e/tests/*export*
---

In the export dialog rework (#167) the Spotify export button was `type="submit"` with an `onClick` that ran the export, inside a `<form onSubmit>` that ran it again. One click (or Enter in the name field) created two playlists. The specs did `const [playlist] = await testApi.spotifyCreatedPlaylists()`, which ignores extras, so they passed.

**Why:** caught only by the build's review round (2026-11-27).

**How to apply:** give a form action one trigger path: either `type="button"` with `onClick`, or a submit button with only `onSubmit`, plus an in-flight guard (ref or pending flag) in the handler. In specs that create external resources, assert the exact count (`toHaveLength(1)`) before destructuring. Also add a press-Enter case. Related: [[pending-save-vs-edit-mode]].
