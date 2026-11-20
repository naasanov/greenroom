---
name: grep-specs-for-changed-behavior
description: After changing shared UI behavior, ordering or layout, grep every e2e spec and the showcase harness for it; a targeted run of one spec misses the others
type: feedback
applies-to: apps/web/src/components/**, apps/e2e/**
---
Two units failed CI on specs outside their targeted set: #122 changed the RSVP sort and `components.spec.ts` (showcase) still asserted the old order; #123 wrapped drawer sections in a collapsible and `drawer-feedback.spec.ts` still expected the edit action bar flush with the drawer bottom; #133 enabled reorder auto-scroll and the existing "reordered by dragging its handle" spec dropped on a different row.
**Why:** agents ran only the spec for the feature plus smoke, and CI caught the rest one round later.
**How to apply:** in the brief, require `grep -rn` of the changed helper, testid, label text and behavior across `apps/e2e/tests` (including the component showcase specs) and running every spec that matches, not just the feature's own. For layout or interaction changes, also run the drag and drawer specs of the surface touched.
