---
name: webkit-audio-e2e
description: Audio e2e must not depend on the audio clock; WebKit decodes durations slightly short
type: project
applies-to: apps/e2e/tests/audio-*, apps/web/src/components/audio-player/**
---
- In CI's WebKit (iPhone 15 project) the Signalsmith worklet and `decodeAudioData` of a WAV work, but `AudioContext.currentTime` advancing is not guaranteed headless, so the audio-player spec asserts play/pause state by the toggle's name and checks the playhead moving on desktop only (2026-11-23, #148).
- WebKit decoded a 6 s WAV as slightly under 6 s, so a floored duration read "0:05". The player rounds the displayed duration and floors the playhead.
- The fake Drive helper posts files as base64 JSON; a 128 KB body hit HTTP 413, so test audio is a 4 kHz mono WAV.

**How to apply:** assert state, not sound; round durations for display; keep generated test audio small. Related: [[audio-worklet-bundling]].
