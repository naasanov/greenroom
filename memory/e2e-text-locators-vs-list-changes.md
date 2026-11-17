---
name: e2e-text-locators-vs-list-changes
description: Changing what a list or picker shows can break specs that locate drawers by text or take the first item
type: feedback
applies-to: apps/e2e/**, apps/web/src/components/events/**, apps/web/src/components/setlists/**, apps/api/src/setlists/**
---
When a change adds items to a picker or list (2026-11-17, #81: upcoming gigs now appear in the setlist "copy from a gig" history), existing specs break in two ways: `.first()` or `nth()` on that list now hits a different item (the history preview spec), and drawer lookups by `hasText: <gig title>` now also match the create drawer, whose setlist picker lists gig titles (events-handoff "tapping a day while a gig is open").
**Why:** both showed up only in CI and cost review rounds and a CI fix attempt; neither was near the changed files.
**How to apply:** before pushing a change to list contents or copy, grep `apps/e2e` for the old text, for `.first()` / `.nth(` on that list, and for `hasText` drawer locators that use item titles; target rows by name and exclude the create drawer with `hasNotText: "New event"`.
