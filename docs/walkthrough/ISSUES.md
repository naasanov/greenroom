# Walkthrough issues

Filed from the four Phase 8 walkthrough reports (A to D). Severity and area also exist as GitHub labels.

| # | Title | Severity | Area | Primary files |
|---|---|---|---|---|
| #2 | Dirty create form silently discarded when another day is tapped | major | calendar | apps/web/src/components/events/events-tab.tsx |
| #3 | Phone: venue suggestions hidden under Create button; picker not a stacked drawer | major | mobile | apps/web/src/components/events/place-picker.tsx |
| #4 | Practice end time before start is rejected instead of ending next day | major | calendar | apps/web/src/components/events/practice-form.tsx |
| #5 | Removing a member leaves them in future gig lineups | major | roster | apps/api/src/bands (membership removal), apps/api/src/events (lineup) |
| #6 | Claiming a roster entry loses its notes and the user's picked instruments | major | roster | apps/api/src/bands (claim/merge), apps/web roster claim flow |
| #7 | Library drawer covers the event drawer at 1280px; drag does nothing | major | setlists | apps/web/src/components/setlists/setlist-aside.tsx |
| #8 | Dragging a library song into a setlist always appends to the end | minor | setlists | apps/web/src/components/setlists/ |
| #9 | Uploaded media stays in tray and gallery shows empty until Dismiss | major | media | apps/web/src/components/media/ (upload tray, gallery) |
| #10 | Files tab folder menu has no 'Link to gig' | major | files | apps/web/src/components/files/ (folder menu), media-gallery.tsx |
| #11 | API allows trashing the Profile photos folder | major | files | apps/api/src/files/files.service.ts |
| #12 | Gig folders have no trash action and no explanatory message | minor | files | apps/web/src/components/files/ |
| #13 | Console noise batch: Drive-unlinked 409 and other stray errors on page load | minor | shell | apps/web app shell / files prefetch, apps/web songs query |
| #14 | Song sheet edit mode: two adjacent X icons and content shift | minor | library | apps/web/src/components/songs/ (song sheet) |
| #15 | Leave band as last admin: warning only appears after confirming | minor | settings | apps/web settings Band section |
| #16 | Roster Add manually: empty-name error scrolled out of view | minor | roster | apps/web/src/components/roster/ |
| #17 | Regular member sees 'Band settings' in the band switcher menu | minor | settings | apps/web band switcher |
| #18 | Onboarding and invite polish batch | polish | shell | apps/web welcome and invite pages |
| #19 | 'All events' edit leaves stale title on a previously overridden occurrence | minor | calendar | apps/api/src/events (occurrence overrides) |
| #20 | Empty agenda has no today line | minor | calendar | apps/web agenda component |
| #21 | Recurring cancel is a hard delete with mixed wording | minor | calendar | apps/web event drawer, apps/api/src/events |
| #22 | Desktop month: days with events are hard to click to create another | minor | calendar | apps/web calendar styles (.fc-daygrid-day-events) |
| #23 | Mobile polish batch | polish | mobile | apps/web calendar/month, media tray, drawers |
| #24 | Calendar and drawer visual polish batch | polish | calendar | apps/web/src/components/events/ (beside-sheet.ts, eventDrawerClass) |
| #25 | Spotify result selection skips preview/confirm and shows no album art | minor | library | apps/web/src/components/songs/ (add song) |
| #26 | Spotify export dialog has no editable playlist name | minor | library | apps/web Spotify export dialog |
| #27 | Stage mode polish: NEXT contrast, title alignment, edge swipe exits | polish | setlists | apps/web stage mode page |
| #28 | Public upload page: wrong band initials and same icon for turned-off and expired | minor | media | apps/web public upload page |
| #29 | Upload link expiry is one day later than expected | minor | media | apps/api upload link creation |
| #30 | Drive gigs-root dialog offers Profile photos and redundant Keep/Confirm | minor | files | apps/web Drive connect dialogs |
| #31 | Media tray lacks bulk folder/song pickers and per-item cancel | minor | media | apps/web/src/components/media/ (upload tray) |
| #32 | Media and song copy/label polish batch | polish | media | apps/web/src/components/media/, song drawer |
| #33 | Events page and Agenda dialog stay mounted under full-screen media page | polish | shell | apps/web router/layout |
| #34 | No offline app shell outside stage mode | minor | shell | apps/web/public/sw.js |
| #35 | Walkthrough: design doc ambiguities and doc corrections | n/a | shell | docs only |
