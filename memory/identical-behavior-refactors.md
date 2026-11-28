---
name: identical-behavior-refactors
description: A refactor spec that says behavior must stay identical needs the old edge cases named in the brief and tests that pin them; a helper that normalizes parsing silently changes them
type: feedback
applies-to: apps/api/src/integrations/**
---

The shared outbound HTTP helper (#187) first normalized `Retry-After` parsing. The old Spotify loops used a bare `Number(header)`, so a missing or empty header waited 0 ms and an HTTP-date fell back to 1 s. The helper waited 1 s for a missing header and honored dates. The spec said Spotify delays must stay identical; the reviewer caught it (2026-11-28).

**Why:** a "cleaner" shared parser is a behavior change for every caller that relied on the old quirks, and nothing but a reviewer reading the old code would notice.

**How to apply:** when a spec says behavior is identical, list the old code's edge cases in the brief (missing, empty, non-numeric, negative inputs), require an opt-in flag or a per-caller option instead of changing the default parser, and require tests that pin the old results. Tell the reviewer to diff each caller against `git show main:<path>`.
