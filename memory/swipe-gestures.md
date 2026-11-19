---
name: swipe-gestures
description: Custom pointer swipe handlers must track pointerId, cancel on multi-touch and skip controls and portaled targets
type: project
applies-to: apps/web/src/components/**
---

A hand-rolled swipe on pointer events has these failure modes:
- Without `pointerId` tracking, a pinch reads as a swipe. The second finger overwrites the start point, so `touch-pan-y` roots get no `pointercancel`.
- Events from Radix portals (dialogs) bubble through the React tree into the swipe root.
- Keyboard shortcuts on `window` hijack arrows and Escape from selects and dialogs.
- A shared scroller keeps its `scrollTop` when the content swaps.

**Why:** all four reached review in the chords stage reader (#95).
**How to apply:** track the active pointer and cancel on a second pointerdown. Only start from `e.currentTarget.contains(target)` outside nav, buttons, inputs and dialogs. Guard key handlers for form fields and dialogs. Reset scroll when the item changes.
