# Walkthrough C: setlists, library, references, Spotify (fake), stage mode

Tester 3, slot 3 (web 3203, API 4203). Desktop 1280x800 unless noted; wider (1920x1000) and phone (390x844) used where stated. Screenshots live in the tester scratchpad: /tmp/claude-1001/-home-dev-projects/7257d174-f735-587c-871d-3359d4518891/scratchpad/ (names below are relative to it).

## Results

| Flow | Status | Note |
|---|---|---|
| SET-01 | PASS | Empty setlist shows dashed "Add songs" block; no Stage mode button while empty |
| SET-02 | PASS | Empty library: "Your library is empty." with big Add song button (set02.png) |
| SET-03 | PARTIAL | At 1280 the library drawer covers the event drawer (no side by side, no drop target, drag does nothing). At 1920 side by side and drag works but always appends to the end, not the drop position |
| SET-04 | PASS | Phone: library sheet stacks over gig drawer (peeking), tap adds with check, tap again removes. Dismiss is a chevron, not a "Done" label |
| SET-05 | PASS | Desktop handle drag and phone touch drag reorder and persist after reload |
| SET-06 | PASS | Total updates live; manual song shows "5 songs · 16 min · 1 without a length" |
| SET-07 | PASS | Removed from setlist, stays in library |
| SET-08 | PASS | Plus in drawer opens add sheet; saved song is appended to setlist and library (desktop; phone not run) |
| SET-09 | PASS | Newest first, search, preview chevron, "Copy this setlist?" with Cancel / Add to end / Replace; both work |
| SET-10 | PASS | Past gig with empty setlist is simply not listed in the setlist history (no message) |
| SET-11 | PASS | "No songs match" plus "Add this song" opens add sheet with text prefilled |
| SET-12 | PASS | Same five options as library tab, shared persisted key greenroom:library-sort |
| SET-13 | PASS | Setlist set on an occurrence applies to it and all later ones; earlier unchanged |
| SET-14 | PASS | "Change later setlists?" lists the later custom dates; Keep and Replace behave as specified; no prompt with nothing custom. "Once per drawer" not checked |
| SET-15 | PASS | New gig lineup is the full band (4 of 4) |
| SET-16 | PASS | Remove saves live; add back by tap (check marks) or drag (1920) |
| SET-17 | PARTIAL | Button is "Copy from a past gig" (list with preview), no one-tap "Copy from last gig" |
| SET-18 | PASS | Setlist and lineup changes survive reload with no Save |
| LIB-01 | PARTIAL | Copy is "No music yet [em dash] press + to add one" vs spec "No music yet. Press + to add one"; FAB position matches calendar |
| LIB-02 | PASS | FAB shows Add song / Import playlist |
| LIB-03 | PASS | Right sheet with smart input and "Enter manually" only |
| LIB-04 | PARTIAL | Fields prefill (title, artist, duration, Spotify reference row). Result row is shown, but no separate preview/confirm step and no album art in the form |
| LIB-05 | PASS | Results list; no results shows "No matches. You can enter the song manually instead." |
| LIB-06 | PASS | Title from video, artist from channel, duration, YouTube reference row |
| LIB-07 | PASS | Typed text carried into Title; all fields appear |
| LIB-08 | PASS | "Title is required" with red field |
| LIB-09 | PASS | Imported fields editable |
| LIB-10 | PASS | On Done: "This song is already in your library." with Open it / Add anyway |
| LIB-11 | PASS | "Found a tab on Songsterr. Add it?" with Add tab; not added automatically |
| LIB-12 | PARTIAL | Cards fine, title-only song fine. Spotify imageUrl is stored but placeholder is shown (fake art host does not resolve in this sandbox), art display not verifiable |
| LIB-13 | PASS | Filters as you type |
| LIB-14 | PASS | All five sorts work, persists across reload |
| LIB-15 | PASS | Sheet shows duration, references, notes, used in, files |
| LIB-16 | PASS | Desktop: click other rows with sheet open. Phone: Previous/Next buttons in header (swipe not tried) |
| LIB-17 | PARTIAL | Pencil toggles to a Cancel X and Save, but content below the header shifts (Duration moves from y=226 to y=322) |
| LIB-18 | PASS | "This is in 3 setlists. Deleting it removes it from all of them."; delete removes it from library and gig setlist |
| LIB-19 | PASS | "Used in" lists gigs with dates plus "Last played" |
| LIB-20 | BLOCKED | No linked gig media available; fake Drive not linked to band (no Videos section rendered with nothing linked) |
| LIB-21 | BLOCKED | Same; Files section shows "No files linked." with Add file |
| LIB-22 | PASS | After fake connect, "2 added, 1 already in library"; duplicates skipped. No progress indicator visible (instant) |
| REF-01 | PASS | Added "lyrics"+URL and "Key"+text rows; imports add their own row |
| REF-02 | PASS | URL row has favicon and external-link icon; plain text row has neither |
| REF-03 | PASS | Notes saved, shown in sheet and in stage mode under title |
| REF-04 | PARTIAL | No label autocomplete present (no datalist or listbox); unspecified in design |
| REF-05 | PASS | Label is "Reference"; setlist header has "Open references" (open one reference kind for all songs, "1/8 songs") |
| SPOT-01 | PASS | Sign-up and sign-in never ask for Spotify; track lookup and search work logged out of Spotify |
| SPOT-02..08 | SKIPPED-REAL | Tagged [real-spotify]. (Fake connect gate was exercised under LIB-22) |
| SPOT-09 | PARTIAL | Library export works against fake: "Exported 13 songs", "Skipped 10 without a Spotify link: ..." and Open in Spotify. Setlist export dialog not run |
| STAGE-01 | PASS | /gigs/:id/stage, black full screen, 72px white title |
| STAGE-02 | PASS | Current title with notes, NEXT below, "n of 6". No whole-list view |
| STAGE-03 | PASS | Tap advances; last song shows "END OF SETLIST" and further taps do nothing |
| STAGE-04 | PARTIAL | Pointer swipe right goes back, left advances (mouse drag). Synthetic touch swipes in headless Chrome had no effect (pointercancel) and a swipe starting at x=60 triggered browser history back to about:blank |
| STAGE-05 | PARTIAL | navigator.wakeLock exists; acquisition not observable headless; no on-screen indicator |
| STAGE-06 | PASS | Reload resumes on same song (per device) |
| STAGE-07 | PASS | After online load, setOffline then reload and direct navigation both render and advance; "Available offline" badge shown |
| STAGE-08 | PASS | "This gig has no setlist yet." |

Counts: PASS 40, PARTIAL 9, BLOCKED 2, SKIPPED-REAL 7 (SPOT-02..08), FAIL 0.

## Findings

1. **major** SET-03 (desktop 1280x800). Steps: open any gig, press Add songs. Expected: library drawer beside the event drawer, drag into setlist. Actual: library drawer renders on top of the event drawer in the same slot, hiding the setlist; dragging a row does nothing (only tap/check works). Side by side only appears at wider viewports (1920 verified; drawers also have different top edges there). Screenshots set03a.png, set03d.png, set03_1920.png. Suspected: components/setlists/setlist-aside.tsx layout breakpoint.
2. **minor** SET-03 (1920). Drag from library drops at the end regardless of drop position (dropped between rows 1 and 2, appended). set03g.png, set03h.png. Matches the Gate 3 "append-only" note; confirms actual behavior.
3. **minor** LIB-17 (desktop). Edit mode shifts content (Duration label y 226 to 322) and shows two adjacent X icons (Close and Cancel) in the sheet header, easy to confuse. lib15.png vs lib17.png. View mode also repeats title and artist twice (header and body) (polish).
4. **minor** LIB-04. Selecting a Spotify result goes straight to the form; no preview/confirm with art, and no art in the form. lib04b.png.
5. **minor** LIB-01. Empty copy uses an em dash instead of spec copy. lib01.png.
6. **minor** SET-04 (phone). Library sheet has a chevron, no "Done" label as the spec says. set04b_m.png.
7. **minor** Console noise. (a) Library and events pages request GET /bands/:id/files/folder/root which returns 409 when Drive is not linked, logging a console error on every load. (b) After deleting a song the app refetches the deleted song twice (404). (c) 401 on /auth/me and a 404 on first load of /events (untraced). Not user-visible.
8. **polish** SET-09/SET-17. In the "Copy from a past gig" list the subtitle truncates mid-count ("Oct 28, 2026 · 6 …", "3 me…"); screenshots set09a.png, set17.png.
9. **polish** Stage mode. "NEXT" label is 12px dark grey on black, low contrast for a stage reading view; title is left-aligned rather than centred. stage1.png.
10. **polish** Navigation. Creating a gig on Dec 5 left the calendar on November while creating one on Dec 10 in a new band jumped to December (inconsistent), and a freshly created practice-occurrence setlist read empty for over 1.8 s after navigation in a few loads (may be machine load from parallel testers).
11. **minor** SPOT-04 related (fake). Export dialog has no editable playlist name field (spec for real flow says "edit name; confirm"). spot04.png.
12. **minor** STAGE-04 (needs real-device check). Swipe back from the far left edge on touch is claimed by browser history navigation, which exits stage mode; touch swipes could not be confirmed via emulation.

## Ambiguities (behavior observed)

- Last stage song: shows "END OF SETLIST" and stays put.
- Gig with empty setlist: Stage mode button is hidden; direct URL shows "This gig has no setlist yet."
- Past gigs with empty setlists are omitted from the copy-from-past-gig list (SET-10).
- Wildcard fake: any unknown Spotify playlist id imports 10 demo tracks; private fake playlist says Spotify won't share it with the account.
- Deleting a song removes it from all setlists after a count warning.

## Test data left behind (slot 3 DB)

Gigs "Walk Gig A", "Walk Past Empty", extra practice setlists, imported fake songs, deleted "Red Line", notes on Skyline Drive; a second user tester3-empty@example.com with "Empty Band".
