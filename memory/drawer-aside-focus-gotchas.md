---
name: drawer-aside-focus-gotchas
description: Focusing inside the setlist library aside, always-mounted sheets, one aside at a time, and Escape in portaled viewers
type: project
applies-to: apps/web/src/components/setlists/**, apps/web/src/components/app/**, apps/web/src/components/files/**, apps/web/src/components/events/**
---
- The setlist library/copy aside (`SideDrawer` in `components/app/bottom-drawer.tsx`) slides in with a `visibility` transition, so a single `focus()` right after it opens can silently do nothing. Focus the search field with a short requestAnimationFrame retry loop that stops once the field is active or once focus has moved to something else (a delayed focus otherwise steals focus from the Sort menu and closes it) (2026-11-17, #83).
- A hidden right-sheet that stays mounted in a shared drawer collides with specs that locate `getByTestId("right-sheet")` (strict-mode violation): mount a sheet only while something is selected (2026-11-16, #68).
- Register only one aside at a time in a drawer; placeholder rows must not be clickable (2026-11-16, #68).
- A portaled viewer opened from a sheet shares document-level Escape listeners with it: one Escape closes both unless the viewer stops the event (2026-11-16, #69).
**Why:** each caused a blocking review finding or CI failure on a shipped unit.
**How to apply:** paste these into briefs for drawer, aside, sheet and viewer work, and ask the reviewer to check them. Related: [[drawer-nonmodal-gotchas]].
