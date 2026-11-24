---
name: dialog-grid-min-width
description: Long unbroken names in a dialog widen the grid track and scroll horizontally; min-w-0 must go on the dialog's direct children, not the container
type: feedback
applies-to: apps/web/src/components/**
---

The shared `DialogContent` (`apps/web/src/components/ui/dialog.tsx`) is a CSS grid with one auto column. Grid items default to `min-width: auto`, so one long unbroken name widens the track and the dialog scrolls horizontally. `min-w-0` or `truncate` on inner spans does nothing unless the dialog's direct children (the root div of the dialog body) also have `min-w-0`, or `DialogContent` has `grid-cols-[minmax(0,1fr)]`. Adding `min-w-0` on `DialogContent` itself (the grid container) is ineffective.

**Why:** the first fix in #149 put `min-w-0` on the container and was caught in review (2026-11-24).

**How to apply:** for any text overflow in a dialog, set `grid-cols-[minmax(0,1fr)]` on `DialogContent`, `min-w-0` on every direct child, `truncate` plus a `title` attribute on long names, and keep `overflow-x-hidden` only as a backstop. Related: [[drawer-aside-focus-gotchas]].
