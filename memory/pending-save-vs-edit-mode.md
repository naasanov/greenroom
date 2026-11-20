---
name: pending-save-vs-edit-mode
description: A one-tap save in view mode must disable every path into edit mode while the mutation is pending, and must not reset the mutation mid-flight
type: project
applies-to: apps/web/src/components/**, apps/web/src/lib/queries/**
---
#128 saved suggested reference chips straight from view mode. Tapping the pencil during the in-flight save called `update.reset()`, which detaches the save from the observer and can drop the added reference or its error alert. The header Edit pencil lives in a parent with its own `useUpdateSong` observer, so `update.isPending` alone does not cover it.
**Why:** review caught it; the fix needed a shared `mutationKey` plus `useIsMutating` (`useIsSongSaving`).
**How to apply:** give mutations a `mutationKey`, disable every control that enters edit mode while a save is pending (read pending state with `useIsMutating`, not one observer), and never call `reset()` while pending. Add a spec that holds the request and asserts the controls are disabled (desktop only, see [[webkit-route-interception]]).
