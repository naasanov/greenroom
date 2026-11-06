# Walkthrough D: media, files, settings (tester 4)

Stack: web :3204, API :4204, fake Drive/Calendar/GitHub. Desktop 1280x800 (and 1440 overflow check), mobile 390x844 spot checks. Scratch screenshots and scripts: /tmp/w4/*.png, /tmp/w4/*.js.
Thumbnails in fake mode render the file name as text; judged logic and layout only.

## Results

| Flow | Status | Note |
|---|---|---|
| MEDIA-01 | PASS | Drawer shows "This band hasn't been linked to a Google Drive yet." with a Connect button |
| MEDIA-02 | PARTIAL | Empty state with "Add media" verified; the 3-4 thumbnail strip plus count not inspected after uploads |
| MEDIA-03 | PARTIAL | Opens /gigs/:id/media view-first; morph animation and collapse-back not observed |
| MEDIA-04 | PASS | One large "Upload photos and videos" button (plus "Link an existing Drive folder") |
| MEDIA-05 | PASS | New gig shows only Unsorted; uploads land in the gig folder root |
| MEDIA-06 | PASS | + FAB, New folder, "Flyer" appears and exists in fake Drive |
| MEDIA-07 | PARTIAL | Rename and Move up verified (persist on reload); Move down and Delete folder not exercised |
| MEDIA-08 | PASS | Bottom tray, square thumbs, truncated names, horizontal strip, auto-start |
| MEDIA-09 | PARTIAL | Per-item blue border and finished full color seen; finished items do not fly into the section (F1) |
| MEDIA-10 | PASS | Thin bar along tray top edge fills left to right |
| MEDIA-11 | PARTIAL | Header has Select all and a cancel-all X with confirm; no bulk folder selector or bulk song picker in the header (only via tray selection bar) |
| MEDIA-12 | PARTIAL | Tray selection offers Move to folder, Rename (single), Link to song; no per-item folder control before selecting; per-item cancel not found |
| MEDIA-13 | PASS | "Keep this page open until uploads finish" note; wake lock requested then released |
| MEDIA-14 | PASS | After reload mid-upload, unfinished show "Re-add to finish" with a Re-add button; re-picking an uploaded file is skipped |
| MEDIA-15 | PASS | Tap toggles, action bar, Move here targets, Rename only at 1 selected, Select all flips to Deselect all |
| MEDIA-16 | PASS | Move here files items at end of section, persists; drag not tried |
| MEDIA-17 | PARTIAL | Collapse works and is not persisted; jump FAB buttons present, not clicked |
| MEDIA-18 | PASS | Large, compact, names-only; persists across reload; names-only name tap renames |
| MEDIA-19 | PASS | Inline rename from label in gallery and names-only |
| MEDIA-20 | PARTIAL | Full-screen viewer, download, click-to-rename, Link to song OK; no share button on desktop; swipe and video Range playback not tested (placeholder video) |
| MEDIA-21 | PARTIAL | Desktop multi-select download gives "Club Meridian media.zip"; mobile share sheet not testable; "Open in Drive" link present |
| MEDIA-22 | PASS | Confirm dialog, item trashed in fake Drive and gone from app; non-member case not tested |
| MEDIA-23 | SKIPPED-REAL | |
| MEDIA-24 | PASS | Picker has setlist songs first plus Library; unrenamed item became "Low Tide.png" in app and Drive; manually renamed "Opening shot" kept its name |
| UPL-01 | PASS | 1/7/30 days, link with Copy; (see F9 on date) |
| UPL-02 | PASS | Signed-out page shows only band name, gig title/date, optional name, upload zone |
| UPL-03 | PASS | Two uploaded files appear in Unsorted |
| UPL-04 | PASS | .exe rejected with "Only photos and videos can be uploaded."; size limits not tested |
| UPL-05 | PASS | Turn off (with confirm) gives "This upload link was turned off"; new link has a new token |
| UPL-06 | PASS | Expired (DB edit) shows "This upload link has expired" |
| UPL-07 | PASS | Per-IP limit: requests 61+ in an hour return 429 (invalid bodies count too) |
| FILE-01 | PASS | Fourth tab "Files" |
| FILE-02 | PASS | Unlinked prompt with Connect (F6: console 409 on load) |
| FILE-03 | PASS | Breadcrumbs Files > Charts > Set A navigate up |
| FILE-04 | PASS | /files/<folder outside root> shows "Folder not found"; API 404 |
| FILE-05 | PASS | List table and two grid densities |
| FILE-06 | PASS | Create folder, rename file, trash file (toast, recoverable). API allows trashing Profile photos folder (F3) |
| FILE-07 | PASS | Upload into current folder; Open and Download in menu |
| FILE-08 | PASS | Gigs root has note badge; gig folder has calendar badge, title, "Gig · Nov 12, 2026" |
| FILE-09 | PARTIAL | Click on gig folder was not confirmed to land on the media page (navigation not asserted) |
| FILE-10 | PARTIAL | UI hides "Move to trash" for gig folders and gigs root, no message; API returns 409 FILES_GIG_FOLDER_PROTECTED (F5) |
| FILE-11 | FAIL | Plain folder menu has Open, Rename, Link to songs, Move to trash; no "Link to gig" (F2) |
| FILE-12 | PASS | Link existing folder from gig media page imports files; folder already used by another gig is refused with message |
| FILE-13 | PASS | Files and folders link to many songs, shown as chips; song drawer lists them; trashed file shows "File unavailable" |
| FILE-14 | PARTIAL | Gigs folder "Change" control present in Band settings; not exercised |
| FILE-15 | PASS | Externally added file appears after poll (used test poll endpoint) |
| FILE-16 | PASS | Externally deleted file shows "No longer in Drive" placeholder |
| DRIVE-01 | PASS | Connect demo account, folder picker (Band stuff, Greenroom demo, New folder), gigs-root dialog, Profile photos created |
| DRIVE-01R | SKIPPED-REAL | |
| DRIVE-02 | PARTIAL | Connect button shown in gig drawer; not clicked |
| DRIVE-03 | PASS | Member sees no Band section or Drive controls; PATCH band returns 403 |
| DRIVE-04 | PARTIAL | Personal and band photo uploads work and show; Drive parent not verified |
| DRIVE-05 | PASS | Folder "26-11-12 Club Meridian" created on first upload |
| DRIVE-06 | PASS | External rename and move keep items; external delete shows placeholder |
| DRIVE-07 | PASS | Unspecified; app offers Change folder, Change gigs folder, Open in Drive, Disconnect |
| DRIVE-08 | PASS | No enforcement observed |
| GCAL-01 | PASS | Dismissible banner, dismissal persists across reload; also in Band settings |
| GCAL-02 | PASS | Calendar named after band, 5 gigs plus recurring practice pushed, "Last synced just now", ACL readers, no attendees |
| GCAL-02R | SKIPPED-REAL | |
| GCAL-03 | PASS | PATCH gig time then flush: Google event moved (via test flush) |
| GCAL-04 | SKIPPED-REAL | Fake simulate: Google title edit pulled into app OK |
| GCAL-05 | SKIPPED-REAL | |
| GCAL-06 | PARTIAL | Google delete removed the gig in app; app-delete direction not tested |
| GCAL-07 | PARTIAL | Calendar email saves and persists; share to new address not rechecked |
| GCAL-08 | PASS | No RSVP sync UI |
| GCAL-09 | PASS | Member sees no calendar controls in settings (banner absent) |
| PUB-01 | PASS | Band settings Copy/Reset; Events export dialog with link, copy, reset |
| PUB-02 | PASS | Name, photo, bio, social chips, Book us, upcoming list, List/Calendar toggle |
| PUB-03 | PASS | Only date, title, time, venue |
| PUB-04 | PASS | Toggle off hides gig on public page |
| PUB-05 | PASS | Reset (confirm) kills old link, new works |
| PUB-06 | PASS | "We can't find this calendar" |
| PUB-07 | PASS | No nav into the app |
| PUB-08 | PASS | List default, readable at 390, no h-scroll |
| SETT-01 | PASS | Name, photo, instruments, calendar email, Spotify, sign out, Delete account, Leave band |
| SETT-02 | PASS | Name and photo persist |
| SETT-03 | PASS | Presets and custom instrument autosave and survive reload |
| SETT-04 | PASS | Member sees no Band section |
| SETT-05 | PASS | Switcher and calendar name update |
| SETT-06 | PASS | Social links, booking email, bio render on public page |
| SETT-07 | PASS | Covered by DRIVE-01 and GCAL-02 |
| SETT-08 | PASS | Covered by PUB-01 |
| SETT-09 | BLOCKED | Leave band belongs to another group |
| SETT-10 | BLOCKED | Spotify belongs to another group |
| SETT-11 | PASS | Profile icon opens /settings on phone |
| ACCT-01 | PASS | Needs exact "DELETE"; lowercase keeps button disabled |
| ACCT-02 | PASS | Solo band deleted, user signed out. Other-band-leaving not tested |
| ACCT-03 | PASS | Blocked with "Make someone else an admin first" listing the band |
| ACCT-04 | PASS | After promoting a member the deletion succeeds |
| ACCT-05 | PASS | Re-sign-in lands on /welcome with no bands |
| FB-01 | PASS | Header icon "Send feedback" |
| FB-02 | PASS | Empty Send disabled; submit creates fake GitHub issue with reporter, band, page, UA |
| FB-03 | PASS | Dialog fits 390 width |
| XC-01 | PASS | scrollWidth equals viewport at 390 and 1440 on all main pages; bottom tabs on mobile, top on desktop |
| XC-02 | PARTIAL | On phone, song drawer opened from the gig drawer fully covers it; no peek of the first drawer |
| XC-03 | PASS | App follows prefers-color-scheme with a coherent dark theme |
| XC-04 | PASS | Cookie named gr_wtd_session (environment specific) |
| XC-05 | PARTIAL | See F9 (expiry date one day later than expected) |
| XC-06 | PARTIAL | Offline navigation to an uncached page shows the browser error page; SW only covers stage mode (public/sw.js) |
| XC-07 | BLOCKED | Not verified (animation not observable in headless run) |
| XC-08 | PASS | No notifications, comments, money or lyrics UI seen |
| XC-09 | PASS | Blocked /songs request shows "Could not load the library." |
| XC-10 | PASS | No unlabeled visible icon buttons found on the main pages |

## Findings

F1 (major) MEDIA-08, MEDIA-09. Desktop. Uploaded items never "fly into" their folder; they stay in the tray with a blue ring and check until the user presses Dismiss. While they sit in the tray they are hidden from the gallery, so after a first upload of 6 files the section reads "Unsorted 0 / Empty folder" and the file count is wrong. Repro: gig media page, Upload, pick 6 images, wait 10 s. Expected: items file into Unsorted when done. Actual: gallery empty, tray full until Dismiss; reload shows them in the gallery. Screenshot /tmp/w4/up-done.png. Cause likely tray/gallery dedupe in components/media (not traced).

F2 (major) FILE-11. Files tab, plain folder "Set A" and file menus. Expected "Link to gig". Actual menu: Open, Rename, Link to songs, Move to trash. The only entry point is the gig media page (FILE-12). grep shows "Link an existing Drive folder" only in media-gallery.tsx. Screenshot /tmp/w4/menu-folder.png.

F3 (major) FILE-06/Files API. POST /bands/:id/files/items/trash with the Profile photos folder id returns 200 and trashes it (UI hides the action but the API does not protect it); gig folders and the gigs root are correctly protected with 409. Suspected apps/api/src/files/files.service.ts protected-folder check.

F4 (minor) FILE-10. Gig folders have no trash action in the UI at all rather than a blocked action with a "delete the gig instead" message. Spec expects the message.

F5 (minor) MEDIA-11/12. Tray header lacks the bulk folder selector and bulk song picker described in the flow, and there is no visible per-item cancel or per-item folder picker; these only exist in the selection action bar.

F6 (minor) FILE-02, MEDIA-01. Console errors on unlinked bands: GET /bands/:id/files/folder/root returns 409 on every load of Events, Settings and Files. Expected a quiet check. Also one unexplained console 404 resource error right after the Drive connect redirect.

F7 (minor) DRIVE-01. Gigs-root dialog lists "Profile photos" as a candidate gigs folder, and offers both "Keep Gigs" and "Confirm" (redundant). Closing the picker without confirming already sets the default gigs folder. The folder-picker close button also shows a focus ring on open. Screenshot /tmp/w4/drive3.png.

F8 (minor) UPL-02. Public upload page band avatar shows initials "DE" instead of the band's "DB" (looks like initials from a different field). Screenshot /tmp/w4/pub-upl.png. Also the turned-off link page uses a clock icon, same as expired.

F9 (minor) UPL-01/XC-05. Gig on Thu Nov 12 with "7 days" shows "Expires Nov 20, 2026"; expected Nov 19 by the label "after the gig". Possibly end of next day or UTC boundary; note it.

F10 (polish) MEDIA-14. "Re-add to finish" overlay on tray thumbnails is ~8px two-line text; hard to read. At 390 the tray takes about a quarter of the screen and stale re-add items persist across reloads until dismissed. Screenshot /tmp/w4/m_gigs_4a39a01f_a88d_4dbf_91e1_ded96b662c88_media.png.

F11 (polish) MEDIA-22. Delete confirm copy: "Move 1 item to Google Drive trash? You can restore them from Drive." Plural pronoun for one item.

F12 (polish) Song drawer. With media linked, the section shows an empty "Videos" heading directly followed by "Photos" and thumbnails. Screenshot /tmp/w4/song-files.png.

F13 (polish) XC-02. Phone song drawer over gig drawer shows no peek of the underlying drawer.

F14 (polish) Media page and others. The Events page and its Agenda dialog remain mounted under the full-screen media page (dialog role "Agenda" is found in DOM while on /media); screen readers may land in hidden content.

F15 (minor) XC-06. No offline shell outside stage mode: navigating offline shows the Chrome error page; spec says the shell is cached.

F16 (polish) MEDIA-24. Linked tile keeps the file name on the first line and the song title on a second line (label "Low Tide.png / Low Tide"); spec says tile shows the song title.

## Ambiguities observed

- Gig sync pushes gigs from about the last two weeks forward only (Aug and Sep gigs not pushed).
- Demo band members count as active members for ACCT-03 (they are real users with memberships), so a sole real admin of the demo band is blocked until someone else is admin.
- Disconnect Drive/Calendar behavior (DRIVE-07) exists as Disconnect buttons; not exercised.
