# Walkthrough B: calendar, agenda, drawers, RSVP

Tester 2 (slot 2, web :3202, API :4202). Date of run: 2026-11-06 (today marker Nov 6). Desktop 1280x800 and mobile 390x844 (touch). Screenshots live in /tmp/w2/ (scratchpad of the tester). Two users were used for RSVP-05 (tester2-a admin, tester2-b joined by invite link). Several recurrence and RSVP assertions were verified against the API as well as the UI.

## Result table

| Flow | Status | Note |
|---|---|---|
| CAL-01 | PASS | Month grid, gig green / practice blue, time text on chip, pink today marker. Desktop chips carry extra lines (range, venue, "4 in lineup"). |
| CAL-02 | PASS | Week grid, practice sits in 7pm slot, all-day strip, no Day view. Grid auto-scrolls so morning events are hidden above 2pm until scrolled. |
| CAL-03 | PASS | Date-only gig shows in all-day strip and as month chip; adding 9pm moved it out of the strip into month chip "9p". |
| CAL-04 | PASS | Month/Week toggle, week choice survives reload. |
| CAL-05 | PASS | Prev/next slide on desktop; touch swipe left/right changes month on mobile. |
| CAL-06 | PASS | Today button snaps back in month and week. |
| CAL-07 | PASS | No filter on calendar. Practice and gig chips always both shown. |
| CAL-08 | PASS | Day click opens create drawer with date prefilled once a form is chosen. See F1, F7 for related issues. |
| CAL-09 | PASS | Gig and practice chips open populated drawers; second chip replaces first. |
| CAL-10 | PASS | No overlays, weather, travel. |
| CAL-11 | PASS | 7 events on one day: 3 compact rows plus "+4 more" popover listing all. Compact rows touch/overlap slightly (F9). |
| CAL-12 | PASS | Created chips appear without reload; time edit moved chip; deleted gig disappeared. |
| AGD-01 | PASS | Opens by default on desktop (wide), pushes calendar left. On phone it is closed by default and the agenda button slides it over the calendar. |
| AGD-02 | PASS | One continuous list, pink Today line, opens on the today line. Uses an All/Gigs/Practices control (no past/upcoming toggle). |
| AGD-03 | PASS | Half-visible past card above the line. |
| AGD-04 | PASS | Title, date, time, type pill, venue name only. |
| AGD-05 | PASS | Card tap opens drawer beside sheet (desktop) or over sheet (phone) and navigates calendar to that month (tested Sep past gig) and highlights chip. On desktop the drawer covers the highlighted chip when it is in the right columns. |
| AGD-06 | PASS | All/Gigs/Practices filters list only, calendar unfiltered, persists across reload. |
| AGD-07 | PASS | Everyone, Me, then members. Filtering by a member shows only gigs with them in lineup (practices stay). |
| AGD-08 | SKIPPED | Covered by SET-09 (other group). |
| AGD-09 | PASS | X with aria-label Close; reopen via agenda button. |
| AGD-10 | PARTIAL | Empty band shows "No events yet" empty state, no crash, but no today line (spec says empty timeline with today line). Copy unspecified. |
| DRW-01 | PASS | Split Practice (left) / Gig (right), centered title. Desktop position gap, see F8. |
| DRW-02 | PASS | FAB opens same drawer, gig date empty. |
| DRW-03 | PASS | Slides to forms; back arrow returns to split for both. |
| DRW-04 | PASS | Horizontal swipe-back on phone returns to split. |
| DRW-05 | PASS | Gig: "Give the gig a title." and "Pick a date." Practice also validates. |
| DRW-06 | PASS | Title+date creates gig; drawer becomes gig drawer; all-day strip chip. |
| DRW-07 | PASS | All fields saved and shown (call time shown as "Load-in"), lineup defaults to full band, empty setlist with "Add songs". |
| DRW-08 | PASS | Fake Places: typing "Bowery" suggests Bowery Ballroom, pick fills name + address. Typing "Cafe" gives no suggestions (fake dataset only). Mobile problem in F2. |
| DRW-09 | FAIL | On phone the venue picker is an inline dropdown, not a stacked drawer. See F2. |
| DRW-10 | PASS | "Show on public calendar" ON by default, can be turned off, persisted. |
| DRW-11 | FAIL | End before start is rejected ("End time must be after the start time"), no next-day indication. Create form has no setlist field (setlist is added after create in the drawer). See F3. |
| DRW-12 | PASS | UI: weekly Tue+Thu accepted. API: biweekly Monday, monthly nth weekday produce correct dates. Monthly and interval-2 UI paths not driven through the form. |
| DRW-13 | PASS | UI count=5 Tue+Thu gave Dec 1,3,8,10,15; until-date monthly (API) gave 4 occurrences to Feb. "Never" ran without end. |
| DRW-14 | FAIL | Same-day outside tap shows Discard changes; tapping a different day with a dirty form resets the form silently. See F1. Phone outside tap shows confirm. |
| DRW-15 | PASS | Untouched drawer closes on outside tap and the tap opens create for that day (passes through). |
| DRW-16 | PARTIAL | Headless run has no on-screen keyboard. Focus scroll is poor even without it, see F2. |
| DRW-17 | PASS | No backdrop; month change and chip taps work with drawer open. Scope/discard dialogs do blur (modal), as intended. |
| DRW-18 | PASS | Practice create becomes practice drawer; recurring chips appear. |
| EVT-01 | PARTIAL | Details, setlist, lineup, media strip, contact, notes, delete, share (link icon), pencil present. Stage mode button not seen in the drawer I inspected (setlist toolbar has open-external and share icons). Not confirmed either way. |
| EVT-02 | PASS | Pencil edits in place with Cancel / Save changes footer (pencil does not literally become "Cancel"); setlist and lineup not in form. |
| EVT-03 | PASS | Cancel with typed changes shows Discard changes? (Keep editing / Discard). |
| EVT-04 | PARTIAL | Confirm copy says media remains in Google Drive and gig vanishes. No media exists (Drive not linked in fake), so Drive/Files persistence not checked. |
| EVT-05 | PASS | Details, setlist, RSVP, attendees, share, edit, delete. Spec says "cancel"; app label is "Delete practice" (F6). |
| EVT-06 | PASS | Scope picker appears at Save, not at Edit. This / this and following / all applied correctly (verified via API). One caveat in F4. |
| EVT-07 | PASS | Changing repeat interval hides "This event". |
| EVT-08 | PARTIAL | Same picker (titled "Cancel recurring event"), scope applied. Cancelled occurrence simply vanishes from calendar and agenda, no cancelled display (F6). |
| EVT-09 | PASS | Changing one occurrence date with "This event" moved only it (also "This and following" is hidden when date changed). |
| EVT-10 | PASS | Replacing a drawer overlaps both slides; dirty edit shows discard confirm and tap does not replace. Only single frames captured, animation smoothness not judged. |
| EVT-11 | BLOCKED | Not exercised (needs stacked drawer; phone venue picker is not stacked, see DRW-09). |
| EVT-12 | PASS | One-off practice save has no scope question. |
| EVT-13 | PASS | Gig drawer has no RSVP controls. |
| EVT-14 | PASS | Name, phone and email shown (phone and email render as green links); omitted when empty. |
| RSVP-01 | PASS | Order going, maybe, no response, not going; check / question mark / empty dashed circle / X. Summary line "1 going, 1 maybe, 3 no response". |
| RSVP-02 | PASS | Going/Maybe/Not going apply immediately, no scope question, list re-sorts (Not going moves to bottom). |
| RSVP-03 | PASS | Picker "RSVP to recurring event" with This / This and following / All. Verified: this only, this+following, all each correct on other occurrences. |
| RSVP-04 | BLOCKED | Not going works in app; Google sync not testable with fake. |
| RSVP-05 | PASS | tester2-b RSVP "Maybe"; tester2-a saw it in the list. |
| RSVP-06 | PASS | Roster-only members (Ben, Cleo, Dev) appear in attendee list with no response. |

Counts: PASS 49, PARTIAL 5, FAIL 3, BLOCKED 2, SKIPPED 1 (60 flow rows).

## Findings

### F1 (major) DRW-14, CAL-08. Dirty create form silently discarded when another day is tapped
- Viewport: desktop 1280x800 (not checked on phone, where the drawer covers most days).
- Repro: click Nov 16 -> Gig -> type a title -> click a different day cell (Nov 23).
- Expected: "Discard changes?" confirm, tap does not pass through (DRW-14).
- Actual: no confirm; drawer resets to the Practice/Gig split with the new date and typed title is lost. Same-day tap correctly shows the confirm.
- Screenshot: /tmp/w2/d1.png
- Suspected cause: apps/web/src/components/events/events-tab.tsx `openCreate` bumps `nonce` and remounts the drawer for a different date without consulting the dirty guard (outside-press guard only handles the same-date case).

### F2 (major) DRW-09, DRW-16. Phone: venue suggestions hidden under the Create button; picker is not a stacked drawer
- Viewport: mobile 390x844.
- Repro: tap a day -> Gig -> tap Venue -> type "Bowery".
- Expected: venue picker slides up as its own stacked drawer (DRW-09), focused input visible.
- Actual: inline dropdown that renders at y 797-855, behind the sticky footer (Create gig at y 784-828) and past the viewport; suggestions cannot be seen or tapped. The focused Venue input itself sits half under the footer and the form does not scroll it into view.
- Screenshot: /tmp/w2/m-venue2.png, /tmp/w2/m-venue3.png
- Suspected cause: apps/web/src/components/events/place-picker.tsx absolute listbox inside scrolling form with sticky footer; no scrollIntoView on focus or bottom padding.

### F3 (major) DRW-11. End time before start is rejected, no next-day handling; no setlist in practice create form
- Viewport: desktop.
- Repro: New practice, start 11:00 PM, end 1:00 AM, Create.
- Expected: accepted as ending next day, with an indicator in the form.
- Actual: inline error "End time must be after the start time". `time.ts` comment says end at or before start means next day, and API allows durations up to 1440, so the form validation contradicts the model. Also the create form has no optional setlist (only available after creating, in the drawer).
- Screenshot: /tmp/w2/p1.png
- Suspected cause: apps/web/src/components/events/practice-form.tsx validation.

### F4 (minor) EVT-06. "All events" edit skips an earlier single-occurrence override
- Repro: on a biweekly series, edit Nov 23 time with "This event"; then rename Nov 9 with "All events".
- Expected: all occurrences renamed.
- Actual: Nov 9 renamed but Nov 23 kept the old title (the override stored every field). Occurrences created by an earlier "This and following" split (separate series) also kept the old title, so "All events" means "all in this series segment". Arguably Ambiguity: calendars differ here; at minimum the stale title on an occurrence the user only changed the time of looks wrong.
- Suspected cause: occurrence override snapshots unedited fields (apps/api/src/events).

### F5 (minor) AGD-10. Empty agenda has no today line
- Repro: new band with no events, open agenda. Shows "No events yet / Gigs and practices you add will show up here." and no today line.
- Screenshot: /tmp/w2/empty2.png

### F6 (minor) EVT-05, EVT-08. Recurring cancel is a hard delete with mixed wording
- Trigger aria-label is "Delete practice", dialog title "Cancel recurring event", non-recurring confirm "Delete this practice?". Cancelled occurrences disappear from calendar and agenda instead of showing as cancelled (spec: not silently deleted). Exact display unspecified, noting current behavior.
- Screenshot: /tmp/w2/evt08.png

### F7 (minor) CAL-08, CAL-01. Desktop days with an event are hard to click for create
- Chips stretch to fill the row height (even a one-line all-day chip is as tall as the 4-line practice next to it), so the free area of a day cell is nearly zero; Playwright's click on the day number is intercepted by `.fc-daygrid-day-events`. Real clicks near the top of the cell work. Users must hit a thin strip to add a second event on a busy day.
- Screenshot: /tmp/w2/cal11.png, /tmp/w2/month.png

### F8 (polish) DRW-01. Create drawer and event drawer sit at different horizontal positions on desktop
- With the agenda open, the create drawer spans about x 264-776 (89 px gap to the agenda) while the gig/practice drawer spans x 336-848 (17 px gap). Spec: directly left of the open sheet. The create-to-gig handoff makes the drawer jump right.
- Screenshots: /tmp/w2/drw01.png, /tmp/w2/drw06.png
- Suspected cause: eventDrawerClass / beside-sheet.ts widths.

### F9 (polish) CAL-11, mobile month
- Desktop dense day: compact rows touch and overlap by a pixel or two (/tmp/w2/cal11.png).
- Mobile month: chips clip inside the day cell (checked programmatically, zero chips outside their cell) but titles truncate to 2 characters ("Bi...", "De...", "Twi..."), so events are indistinguishable without tapping. "+3 more" touches the right edge of its cell. Selected chip ring correctly paints over the neighbouring chip on a two-event day (Nov 9, both chips tested; harness z-index 4 vs auto).
- Screenshots: /tmp/w2/m-month.png, /tmp/w2/m-ring-0.png, /tmp/w2/m-ring-1.png

### F10 (polish) Avatars and weekday chips
- Attendee list uses two-letter initials (BB, CK, DD) while the lineup list uses one letter (B, C, D) for the same people. Weekly repeat chips show "T T" and "S S" for Tue/Thu and Sat/Sun with no visual distinction (aria-labels are correct).
- Screenshots: /tmp/w2/p3.png vs /tmp/w2/drw06.png

### F11 (polish) Console noise on every Events load
- `409 /bands/:id/files/folder/root` (Drive not linked, fake) and a `404` resource error appear in the console on the Events page, plus an expected 401 on /auth/me before sign-in. The 404 URL was not captured. Suspect the Drive 409 is an unhandled expected state.

## Ambiguities observed (not bugs)
- Agenda is open by default on wide screens, closed on phones (AGD-01 note).
- Pencil in details hides in favor of footer Cancel / Save changes.
- "This and following" is hidden when an occurrence date is changed; "This event" hidden when recurrence changes.
- Roster-only members appear with no response in attendee lists.
- Fake Places only knows Bowery Ballroom, The Troubadour, Exit/In.
- Applying an RSVP "All events" overwrites an earlier "This event" RSVP on that occurrence.

## Not covered
EVT-11 (stacked drawer outside tap), Stage mode button in drawer, real keyboard avoidance, Drive persistence on gig delete, monthly and "ends on a date" via the form UI (verified through API), animation smoothness.
