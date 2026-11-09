# Greenroom User Flows (walkthrough checklist)

Derived from [design.md](./design.md) (source of truth) and [execution-plan.md](./execution-plan.md) (what exists). Meant as the checklist for an LLM walkthrough of https://staging.greenroom.fyi via Playwright MCP, on a desktop viewport (for example 1440x900) and a phone viewport (for example 390x844, touch).

## How to use

- Each flow: ID, title, tags, design section, steps, expected results. Run every flow on desktop and on phone unless it is tagged only [desktop] or [mobile]. Untagged viewport means both.
- Tags: [desktop], [mobile], [real-google], [real-spotify], [needs-two-users], [destructive] (deletes or leaves things; use throwaway data).
- Fake mode (staging default per execution plan Gate 2 notes): sign in with the staging passcode (STAGING_LOGIN_PASSCODE), Google Drive/Calendar/Picker/Spotify/Songsterr/GitHub are fakes. The Picker is a stand-in folder list, Drive is in-memory (resets when the API restarts), thumbnails are grey placeholders. Flows without [real-google] or [real-spotify] work in fake mode.
- [real-google] flows need a real Google account (Sign in with Google, Drive consent, real Picker, real Calendar). [real-spotify] flows need a real Spotify account listed in the Spotify app's User Management.
- Needs two users: use two browser contexts (two passcode accounts).
- Referenced design.md sections are named by their headings.

## Index

| Area | ID range | Flows |
| --- | --- | --- |
| Auth and onboarding | AUTH-01 to AUTH-12 | 12 |
| Multiple bands, switcher, leaving | BAND-01 to BAND-08 | 8 |
| Roster and invites | ROST-01 to ROST-14 | 14 |
| App shell, navigation, persistence, deep links | NAV-01 to NAV-14 | 14 |
| Events calendar | CAL-01 to CAL-12 | 12 |
| Agenda sheet | AGD-01 to AGD-10 | 10 |
| Create drawer, gig and practice forms | DRW-01 to DRW-18 | 18 |
| Gig and practice drawers (view, edit, delete, recurring scopes) | EVT-01 to EVT-14 | 14 |
| RSVP | RSVP-01 to RSVP-06 | 6 |
| Setlists and lineup | SET-01 to SET-18 | 18 |
| Music library and song sheet | LIB-01 to LIB-22 | 22 |
| Open references and song notes | REF-01 to REF-05 | 5 |
| Spotify | SPOT-01 to SPOT-09 | 9 |
| Stage mode | STAGE-01 to STAGE-08 | 8 |
| Gig media (drawer strip, gallery, viewer) | MEDIA-01 to MEDIA-24 | 24 |
| Public upload links | UPL-01 to UPL-07 | 7 |
| Files tab | FILE-01 to FILE-16 | 16 |
| Google Drive linking | DRIVE-01 to DRIVE-08 (+DRIVE-01R) | 9 |
| Google Calendar sync | GCAL-01 to GCAL-09 (+GCAL-02R) | 10 |
| Public gig calendar | PUB-01 to PUB-08 | 8 |
| Settings (personal and band) | SETT-01 to SETT-11 | 11 |
| Account deletion | ACCT-01 to ACCT-05 | 5 |
| Feedback widget | FB-01 to FB-03 | 3 |
| Cross-cutting | XC-01 to XC-10 | 10 |

Total: 273 flows.

Flows needing real accounts: DRIVE-01 to DRIVE-04 real variants, GCAL-01 to GCAL-03 real variants, MEDIA-23, SPOT-02 to SPOT-08, AUTH-03 (Google sign-in), plus any flow tagged [real-google] or [real-spotify] below. Everything else runs in fake mode with passcode sign-in.

---

# Auth and onboarding

### AUTH-01 Sign in with passcode (fake mode) and land on Events
Tags: staging fake mode. Section: Login; Persistence across sessions.
1. Open https://staging.greenroom.fyi signed out.
2. Choose the passcode sign-in and enter the staging passcode and an email.
Expected: signed in, app opens on the Events tab (`/events`) of the user's current band. If the user has no band, the post-signup choice screen is shown (see AUTH-05).

### AUTH-02 Email magic link sign-in
Section: Login.
1. On the sign-in page choose the email option, enter an email, submit.
2. Follow the link from the email (fake mode: whatever the fake email adapter exposes; real Resend adapter was still a stub at 2026-10-26).
Expected: a link-sent confirmation; the link signs the user in. A used or garbage link shows an error and does not sign in.

### AUTH-03 Sign in with Google [real-google]
Section: Login.
1. Click "Sign in with Google" and complete Google consent.
Expected: signed in with basic scopes only (no Drive or Calendar scope requested at sign-in, no "unverified app" screen for plain sign-in). Google profile photo or initials used as avatar until Drive is linked.

### AUTH-04 Signup does not auto-create or auto-join a band
Section: Auth & Onboarding.
1. Sign in as a brand-new user directly from the plain sign-in page (no invite link).
Expected: account is created; no band is created or joined automatically. User is offered two paths: create a band, or join via an invite link.

### AUTH-05 Instrument picker at signup
Section: Auth & Onboarding.
1. As a new user, reach the instrument step.
2. Pick several preset instruments (each shows an icon).
3. Add a custom instrument (for example "Nyckelharpa").
4. Continue.
Expected: multiple instruments can be selected; custom instrument is accepted and shows in the roster and personal settings. Instruments belong to the user, not to a band membership (the same instruments show in every band).

### AUTH-06 Create a band (path a)
Section: Auth & Onboarding.
1. As a user with no band, choose "create a band", enter a band name, submit.
Expected: band exists, user is its creator and an admin, app opens on Events for that band. Empty band is in the unlinked Drive and Calendar state.

### AUTH-07 Invite link, new user (path b)
Tags: [needs-two-users]. Section: Auth & Onboarding.
1. Admin copies the invite link (Roster tab).
2. In a fresh signed-out context open the invite link.
3. Sign in/sign up as a new user and set instruments.
Expected: after signup the user lands inside the invited band (not on a "create your band" screen). Joined as a regular member.

### AUTH-08 Invite link, existing user
Tags: [needs-two-users]. Section: Auth & Onboarding; Multiple bands.
1. Signed in as an existing user (already in another band), open a different band's invite link.
Expected: the user is added to the band without re-signup, lands in that band, and now has two bands in the switcher.

### AUTH-09 Invite link when signed out, then redirect
Tags: [needs-two-users]. Section: Auth & Onboarding; Shareable deep links.
1. Signed out, open an invite link.
2. Sign in.
Expected: after login the user is redirected back to complete the join, not dropped on a generic page.

### AUTH-10 Invalid, reset, or reused invite link
Tags: [needs-two-users]. Section: Roster tab (roles).
1. Admin resets the invite link (ROST-09).
2. Open the old link.
Expected: old link no longer works and shows a clear invalid/expired message; the new link works. (Exact copy for the error is not specified.)

### AUTH-11 Log out
Section: Personal settings.
1. Open profile icon, Settings, press Log out.
Expected: session ends, redirected to sign-in; protected URLs (`/events`) redirect to sign-in.

### AUTH-12 Post-login redirect to the original deep link
Section: Shareable deep links.
1. Signed out, open `/gigs/:id` (an existing gig id).
2. Sign in.
Expected: after login lands on the original link (calendar at the gig's date with the drawer open), not on the default Events view. Repeat for `/songs/:id` and `/practices/:seriesId?date=...`.

---

# Multiple bands, switcher, leaving

### BAND-01 Band switcher placement
Section: Multiple bands & leaving; UI / Navigation.
1. With two bands, look at the top of the screen on desktop and phone.
Expected: band switcher (band name and photo) sits next to the profile icon on both desktop and mobile. On mobile the tabs are in the bottom bar.

### BAND-02 Switch band
Section: Multiple bands & leaving; Persistence.
1. Open the switcher, pick the other band.
2. Reload and open the app on another device/context signed in as the same user.
Expected: data switches to the chosen band; last-used band is stored server-side so the other device opens on it. Switcher also contains a Band settings entry. Current app behavior: the entry is shown to every member of the band, not only admins; admin-only controls inside settings remain admin-only.

### BAND-03 Deep link switches band automatically
Tags: [needs-two-users]. Section: Multiple bands; Shareable deep links.
1. User is in bands A and B, current band A. Open a gig link belonging to band B.
Expected: current band switches to B, calendar shows the gig date with the drawer open.

### BAND-04 Deep link to a band the user is not in
Section: Shareable deep links (members only).
1. Open `/gigs/:id` for a band the user does not belong to.
Expected: no data is revealed; a not-found or no-access state is shown. (Exact UX not specified.)

### BAND-05 Leave band as regular member [destructive]
Section: Multiple bands & leaving.
1. As a non-admin member, Settings, press "Leave band", confirm.
Expected: user removed from the band and the band disappears from the switcher; past lineups still show the person's name (history intact).

### BAND-06 Last admin cannot leave
Section: Multiple bands & leaving.
1. As the only admin of a band with other members, press "Leave band".
Expected: blocked with a message that someone else must be promoted to admin first. After promoting another member, leaving succeeds.

### BAND-07 Only member leaving deletes the band [destructive]
Section: Multiple bands & leaving.
1. As the only remaining member, press "Leave band".
Expected: the flow states that leaving means deleting the band and requires confirmation; band is deleted. Drive files and Google Calendar remain.

### BAND-08 Former member shown in past lineups
Tags: [needs-two-users]. Section: Multiple bands & leaving; Setlists/Lineup.
1. Member X is in a gig lineup, then leaves (or is removed).
2. Open that gig's lineup.
Expected: X's name is still listed, tagged as a former member.

---

# Roster and invites

### ROST-01 Roster tab list
Section: Roster tab.
1. Open the Roster tab.
Expected: members as cards (same card style as Music Library): name, photo, instrument icons. Roster is the fourth and last tab (Events, Music Library, Files, Roster).

### ROST-02 Member detail sheet
Section: Roster tab.
1. Tap a member card.
Expected: right-hand detail sheet (full-screen on mobile) with contact info (email, instruments). It does not list upcoming gigs (those live in the agenda member filter). Close control is an X (desktop) or chevron/Close per layout, aria-label "Close".

### ROST-03 Regular member sees plain Invite link button
Tags: [needs-two-users]. Section: Roster tab.
1. As a non-admin, look at the Roster create control.
Expected: a plain "Invite link" button, no menu with "Add manually".

### ROST-04 Admin plus menu: Invite and Add manually
Section: Roster tab.
1. As admin, press the plus button on Roster.
Expected: a small menu with "Invite" and "Add manually". The plus sits in the same spot as the FAB on other tabs.

### ROST-05 Copy invite link
Section: Roster tab; Auth & Onboarding.
1. Press Invite (or Invite link for a regular member).
Expected: the invite link is shown/copied.

### ROST-06 Add roster-only member manually
Section: Roster-only members.
1. As admin, plus, Add manually.
2. Enter name (required), instruments, optional email and notes. Save.
Expected: card appears tagged "Not on Greenroom". Member can be added to a lineup. Never emailed or shared on the calendar. Cannot be promoted to admin (no promote action).

### ROST-07 Roster-only member claim on join
Tags: [needs-two-users]. Section: Roster-only members.
1. Admin adds a roster-only entry "Sam".
2. A new user opens the invite link and signs up.
Expected: the new user sees "Is one of these you?" with "That's me" per entry and "None of these". Choosing "That's me" merges the entry into the account (lineup history and notes preserved). "None of these" joins normally and leaves the entry.

### ROST-08 Promote member to admin; demote
Section: Roster tab (roles).
1. As admin, open a member's sheet, promote to admin.
2. Demote again.
Expected: admin badge appears/disappears; the promoted user sees Band settings and admin-only buttons.

### ROST-09 Reset invite link
Tags: [needs-two-users]. Section: Roster tab (roles).
1. As admin, regenerate the invite link.
Expected: a new link is shown; old link stops working. Regular members cannot reset.

### ROST-10 Remove a member [destructive]
Section: Roster tab (roles).
1. As admin, remove a member and confirm.
Expected: member removed from the roster and from future lineups; past lineups keep their name.

### ROST-11 Admin-only actions hidden from members
Tags: [needs-two-users]. Section: Roles.
1. As a regular member, open a member's sheet.
Expected: no promote, remove, or reset actions.

### ROST-12 Roster card with only a name
Section: Roster tab; Library list (card style).
1. Add a member with just a name.
Expected: card renders cleanly with placeholder avatar/initials and no instrument icons.

### ROST-13 Member photo per band
Section: Photos live in Drive too (member photos per band).
1. In personal settings (or roster), set a photo in band A, then check band B.
Expected: photo is per band; without Drive linked the avatar falls back to Google profile photo or initials. With Drive linked it is stored in "Profile photos" in the band's folder.

### ROST-14 Roster empty and single-member state
Section: Roster tab.
1. Open Roster in a new band.
Expected: only the creator listed (admin) with invite button available.

---

# App shell, navigation, persistence, deep links

### NAV-01 Tab order and default
Section: UI / Navigation (LOCKED tabs); Files tab.
1. Open the app signed in.
Expected: tabs in order Events, Music Library, Files, then Roster (Files third, added 2026-11-04; Roster last). App opens on Events. No separate Gigs tab. Settings is not a tab.

### NAV-02 Desktop top tabs / mobile bottom bar
Section: Tab placement.
1. On desktop check tabs across the top; no left sidebar.
2. On phone check bottom tab bar; tap to switch; swiping does not switch tabs.
Expected: as described.

### NAV-03 Tab in URL only
Section: Persistence.
1. Go to Music Library; reload.
2. Open the app root in a fresh tab.
Expected: reload keeps the tab (`/library`); a fresh open of the app lands on Events.

### NAV-04 Routes
Section: Execution plan 2.1.
1. Visit `/events`, `/library`, `/roster`, `/settings`, `/files` directly.
Expected: each renders its view when signed in.

### NAV-05 Profile icon opens Settings
Section: Settings.
1. Tap the profile icon.
Expected: reaches Settings (personal section; admins also see Band section).

### NAV-06 Gig deep link
Section: Shareable deep links.
1. Open `/gigs/:id`.
Expected: calendar shown at the gig's date with the gig drawer already open.

### NAV-07 Practice occurrence deep link
Section: Shareable deep links.
1. Open `/practices/:seriesId?date=YYYY-MM-DD` for a recurring practice.
Expected: calendar at that date with that occurrence's drawer open. Without `date` for a recurring series: behavior not specified (see Ambiguities).

### NAV-08 Song deep link
Section: Shareable deep links.
1. Open `/songs/:id`.
Expected: song detail sheet opens (library context).

### NAV-09 Share button on drawers and sheets
Section: Shareable deep links.
1. In a gig drawer, practice drawer, and song sheet press the share button.
Expected: desktop copies the link (confirmation shown); mobile opens the native share sheet. Pasted link opens the same resource.

### NAV-10 Deep link while logged out
Section: Shareable deep links.
Covered by AUTH-12; confirm login is required (no public read of `/gigs/:id`).

### NAV-11 Per-device persistence
Section: Persistence across sessions.
1. Set calendar to week view, agenda filter to Gigs, library sort to Title A-Z, media density to compact; reload.
Expected: all four settings persist on that device. Stage mode position persists (STAGE-06).

### NAV-12 Not persisted state
Section: Persistence across sessions.
1. Type into a form without saving, reload. Collapse a media section, reload. Scroll, reload.
Expected: form edits, collapsed media sections, and scroll positions are not restored.

### NAV-13 Current band persists server-side
Covered by BAND-02.

### NAV-14 Icon buttons and aria-labels
Section: Close control and simple controls use icons.
1. Inspect header controls in drawers, sheets, panels.
Expected: Edit is a pencil (aria-label "Edit") that becomes text "Cancel" while editing. Bottom drawers and phone-stacked side drawers close with a down chevron; wide-screen side panels and right sheets close with an X; all aria-label "Close", never "Done". Save, Create gig, Discard stay text buttons.

---

# Events calendar

### CAL-01 Month view
Section: UI / Navigation (Events tab; How events render).
1. Open Events in month view.
Expected: no time grid; each day shows event chips, color-coded gig vs practice, time as text on the chip. Today has a clear marker (pink "today" color).

### CAL-02 Week view
1. Toggle to week.
Expected: light time grid (practice at 7pm Tuesday sits at its slot) with an all-day strip on top. No Day view is offered.

### CAL-03 All-day strip for tentative gig
1. Create a gig with a date but no time.
Expected: it sits in the all-day strip at the top of that day (week view) and on month view as a chip. Adding a time drops it into its time slot.

### CAL-04 Month/week toggle
Expected: both views available via a toggle; choice persists per device (NAV-11).

### CAL-05 Period change slides
Section: Period changes slide.
1. Press next/previous month, then next/previous week.
Expected: grid slides like a swipe. On touch, a horizontal swipe on the calendar changes the period.

### CAL-06 Jump to today
1. Navigate months away, press "jump to today".
Expected: snaps back to the current period with today marker visible.

### CAL-07 No filter on calendar
Expected: calendar has no gig/practice filter (filter lives in the agenda). Gig and practice chips are always both visible.

### CAL-08 Click a day opens create drawer
1. Click/tap a day cell.
Expected: create drawer slides up from the bottom (see DRW-01) with that date prefilled once a form is chosen.

### CAL-09 Tap an existing event
1. Tap a gig chip, then a practice chip.
Expected: the same drawer, populated, opens (view/manage). Tapping another event while one drawer is open closes the first and opens the second (EVT-10).

### CAL-10 Not present: external overlays, weather, travel time
Expected: none of these appear.

### CAL-11 Dense days and many events
1. Create 5+ events on one day.
Expected: month cells remain legible (fuller chips, no layout break); exact overflow behavior not specified.

### CAL-12 Calendar after create/edit/delete reflects immediately
Expected: new chip appears without reload; edited time moves chip; deleted gig disappears.

---

# Agenda sheet

### AGD-01 Open agenda
Section: Agenda / list view.
1. Press the floating agenda button (above the FAB).
Expected: sheet slides in from the right. Execution plan notes it opens by default after Gate 3 round 1 (verify and note actual behavior). On desktop the sheet pushes the calendar left so both are fully visible; on phones it slides over the calendar.

### AGD-02 One continuous timeline with today line
1. Open the agenda.
Expected: past and upcoming in one list, no past/upcoming toggle (an All / Gigs / Practices control filters the list); a today line in the same pink as the calendar's today marker; opens positioned on the today line. Scroll down: soonest to latest upcoming; scroll up: most recent to oldest past.

### AGD-03 Past peek
Expected: a half-visible card of the most recent past event is visible above the today line.

### AGD-04 Card contents
Expected: each card shows title, date, time, and a type indicator (gig vs practice); gigs may show venue name but not full address.

### AGD-05 Tap a card
1. Tap a card.
Expected: the same event drawer opens populated, and the calendar navigates to that event's month/week and highlights it. Desktop: drawer opens beside the sheet to its left. Narrow phone: drawer comes up over the sheet.

### AGD-06 Gig/practice/both filter
1. Choose Gigs, Practices, Both.
Expected: list filters accordingly; calendar stays unfiltered; choice persists per device.

### AGD-07 Member filter
Tags: [needs-two-users] useful.
1. Open the member dropdown.
Expected: options in order: Everyone (default), Me at the top, then every other member. Picking a member shows only gigs whose lineup includes them; practices stay listed regardless.

### AGD-08 Duplicate-past-setlist browse
Covered by SET-09 (agenda doubles as past-gig browser).

### AGD-09 Close agenda
Expected: X on wide screens (right sheet); chevron/Close on phone per design; aria-label "Close".

### AGD-10 Agenda empty state
1. In a band with no events open the agenda.
Expected: no crash; empty timeline with today line. (Copy not specified.)

---

# Create drawer, gig form, practice form

### DRW-01 Create drawer by clicking a day
Section: Creating an event.
1. Click a day.
Expected: drawer rises from the bottom. First choice: vertical split, left half "Practice", right half "Gig". On desktop it sits on the right part of the screen, directly left of the FAB/agenda buttons (or left of the open agenda sheet); title is centered.

### DRW-02 Create drawer by FAB
1. Press the + FAB.
Expected: the same drawer opens (covering the FAB) with no date prefilled; gig form has its own date field.

### DRW-03 Split slides to a form; back arrow
1. Tap the Gig half; then press the back arrow.
Expected: drawer slides horizontally to the gig form; back arrow returns to the split. Repeat with Practice.

### DRW-04 Swipe back
Tags: [mobile].
1. After picking a half, swipe back.
Expected: returns to the split.

### DRW-05 Gig form required fields
1. Open gig form, leave title and date empty, try to create.
Expected: validation errors on title and date; only title and date are required. No date required on tentative gig time.

### DRW-06 Create a minimal gig (title + date)
1. Fill title and date only; press "Create gig".
Expected: gig created, calendar shows it in the all-day strip; the create drawer turns into the new gig's drawer so setlist and lineup can be filled immediately.

### DRW-07 Gig form full fields
Section: Gig data class.
1. Fill title, date, start time, end time, call/load-in time (separate from go-on time), location, point of contact (name and phone or email), notes. Create.
Expected: all saved and displayed in the drawer. Lineup defaults to the full band. Gig form shows an initially empty setlist with an "Add songs" button.

### DRW-08 Location type-ahead
Tags: fake in fake mode; [real-google] for the real Places API.
1. Type in the location field.
Expected: type-ahead suggestions (Places); picking one fills address. Real Places key live check was pending.

### DRW-09 Venue picker as stacked drawer
Tags: [mobile].
1. Open venue picker on phone.
Expected: slides up as its own drawer on top, the gig drawer peeks above/underneath, not replacing contents.

### DRW-10 Show on public calendar toggle
Section: Public gig calendar.
1. Open gig form; look for "Show on public calendar".
Expected: ON by default; can be turned off.

### DRW-11 Practice form fields
Section: Practice form fields.
1. Choose Practice. Fill title, start time and end time, location (free text), optional setlist.
Expected: end before start means ends next day (verify the form indicates it). Setlist optional and works like the gig setlist.

### DRW-12 Recurrence options
1. Set recurrence weekly; every 2 weeks; monthly; "every Tue & Thu".
Expected: each option accepted; occurrences appear on the calendar accordingly. Only RRULE-representable options are offered.

### DRW-13 End conditions
1. Choose never, until a date, after N occurrences.
Expected: correct number of occurrences appear for each.

### DRW-14 Discard confirm when typed
Section: Exiting the drawer.
1. Type in a field, tap outside the drawer.
Expected: "discard changes?" confirm appears, outside tap does not pass through. Confirm discards.

### DRW-15 No confirm on untouched drawer
1. Open drawer, do not type, tap outside.
Expected: closes immediately with no confirm; the tap passes through.

### DRW-16 Keyboard avoidance
Tags: [mobile].
1. Focus an input low in the drawer.
Expected: the drawer keeps the focused input visible above the on-screen keyboard.

### DRW-17 Drawers are non-modal
Section: Drawers are non-modal.
Expected: no dim or blur backdrop; page behind stays interactive (scroll calendar, change month).

### DRW-18 Create practice then drawer shows it
1. Save a new practice.
Expected: create drawer becomes the new practice's drawer; recurring chips appear on the calendar.

---

# Gig and practice drawers

### EVT-01 Gig drawer contents
Section: Events & Gigs; Media experience.
1. Open an existing gig.
Expected: sections for details, setlist, lineup, media preview strip, point of contact, notes, Stage mode button, share button, edit pencil.

### EVT-02 Edit gig
1. Press the pencil, change fields, then Save changes.
Expected: the pencil hides while editing and the footer shows Cancel / Save changes; edits saved; chip updates. Setlist and lineup are edited live in the drawer and are not part of the edit form.

### EVT-03 Cancel edit
1. Edit then press Cancel with changes.
Expected: changes discarded (discard confirm if typed).

### EVT-04 Delete gig warns about Drive media [destructive]
Section: Gig data class.
1. Delete a gig that has media.
Expected: confirm warns media will remain in Google Drive. After delete the gig vanishes; the Drive folder and files remain (check Files tab/fake Drive).

### EVT-05 Practice drawer contents
Expected: details, optional setlist, one attendee list with RSVPs (see RSVP flows), share button, edit, cancel.

### EVT-06 Edit recurring practice scope question at save
Section: Practices.
1. Open an occurrence of a recurring practice, press Edit, change time, Save.
Expected: the scope question (This event, This and following events, All events) appears at save, not when tapping Edit. Each choice applies correctly.

### EVT-07 Recurrence changed hides "This event"
1. Edit the recurrence rule itself, Save.
Expected: "This event" option is not offered.

### EVT-08 Cancel recurring practice scope
1. Cancel an occurrence.
Expected: same picker (This / This and following / All). Canceled occurrences show as canceled (not silently deleted; exact display unspecified).

### EVT-09 Move a single occurrence to another day
1. Edit one occurrence's date, scope "This event".
Expected: only that occurrence moves; rest of the series unchanged.

### EVT-10 Replace drawer animation
Section: Replacing a drawer animates both at once.
1. With gig A's drawer open, tap gig B on the calendar.
Expected: A slides down while B slides up over it simultaneously; no content snap; tap passes through. If A has unsaved input, discard confirm shows instead and the tap does not pass through.

### EVT-11 Stacked drawer outside tap
Expected: tapping the drawer underneath a stacked one closes only the top one.

### EVT-12 Edit non-recurring practice
Expected: no scope question for non-recurring practices.

### EVT-13 Gig has no RSVP
Section: Decided against (RSVP on gigs).
Expected: gig drawer has no RSVP controls; lineup is managed directly.

### EVT-14 Contact info display
Expected: point of contact appears with phone or email in the drawer when set; omitted when empty. (Whether phone/email render as tap links is not specified.)

---

# RSVP

### RSVP-01 Attendee list display
Section: Practices (RSVP display).
1. Open a practice drawer in a band with several members who responded differently.
Expected: one attendee list. Going: check icon. Maybe: question mark icon. No response: neutral, no icon. Not going: X icon, at the bottom. Order: going, maybe, no response, not going.

### RSVP-02 RSVP on non-recurring practice
1. Set own RSVP going, maybe, not going.
Expected: applies immediately with no scope question; list re-sorts.

### RSVP-03 RSVP on recurring practice asks scope
1. RSVP on an occurrence of a recurring practice.
Expected: picker: this event, this and following, all events; the answer is applied accordingly (check other occurrences).

### RSVP-04 Mark not making a practice
Expected: "not going" is available from the app; in real Calendar mode this should update Google (but see Ambiguities: later update says Google RSVP sync is unsupported).

### RSVP-05 Members see each other's RSVPs
Tags: [needs-two-users].
1. User A RSVPs; user B opens the same practice.
Expected: B sees A's response in the list.

### RSVP-06 Roster-only members in the attendee list
Expected: not applicable or shown with no response; they never get invites. (Unspecified, see Ambiguities.)

---

# Setlists and lineup

### SET-01 Empty setlist and Add songs
Section: Setlists; Setlist building UX.
1. Open a gig with no setlist.
Expected: initially empty setlist with an "Add songs" button.

### SET-02 Library drawer, empty library
Section: Adding songs = second drawer.
1. In a band with an empty library, press Add songs.
Expected: second thin drawer; with empty library a big "Add song" button appears (paste link, search Spotify, etc.).

### SET-03 Desktop drag from library into setlist [desktop]
1. Press Add songs; drag a song from the library drawer into the setlist.
Expected: two thin drawers side by side (library beside the event drawer); song added at the drop position (Gate 3 notes: append-only library drag also mentioned; verify actual).

### SET-04 Phone tap-to-add fallback [mobile]
1. Press Add songs on phone.
Expected: library drawer opens over the gig drawer (stacked, event drawer peeking). Tap a song to append it with a check mark; tap a checked song to remove it. The sheet is dismissed with a chevron (no "Done" label) and returns to the setlist.

### SET-05 Drag-to-reorder
1. Drag a setlist row by its handle to a new position (desktop and phone).
Expected: order changes and persists after reload. Works on phones as single-list drag.

### SET-06 Running total time
1. Add songs with known durations, and a manual song without duration.
Expected: live running total updates; manual or YouTube entries without durations do not contribute.

### SET-07 Remove a song from the setlist
Expected: song removed from the setlist, remains in the library.

### SET-08 Add song in place from the library drawer
Section: Adding songs while building a setlist.
1. In the library drawer press the plus.
Expected: the add sheet opens in place (beside the drawers on desktop, full-screen on mobile). On save the song is added to the library AND appended to the setlist; mobile returns to the setlist on Done.

### SET-09 Copy setlist from a past gig
Section: Duplicate a past setlist.
1. Use "Copy from a past gig": browse history newest to oldest, search by name, pick a gig.
Expected: you can replace the setlist or add to the end (per plan); past-gig preview shown; only a handful of edits needed afterward. No saved "template" setlists exist.

### SET-10 No setlist for the past gig
Expected: gigs with empty setlists copy nothing (and ideally say so). Unspecified.

### SET-11 Setlist search in library drawer with no result
1. Search a song not in the library.
Expected: "Add this song" offered with the typed text prefilled in the smart input.

### SET-12 Library drawer sort
1. Use the sort icon button beside search.
Expected: same sort options as the Music Library tab and shares its persisted choice.

### SET-13 Practice setlist forks forward
Section: Practice form fields (recurring).
1. In a weekly practice change the setlist on the occurrence of 10/4.
Expected: that occurrence and every later one take it; earlier occurrences unchanged.

### SET-14 Custom setlist conflict prompt
1. Give a later occurrence (10/18) its own setlist. Then change the setlist on an earlier occurrence (10/4).
Expected: prompt like "10/18 has its own setlist. Replace it or keep it?" shown once, on the first setlist change in that drawer. Keep: new setlist runs until the next occurrence with its own, which keeps its setlist onward. Replace: runs forward and drops the later ones. No prompt when nothing custom exists.

### SET-15 Lineup default is full band
Section: Default lineup.
1. Create a gig.
Expected: lineup shows the entire band.

### SET-16 Remove from and add to lineup
1. Remove a member (live save). Press Add people; add them back by dragging (desktop) or tapping (phone, check marks, Done).
Expected: same drag/tap mechanic as songs; roster drawer behaves like the library drawer.

### SET-17 Copy lineup from a past gig
Expected: a "Copy from a past gig" button (not the default) opens a list of past gigs with a lineup preview; choosing one replaces the lineup. There is no one-tap "Copy from last gig". Past gigs with empty setlists are omitted from the list.

### SET-18 Setlist and lineup save live
1. Make a change and reload without pressing Save.
Expected: each change is saved immediately.

---

# Music library and song sheet

### LIB-01 Empty state
Section: Music Library tab (Empty state & create).
Expected: the spec copy is "No music yet. Press + to add one"; the app currently shows the same text joined with a dash instead of a period, which is recorded here as current behavior; FAB in same spot as calendar.

### LIB-02 FAB splits into Add song / Import playlist
Expected: tapping + shows two options.

### LIB-03 Add song sheet starts with smart input only
Section: Progressive disclosure.
1. Choose Add song.
Expected: right-hand sheet (full-screen on mobile) in edit mode showing only the smart input and an "enter manually" link.

### LIB-04 Paste Spotify track link
Tags: fake in fake mode; [real-spotify] optional for live lookup (app-level credentials, no login).
1. Paste a Spotify track URL.
Expected: preview (art, title, artist); confirm; fields appear prefilled (title, artist, duration, link as a Reference row).

### LIB-05 Search Spotify by typing
1. Type a song name.
Expected: results list; pick one gives preview and prefilled fields. No results suggests manual entry.

### LIB-06 Paste YouTube link
Expected: auto-detected; title from video title, artist from channel name; duration filled; link added as Reference row; fields editable.

### LIB-07 Enter manually
1. Type text then press "enter manually".
Expected: all fields appear with typed text carried into Title. Only title is required.

### LIB-08 Title required validation
1. Try Done with empty title.
Expected: blocked with a validation error.

### LIB-09 Edit imported fields
Expected: every imported field is editable and can differ from the source.

### LIB-10 Duplicate check on single add
1. Add a song that already exists.
Expected: "already in your library" message.

### LIB-11 Songsterr suggestion
Section: Songsterr tab suggestion.
1. Add a song that has a Songsterr match (fake adapter in fake mode).
Expected: "Found a tab on Songsterr. Add it?" with one-tap add as a Reference row; never added automatically.

### LIB-12 Library list cards
Section: Library list.
Expected: horizontal cards stacked vertically with thumbnail, title, artist, duration; thumbnail is Spotify art, else YouTube thumbnail, else placeholder; cards with only a title look fine. Custom image upload is optional per design.

### LIB-13 Search
Expected: search bar filters the library as you type.

### LIB-14 Sort options
Expected: Title A-Z, Artist A-Z, Recently added (default), Last played, Most played; persists per device.

### LIB-15 Song detail sheet
Section: Song detail sheet.
1. Tap a card.
Expected: right sheet (full-screen mobile) with all info: references and notes.

### LIB-16 Navigate between songs
Expected: desktop: click other songs while the sheet stays open. Mobile: up/down arrows or swipe in the sheet.

### LIB-17 Edit mode without layout jitter
1. Press the pencil.
Expected: fields turn editable in place with no layout shift; button toggles to Cancel; Done/Save persists.

### LIB-18 Delete song with usage warning [destructive]
1. In edit mode, Delete a song used in setlists.
Expected: warning like "this is in 3 setlists"; deleting unlinks gig media from the song but never deletes media; removed from setlists (unspecified, see Ambiguities).

### LIB-19 "Used in" list
Expected: the sheet lists gigs/setlists that use the song.

### LIB-20 Song Videos section
Section: Link media to a song.
Expected: "Videos" section lists videos linked to the song across gigs grouped by gig (title and date, newest first), each opens the single-item viewer; linked photos follow.

### LIB-21 Song Files section
Section: Files tab.
Expected: song's "Files" section lists both gig media links and Drive file/folder links; trashed or gone items show as unavailable.

### LIB-22 Import playlist, summary
Tags: [real-spotify] for real; fake mode uses fake playlists.
1. Import a playlist; wait.
Expected: progress indicator, then summary like "52 added, 8 already in library"; duplicates skipped.

---

# Open references and song notes

### REF-01 Add reference rows
Section: Add/edit song form; Song notes.
1. In a song form tap plus under Reference; enter label and value (for example "lyrics" and a URL, "Key" and "F# minor, 105 bpm").
Expected: row added; imports add their own row automatically.

### REF-02 URL values render as links with favicon
Expected: only values that are actual URLs render as tappable links with the site's favicon; plain values render as plain text (no favicon, no link style).

### REF-03 Free-form notes
Expected: optional notes field below references; saved and shown (for example "capo on 2"); shown in stage mode under the title.

### REF-04 Reference label autocomplete
Section: Execution plan 6.x Gate 4 notes (tag autocomplete). Unspecified in design; verify and note.

### REF-05 Reference section named "Reference"
Expected: label reads "Reference" (previously "Links"), and "Open references" surface on setlists per plan (verify in setlist sections of gig drawers whether song references are reachable).

---

# Spotify

### SPOT-01 Lazy Spotify login, not at signup
Section: Playlists & Spotify auth.
Expected: signup and first sign-in never ask for Spotify. Track lookup and search work without login.

### SPOT-02 Playlist import requires Spotify login [real-spotify]
1. Import a playlist link while not connected.
Expected: import dialog shows a connect step; after login the import proceeds. Account must be in the Spotify app's User Management.

### SPOT-03 Private or missing playlist while logged out [real-spotify]
1. Paste an inaccessible playlist link.
Expected: "Can't see this playlist. It might be private" with a "Log in with Spotify" button; after login the link is retried automatically; still failing shows "playlist not found".

### SPOT-04 Export library to Spotify [real-spotify]
1. Library header, "Export to Spotify"; edit name; confirm.
Expected: first export asks for playlist-modify scopes and resumes after the round trip; creates a private playlist; "Open in Spotify" link shown.

### SPOT-05 Export a setlist [real-spotify]
1. In a gig or practice setlist section, "Export to Spotify".
Expected: same dialog and result for the setlist.

### SPOT-06 Skipped songs message [real-spotify]
1. Export a setlist containing manual, original, or YouTube-only songs.
Expected: clear message like "3 songs weren't added because they're not on Spotify".

### SPOT-07 Connect and disconnect in personal settings [real-spotify]
Expected: Spotify connection row with connect and disconnect; after disconnect, import prompts login again.

### SPOT-08 Large import progress [real-spotify]
Expected: progress indicator and summary.

### SPOT-09 Export dialog in fake mode
Tags: fake mode.
Expected: export dialog works against the fake; skipped-songs message shows for manual songs.

---

# Stage mode

### STAGE-01 Open from a gig
1. In a gig drawer with a setlist press "Stage mode".
Expected: opens `/gigs/:id/stage`: full-screen, dark background, very large high-contrast text.

### STAGE-02 One song at a time
Expected: current title huge with its notes underneath, next song smaller below, position indicator like "4 of 12". No whole-setlist view.

### STAGE-03 Tap to advance
1. Tap anywhere.
Expected: advances to next song; position updates. On the last song: behavior not specified.

### STAGE-04 Swipe back
Tags: [mobile] (or simulated touch).
1. Swipe back after advancing.
Expected: returns to previous song.

### STAGE-05 Screen wake lock
Expected: wake lock acquired in stage mode (verify via navigator.wakeLock or a status indicator if exposed).

### STAGE-06 Position persists
1. Advance to song 3; reload.
Expected: resumes on song 3 (per setlist, per device).

### STAGE-07 Offline
1. Open the app online (so cache fills), open stage mode, then go offline (Playwright setOffline) and reload `/gigs/:id/stage`.
Expected: stage page loads and works from the service worker and cached setlist and notes. Limitation: the app must have been opened online after the last setlist update.

### STAGE-08 Gig with empty setlist
Expected: stage mode shows an empty state or is disabled (unspecified).

---

# Gig media

### MEDIA-01 Unlinked Drive prompt
Section: Linking Google Drive.
1. In a band with no Drive, open a gig's media section.
Expected: "This band hasn't been linked to a Google Drive yet" and a button to link now.

### MEDIA-02 Drawer preview strip
Expected: 3 or 4 recent thumbnails plus count (for example "24 photos, 6 videos"); the strip opens the full-screen view. Empty gig: shows an empty state with Add media.

### MEDIA-03 Open full-screen media view
1. Tap the strip.
Expected: `/gigs/:id/media`, grows from the drawer (animation skipped for reduced motion or direct loads); closing collapses back. Opens view-first.

### MEDIA-04 Empty state
Expected: one large upload button.

### MEDIA-05 New gig starts with no subfolders
Expected: only Unsorted section; files land in Unsorted until folders are created.

### MEDIA-06 Create folder
1. Use the + FAB, "New folder"; name it "Flyer".
Expected: new section appears; folder also exists in Drive (fake Drive).

### MEDIA-07 Folder rename, reorder, delete [destructive]
Expected: folders can be renamed, reordered, deleted.

### MEDIA-08 Upload via FAB
1. + FAB, Upload; pick several image and video files.
Expected: thin bottom tray slides up, one thumbnail tall, scrolls horizontally; square rounded thumbnails with truncated file name; uploads auto-start.

### MEDIA-09 Per-item progress
Expected: item gray with no border, blue border traces clockwise from top-left, full color when done, then flies into its folder section (Unsorted by default).

### MEDIA-10 Batch progress bar
Expected: thin straight bar along the tray's top edge fills left to right.

### MEDIA-11 Tray header strip
Expected: bulk folder selector (default Unsorted), bulk song picker, cancel-all with an "are you sure" confirm.

### MEDIA-12 Per-item folder, rename, cancel
Expected: set folder per item before/during upload; rename inline; cancel mid-flight, items independent.

### MEDIA-13 Keep-open note and wake lock
Expected: "keep this open" note while uploading; screen wake lock active during the batch and released after.

### MEDIA-14 Close-and-return
1. Start uploads, reload mid-upload.
Expected: tray shows finished items and marks unfinished "re-add to finish"; re-picking resumes or skips already-uploaded files.

### MEDIA-15 Selection model
1. Tap thumbnails to select and deselect.
Expected: tapping toggles selection and never cancels uploads. With a selection, an action bar appears and section headers become "move here" targets. Action bar: cancel and move to folder for any count; rename only for exactly one item; Select all (flips to Deselect all) always present and reachable from the gallery header (Select FAB toggles selection mode).

### MEDIA-16 Move media to a folder
Expected: with items selected tap a section header; items fly in, filed at the end of that section. Items can be moved while still uploading. On desktop, drag tiles (or the selection) onto sections works too (secondary).

### MEDIA-17 Collapse and jump
Expected: section headers collapse and expand; one pair of jump FABs goes to previous or next section; collapsed state is not persisted.

### MEDIA-18 Density toggle
Expected: large preview, compact preview, names-only rows; persists per device. Names-only list view: tapping the name renames; trailing selection circles.

### MEDIA-19 Quick rename
1. Tap a name label under a thumbnail.
Expected: inline rename in both tray and gallery; tap area spans the thumbnail width (~44pt); tapping the picture selects it. No double-tap rename.

### MEDIA-20 Single-item viewer
1. Tap a photo (no selection).
Expected: full-screen viewer, swipe between items, share and download buttons; name is click-to-rename; song link shown and changeable/clearable. Videos play (Range support).

### MEDIA-21 Download
Expected: single item via viewer download; multi-select on desktop gives a zip; multi-select on mobile uses the native share sheet (Web Share with files) to save to Photos; whole gig/folder links out to the gig's Drive folder.

### MEDIA-22 Delete media [destructive]
Expected: only band members can delete; item moves to Drive trash (recoverable), disappears from the app.

### MEDIA-23 Real iPhone upload to real Drive [real-google] [mobile]
1. Real Drive linked; upload photos and videos from a phone.
Expected: resilient upload; appears in the gig's Drive folder; thumbnails are real.

### MEDIA-24 Link media to song
Section: Link media to a song.
1. Gallery action bar "Link to song" on a selection; also per item and bulk in the tray.
Expected: picker reuses the library drawer (search, tap to pick, add a song in place) with gig setlist songs first. Linking an item not manually renamed renames it to the song title (extension kept, " (2)" suffix on clash) in app and Drive; manually renamed items keep their name; unlinking never renames. Tile and viewer show the song title.

---

# Public upload links

### UPL-01 Create upload link
Section: Shareable Upload Links.
1. Gig drawer, "Share upload link"; choose expiry 1, 7, or 30 days after the gig.
Expected: link shown with copy and share.

### UPL-02 Public page signed out
1. Open `/u/<token>` signed out.
Expected: upload page for that one gig only, optional uploader name; no other event or app info; no folders shown.

### UPL-03 Public upload lands in Unsorted
Expected: uploaded files appear in the gig's Unsorted section (and Drive).

### UPL-04 Type and size limits
1. Try an executable or other non-image/video file.
Expected: rejected. Limits per design: 4 GB per file, 50 GB per link (not practical to test fully; verify messages if reachable).

### UPL-05 Turn off and new link [destructive]
1. Turn off the link; open it. Create a new link.
Expected: old link is dead (error page); a new token is issued.

### UPL-06 Expired link
Expected: expired link is rejected with a clear message (needs fake time or seeded data).

### UPL-07 Rate limit
Expected: excessive uploads per link or IP are rejected (per-link and per-IP limits). Not exhaustively testable; note observed behavior. CAPTCHA and malware scanning are not implemented (follow-ups).

---

# Files tab

### FILE-01 Files tab exists
Section: Files tab.
Expected: third tab "Files" (before Roster).

### FILE-02 Unlinked state
Expected: with no Drive linked, the tab prompts to link Drive (DRIVE-01).

### FILE-03 Browse and breadcrumbs
1. Open folders deeper; use breadcrumbs.
Expected: Drive-style listing; breadcrumbs navigate up; never leaves the Files root.

### FILE-04 Root containment
1. Try URL manipulation to a folder id outside the root.
Expected: rejected (descendant check).

### FILE-05 List and grid views
Expected: both available; Drive style table on desktop.

### FILE-06 Create folder, rename, trash [destructive]
Expected: all members can create folders, rename, and trash (Drive trash, recoverable).

### FILE-07 Upload into any folder
Expected: upload into the current folder; open or download a file.

### FILE-08 Gigs root look
Expected: gigs root has its own icon and label; gig folders show calendar badge, gig title and date.

### FILE-09 Gig folder opens media page
1. Tap a gig folder.
Expected: opens the gig's media page instead of listing it.

### FILE-10 Deleting a gig folder is blocked
1. Try to trash a gig folder in Files.
Expected: blocked with message to delete the gig instead; media stays in Drive.

### FILE-11 Link existing folder to gig (from Files)
1. On a plain folder choose "Link to gig", pick a gig that has no folder.
Expected: folder attached; its files and subfolders imported as the gig's media; a folder already used by another gig is refused.

### FILE-12 Link existing folder to gig (from media page)
Expected: same from the gig's media page.

### FILE-13 Song links for files and folders
1. On a file and a folder choose "Link to song"; pick songs (many-to-many).
Expected: song's Files section lists them; a trashed or gone file shows as unavailable.

### FILE-14 Change gigs root
Expected: can be changed in settings; only affects where new gig folders are created.

### FILE-15 Files added directly in Drive
Tags: [real-google] (fake Drive has a control endpoint only in tests).
Expected: outside-added files appear within the poll interval (about a minute) in the matching folder section or Unsorted.

### FILE-16 Missing file placeholder
Expected: deleted-in-Drive file shows "no longer in Drive" placeholder instead of a broken thumbnail.

---

# Google Drive linking

### DRIVE-01 Link flow (fake)
Section: Linking Google Drive.
1. Band settings (admin), Google Drive, Connect (demo account), pick a folder from the stand-in Picker.
Expected: linked; asks for a gigs root (existing folder inside it, or create a new "Gigs" folder); Profile photos folder created next to it; import never moves or renames anything.

### DRIVE-01R Link flow (real) [real-google]
Expected: Google consent (one-time "unverified app" screen for the linking admin only), real Google Picker, never the Drive root.

### DRIVE-02 Link from gig drawer media section
Expected: same flow reachable from the unlinked prompt.

### DRIVE-03 Non-admin cannot link
Tags: [needs-two-users].
Expected: Band settings Drive connection is admin-only. (What a non-admin sees at the media prompt is unspecified.)

### DRIVE-04 Profile photos stored in Drive
Expected: band photo and member photos stored under "Profile photos"; before linking, avatars fall back to Google photo or initials.

### DRIVE-05 Per-gig folders created lazily
Expected: folder created on first media interaction, named `YY-MM-DD <title>`; existing folders are not renamed.

### DRIVE-06 Poller reconciliation
Expected: renames and moves in Drive do not break items (stable file IDs); deletes show a placeholder.

### DRIVE-07 Disconnect / change folder
Unspecified (see Ambiguities).

### DRIVE-08 Ownership note
Expected: no enforcement of dedicated vs personal account.

---

# Google Calendar sync

### GCAL-01 Unlinked banner on Events
Section: Linking Google Calendar.
Expected: dismissible banner offering "Sync to Google Calendar"; Events works fully without it; also in Band settings.

### GCAL-02 Connect (fake)
1. Press Sync to Google Calendar (admin).
Expected: dedicated calendar named after the band is created; existing gigs and practices pushed; Band settings shows "last synced".

### GCAL-02R Connect real [real-google]
Expected: calendar owned by the service account; members added to the calendar ACL as readers at their calendar email (sign-in email fallback); each accepts once. No attendees on events.

### GCAL-03 Edit in app propagates
Expected: change an event's time in the app, appears in Google after the sync interval. [real-google] for the real check.

### GCAL-04 Edit in Google propagates [real-google]
Expected: pulled every minute; last-write-wins using etags; delete wins on either side.

### GCAL-05 Recurrence round-trip [real-google]
Expected: a recurring practice, an overridden occurrence, and a canceled occurrence appear correctly in Google (instance exceptions).

### GCAL-06 Delete wins
Expected: delete in Google beats concurrent edit in app and vice versa.

### GCAL-07 Calendar email
Section: Calendar email.
Expected: personal settings field, default sign-in email; shares go there.

### GCAL-08 RSVPs stay in the app
Expected: Google RSVP sync is not supported (post 2026-10-30 update); see Ambiguities.

### GCAL-09 Non-admin cannot connect
Tags: [needs-two-users].

---

# Public gig calendar

### PUB-01 Link in Band settings and from Events
Section: Public gig calendar.
Expected: Band settings shows link with Copy and Reset (admin). On Events an export icon beside the month heading opens a dialog with the link, copy button, and admin-only reset button; hidden until the link loads.

### PUB-02 Public page
1. Open `/c/<token>` signed out.
Expected: band name, photo, bio, social links, booking contact at the top; list of upcoming shows by default; toggle to calendar view; read-only.

### PUB-03 Public fields only
Expected: shows only title, date, start time, venue name. Never: setlist, lineup, notes, point of contact, call time, media, practices.

### PUB-04 Per-gig toggle
1. Turn "Show on public calendar" off for a gig.
Expected: gig disappears from the public page.

### PUB-05 Reset link [destructive]
Expected: old link stops working; new link works.

### PUB-06 Invalid token
Expected: not-found page, no data leak.

### PUB-07 No access to the app
Expected: the public page has no nav into the app.

### PUB-08 Mobile layout
Expected: list default, readable on phones.

---

# Settings

### SETT-01 Personal settings sections
Expected: name, photo, instruments, calendar email, Spotify connection, log out, Delete account, Leave band.

### SETT-02 Edit name and photo
Expected: persists; photo per band when Drive linked.

### SETT-03 Instruments autosave
Expected: change instruments, no Save button needed; reload shows them.

### SETT-04 Band settings admin-only
Tags: [needs-two-users].
Expected: regular members do not see the Band section.

### SETT-05 Band name and photo
Expected: updates in the switcher.

### SETT-06 Band profile
Expected: social links (Instagram, TikTok, YouTube, Spotify), booking email, bio; shown on the public page.

### SETT-07 Google connections in Band settings
Covered by DRIVE-01, GCAL-02.

### SETT-08 Public calendar link in Band settings
Covered by PUB-01.

### SETT-09 Leave band
Covered by BAND-05 to BAND-07.

### SETT-10 Spotify connection
Covered by SPOT-07.

### SETT-11 Settings reachable on mobile
Expected: profile icon in header opens settings on phone.

---

# Account deletion

### ACCT-01 Type-to-confirm [destructive]
Section: Delete account.
1. Personal settings, "Delete account".
Expected: dialog requires typing a confirm string; button disabled until correct.

### ACCT-02 Deletes solo bands, leaves others [destructive]
Tags: [needs-two-users].
Expected: leaves every band; bands where the user is the only active member (roster-only do not count) are deleted; sessions, links, photo and data removed; past lineups keep the name; Drive files and Calendar untouched. User is signed out.

### ACCT-03 Blocked as last admin
Tags: [needs-two-users].
Expected: if last admin of a band with other active members, deletion blocked and lists those bands.

### ACCT-04 Unblock then delete
Expected: after promoting someone, deletion succeeds.

### ACCT-05 After deletion
Expected: signing in again creates a brand-new account with no bands.

---

# Feedback widget

### FB-01 Widget visible
Section: Feedback.
Expected: feedback icon in the header, available to any signed-in user.

### FB-02 Submit feedback
Expected: submit text; success confirmation (fake GitHub adapter in fake mode; real mode needs GITHUB_FEEDBACK_TOKEN and creates a GitHub issue). Empty submit blocked.

### FB-03 Mobile layout
Expected: widget usable on phone.

---

# Cross-cutting

### XC-01 Responsive layout
Expected: no horizontal scroll at 390px and 1440px; tabs switch bottom/top; drawers behave per viewport.

### XC-02 Phone drawers stack
Expected: second drawer slides over the first with the first peeking.

### XC-03 Dark mode
Not specified except stage mode (always dark). See Ambiguities.

### XC-04 Cookie per environment
Expected: staging uses a staging-specific session cookie name; production cookie not accepted.

### XC-05 Time zones
Expected: times consistent with the band and viewer's timezone (date-fns-tz); not specified further.

### XC-06 Offline outside stage mode
Expected: app shell cached by service worker; other pages may not work offline. Verify nothing crashes.

### XC-07 Reduced motion
Expected: media morph animation skipped.

### XC-08 Notifications and comments absent
Expected: no notifications, comment threads, money tracking, or lyrics viewer exist.

### XC-09 Loading, error, and retry
Expected: failed network requests show an error rather than a blank page (TanStack Query retries).

### XC-10 Accessibility labels
Expected: icon-only buttons have aria-labels (Edit, Close, etc.).

---

# Ambiguities (design doc unclear or conflicting)

1. Google Calendar: the "Linking Google Calendar" section still describes attendees, RSVP from Google, gig invites to all members, and two-way RSVP sync, but the 2026-10-30 update says events carry no attendees and Google RSVP sync is unsupported. Practices section also says marking "not going" updates Google. Which applies to RSVP-04 and GCAL-08?
2. "RSVP/availability on gigs: skipped" versus the Calendar section's gig invites to all active members. Gig RSVPs ignored in Google.
3. Setlist "Keep vs Replace" prompt details and what "Replace" does to later custom setlists when earlier occurrences are edited are described only partially.
4. Deep link `/practices/:seriesId` without `date` for a recurring series is unspecified.
5. Deep link to a resource in a band the user does not belong to: UX unspecified.
6. Invalid, expired, or reset invite link error behavior is unspecified.
7. Deleting a song that is in setlists: whether it is removed from setlists is not stated (only that a warning shows and media is unlinked).
8. Library drag: "drag into the setlist at a position" (execution plan 4.1) versus "append-only library drag" (Gate 3 notes).
9. Stage mode on the last song, on an empty setlist, and behavior when tapping Stage mode with no setlist is unspecified.
10. Roster-only members in practice attendee lists and RSVPs are unspecified.
11. Dark mode: only stage mode is specified dark; app-wide dark mode is not described.
12. Discard-changes confirm is marked "Flag (maybe, not now)" in Exiting the drawer but later sections treat it as present (Drawers are non-modal).
13. Agenda opening by default (Gate 3 notes) versus "opened via a floating button" (design).
14. Non-admin experience at the unlinked Drive prompt (who can link) is unspecified; Band settings is admin-only.
15. Disconnecting or changing the linked Drive folder or Calendar is not described (only the gigs root can be changed).
16. Public upload link CAPTCHA and malware scanning are optional safeguards and flagged as not built; testers should not expect them.
17. Calendar month cell overflow behavior for many events is unspecified.
18. Practice "cancel" display (canceled chip versus removed) is unspecified.
19. Whether the Files tab and gigs root appear when Drive is unlinked, and the exact copy of Files-specific messages, are unspecified.
20. Spotify playlist import in fake mode versus real: only real mode exercises the User Management restriction.

---

# Observed behaviors

Current app behavior recorded from the walkthrough (issue #35). These are documented as-is, not filed as bugs.

- `/practices/:seriesId` without a date shows the calendar and opens no drawer.
- Desktop share confirmation is an icon swap to a check, with no toast.
- A foreign-band gig id for a signed-in multi-band user shows "This link doesn't exist or you don't have access".
- Leave band for the only member is presented as "Delete band" with a typed-name confirm.
- The agenda is open by default on wide screens and closed on phones.
- "This and following" is hidden when an occurrence date changes; "This event" is hidden when recurrence changes.
- Roster-only members appear with no response in attendee lists.
- Fake Places only knows Bowery Ballroom, The Troubadour and Exit/In.
- Applying an RSVP to "All events" overwrites an earlier "This event" RSVP on that occurrence.
- The last stage song shows "END OF SETLIST" and stays put. An empty-setlist gig hides the Stage button; the direct URL shows "This gig has no setlist yet."
- Past gigs with empty setlists are omitted from the copy-from-past-gig list.
- Fake Spotify imports 10 demo tracks for any unknown playlist id.
- Deleting a song removes it from all setlists after a count warning.
- Gig sync pushes gigs from about two weeks ago forward only.
- Demo band members count as active members for ACCT-03.
- Disconnect Drive / Calendar exist as buttons; behavior is not exercised (DRIVE-07).
- The details pencil hides in favor of the footer Cancel / Save changes.
