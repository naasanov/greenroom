---
name: untrusted-file-parsing-caps
description: Anything that decodes or parses a user-supplied file (images, containers) needs size, pixel and element-count caps before it allocates
type: feedback
applies-to: apps/api/src/media/**, apps/api/src/files/**
---
A decoder or container parser on the API must bound its work before allocating: file bytes, decoded pixels (width x height x 4), and the number of boxes or entries it materializes. A byte cap alone is not enough: a small HEIC can declare huge dimensions, and a 48 MB file of 8-byte boxes builds millions of objects. Public upload links let anonymous users reach these paths.
**Why:** HEIC conversion (#85) passed its first brief with only a 50 MB cap; review found it unbounded in pixels (API machines have 256 MB staging, 512 MB prod) and in box count (OOM crash).
**How to apply:** read declared dimensions from the header first, cap pixels (HEIC uses 16 MP), cap child entries per level, keep the original on any parse failure, and put the caps in the implementer brief. A try/catch cannot save an out-of-memory process.
