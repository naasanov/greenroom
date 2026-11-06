# Walkthrough A: auth, bands, roster, app shell

Tester 1, slot 1 (web 3201, API 4201). Desktop 1280x800 plus mobile 390x844. Fake integrations. Screenshots are in
`/tmp/claude-1001/-home-dev-projects/7257d174-f735-587c-871d-3359d4518891/scratchpad/w/` (referenced below by file name).

## Results

| Flow | Status | Note |
|---|---|---|
| AUTH-01 | PASS | Fake Google passcode sign-in lands on /events. |
| AUTH-02 | PASS | Link-sent screen; link signs in; reused and garbage links show "This link did not work". |
| AUTH-03 | SKIPPED-REAL | real-google |
| AUTH-04 | PASS | New user gets name/instrument step, then "not in a band yet" with Create band and invite hint. Nothing auto-created. |
| AUTH-05 | PASS | Multi-select presets with icons, custom "Nyckelharpa" accepted, shows on roster card and in Settings. Cross-band sharing not checked. |
| AUTH-06 | PASS | Creator is Admin, lands on Events, Drive/Calendar shown as not linked. |
| AUTH-07 | PASS | Signed-out invite, sign in, welcome, lands inside the band as member. |
| AUTH-08 | PASS | Existing user joins via "None of these"; band appears in switcher. |
| AUTH-09 | PASS | /invite/... preserved through sign-in and welcome via redirectTo. |
| AUTH-10 | PASS | Old link shows "This invite link is no longer valid"; new link works. Reset needs a confirm dialog. |
| AUTH-11 | PASS | Sign out in Settings returns to /sign-in; /events redirects to sign-in. |
| AUTH-12 | PASS | /gigs/:id, /songs/:id, /practices/:id?date= all return to the original link with drawer/sheet open. |
| BAND-01 | PASS | Switcher left of tabs, with profile icon at right on both desktop and mobile; mobile tabs in bottom bar. |
| BAND-02 | PASS | Switch persists after reload and in a second context. Band settings entry present (see F9). |
| BAND-03 | PASS | Opening a gig of the other band switched current band and opened the drawer. |
| BAND-04 | PASS | Unknown/foreign id shows "This link doesn't exist or you don't have access"; user with no band sees create-band screen. Real foreign gig of a multi-band user not tested. |
| BAND-05 | PASS | Confirm "Leave Demo Band?"; user ends bandless. |
| BAND-06 | PASS | Blocked with "You are the last admin..."; after promoting another admin, leave succeeds. (F6) |
| BAND-07 | PASS | Delete dialog requires typing the band name; band removed. Drive/Calendar retention not verifiable in fake mode. |
| BAND-08 | PASS | Left member stays in lineup tagged "Left the band". |
| ROST-01 | PASS | Card list, same style as library; Roster is last tab. |
| ROST-02 | PASS | Right sheet on desktop, full screen on mobile, X close aria-label "Close", no gigs listed. |
| ROST-03 | PASS | Regular member sees plain "Invite link" button. |
| ROST-04 | PASS | Plus opens "Add manually" and "Invite" menu in the FAB spot. |
| ROST-05 | PASS | Invite sheet shows link with Copy link and Reset link. |
| ROST-06 | PASS | Card tagged "Not on Greenroom"; appears in lineup picker; no Make admin action (only Edit details, Remove). Name required. |
| ROST-07 | PARTIAL | "Is one of these you?" works; but claimed entry's notes and the user's own picked instrument were lost (F2). |
| ROST-08 | PASS | Make admin / Remove admin toggles badge; promoted user sees Band section in Settings. |
| ROST-09 | PARTIAL | Reset with confirm works and old link dies. Not checked whether regular members see Reset link in the invite sheet. |
| ROST-10 | FAIL | Removed member stays in future gig lineups (F1). Past lineups keep name. |
| ROST-11 | PASS | Member sheet has no admin actions for a regular member. |
| ROST-12 | PASS | Name-only card shows initial avatar, no icons. |
| ROST-13 | BLOCKED | Needs Drive link / photo upload; not exercised. |
| ROST-14 | PASS | New band roster lists only creator (Admin); FAB available. |
| NAV-01 | FAIL | Order is Events, Music Library, Files, Roster (doc says Roster third, Files fourth) (F3). |
| NAV-02 | PARTIAL | Desktop top tabs, no sidebar; mobile bottom bar confirmed. Swipe-does-not-switch not tested. |
| NAV-03 | PASS | /library survives reload; root opens /events. |
| NAV-04 | PASS | All five routes render. |
| NAV-05 | PASS | Profile icon goes to /settings (admins also see Band section). |
| NAV-06 | PASS | Gig drawer open at gig date. |
| NAV-07 | PARTIAL | Dated link opens that occurrence. Without date no drawer opens, just the calendar (ambiguity noted). |
| NAV-08 | PASS | Song sheet opens in library context. |
| NAV-09 | PARTIAL | Desktop: button copies a slug URL (/gigs/club-meridian-<id>) and icon turns to a check, which opens correctly. Mobile native share not testable headless. |
| NAV-10 | PASS | Signed-out /events and API both require auth (API 401). |
| NAV-11 | PARTIAL | Week view, agenda Gigs filter, library sort persist (localStorage). Media density not exercised. |
| NAV-12 | PARTIAL | Unsaved song edit not restored after reload. Collapsed media sections and scroll not tested. |
| NAV-13 | PASS | Covered by BAND-02. |
| NAV-14 | PARTIAL | Close/Share/Edit labels, chevron on bottom drawers, X on side panels OK. Song sheet edit mode shows an X icon labelled "Cancel", not text, next to the Close X (F5). |

Counts: PASS 36, PARTIAL 8, FAIL 2, BLOCKED 1, SKIPPED-REAL 1 (48 flows).

## Findings

**F1 (major) ROST-10 / BAND-05.** Desktop. Repro: Demo Band, put a member in a future gig lineup (Club Meridian, Nov 12), then Roster, member, Remove from band (or the member leaves via Settings). Open the future gig. Expected: removed from future lineups, only past ones keep the name. Actual: the member stays in the future lineup tagged "Left the band" (API `lineup` members have `left: true`; events `lineupUserIds` still includes the user, so Rooftop Sessions and Club Meridian still count them). Screenshot: lineup.png. Cause: probably removal only flips membership state, no lineup cleanup for future gigs.

**F2 (major) ROST-07 / AUTH-05.** Desktop. Repro: admin adds roster-only "Sam Sax" (Saxophone, sam@example.com, notes "plays on weekends"); new user opens invite, sign-in, picks Drums on the welcome step, taps "That's me" on Sam. Expected: entry merged, history and notes preserved, user's own instruments kept. Actual: user ends with Saxophone only (Drums lost), notes null in members API. Screenshots: claim.png, settingsB.png.

**F3 (minor, spec mismatch) NAV-01 / ROST-01.** All viewports. Tabs render Events, Music Library, Files, Roster; flows say Roster third, Files fourth. Screenshots: events.png, m-events.png. Either the doc or the app needs updating.

**F4 (minor) all pages, Drive not linked.** Every page load fires `GET /bands/:id/files/folder/root` returning 409 and logs a console error (also on /events, /library, /roster). Repro: sign in with a band without Drive, open DevTools. Expected: no failing request when Drive is unlinked. Suspect: Files tab prefetch in app shell.

**F5 (polish) NAV-14.** Desktop. Song sheet, tap pencil "Edit": header now shows two X icons (left Close, right "Cancel" icon). Gig drawer uses a text "Cancel" instead. Doc says Edit becomes text "Cancel". Screenshots: songedit.png, gigedit.png.

**F6 (minor) BAND-06.** Settings, as only admin with other members: Leave button is enabled and you must confirm "Leave Demo Band?" before learning you are the last admin; the message then appears in the card below the fold-ish. Expected: warning visible before confirming (or button disabled). Screenshots: lastadmin2.png.

**F7 (minor) validation scroll, Roster Add manually.** Desktop. Tap "Add to roster" with empty name: the sheet scrolls so the Name field and its "Enter a name." error are out of view. Screenshot: emptyname.png.

**F8 (polish) mobile Events, 390x844.** The agenda round button overlaps the bottom-right of the calendar grid (covers the Sat 5 Dec cell), and the plus FAB sits close below. Screenshot: m-events.png.

**F9 (minor) BAND-02.** A regular (non-admin) member of the current band sees "Band settings" in the switcher menu (inst user in Demo Band). Doc says admins. Did not check where it leads.

**F10 (polish) onboarding.** A user who leaves the welcome step without Continue is never asked again (next sign-in goes straight to the no-band screen, and /settings is reachable). Name defaults to the email local part. Also the sign-in recipe shows the "demo band" checkbox on invite sign-ins (test affordance, ignore).

**F11 (polish) invite.** Invite card counts roster-only entries ("6 members"). Signed-in existing member opening their own current invite link sees a "Join Demo Band" button. Delete band dialog has only a placeholder in the confirm input and no instruction to type the name.

## Ambiguities observed (not bugs)

- /practices/:seriesId without date: calendar shows, no drawer opens.
- Share confirmation on desktop is an icon swap to a check, no toast.
- Foreign-band gig id with a signed-in multi-band user shows "This link doesn't exist or you don't have access".
- Leave band for the only member is presented as "Delete band" with typed-name confirmation.
