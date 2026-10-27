# Greenroom Execution Plan

# How to use this doc (orchestrator instructions)
- [design.md](./design.md) is the source of truth for WHAT to build. This doc defines ORDER, parallelism, gates, and status.
- You are the orchestrator (Opus, in Claude Code). You do not write code. Spawn Sonnet sub-agents per task (see `CLAUDE.md` and `memory/`). Tasks in the same **parallel group** can run at once; groups and phases run in order. Within a group, never let two agents own the same file at the same time.
- Each sub-agent: read the referenced design doc sections, build the task, write Playwright tests for its acceptance criteria (Google/Spotify faked in automated tests), make sure everything passes, then report back. The orchestrator verifies the diff and reruns checks before marking a task Done.
- **Update the Status line on each task in this file** as work progresses: Not started → In progress → Done (or Blocked: reason). Work spans multiple sessions, so at the start of every session, read this doc and resume from the first unfinished task.
- **🛑 GATE = hard stop.** When you reach a gate, deploy to staging, set the gate to "Awaiting review," summarize what to look at, and STOP. Do not start later work until the user marks the gate Approved. If they give feedback, fix it first.
- If the design doc is ambiguous or a task conflicts with it, don't guess on product decisions. Note the question here under Open questions and ask.

# Manual setup (human tasks)
Things the orchestrator cannot fully do itself. Rule: hand work to the orchestrator via CLI only when that is genuinely faster than the user clicking through it. When a task needs one of these, check this list. If an item isn't done, mark the task Blocked and tell the user exactly what's needed.

**User does manually (browser consoles, payments, identity):**
- **Domain:** buy/confirm the domain and put it on Cloudflare. `greenroom.fyi`, registered on Cloudflare 2026-10-19. Status: Done
- **Google Cloud project:** create the project; enable Drive, Calendar, Picker, and Places APIs; configure the OAuth consent screen; create the OAuth client, a Places server key, and a Picker browser key. Steps and Keychain names in [manual-setup.md](./manual-setup.md#google-cloud-project). Status: Done (2026-10-26: project `greenroom-fyi` (number 236818643268) on its own Greenroom billing account, created with gcloud along with the APIs and both restricted keys; consent screen published to Production and the web OAuth client created in the console; all five values in the Keychain, .env, and staged on Fly staging)
- **Spotify developer app:** create the app; set the redirect URIs; copy the client id and secret. Steps in [manual-setup.md](./manual-setup.md#spotify-developer-app). Status: Done (2026-10-22: credentials in the Keychain, .env, and staged on Fly; add band members under User Management before they import)
- **Magic-link email provider:** decided: Resend. Create the account and API key; the orchestrator adds the DNS records. Steps in [manual-setup.md](./manual-setup.md#magic-link-email-provider). Status: Done (2026-10-26: domain greenroom.fyi added, DKIM/SPF/MX records live in DNS, RESEND_API_KEY in the Keychain; the real email adapter is still a stub)
- **Sentry:** create the org and projects and copy the DSNs. Steps in [manual-setup.md](./manual-setup.md#sentry). Status: Not started
- **Accounts + logins:** create accounts for Fly.io, Cloudflare, and GitHub with billing set up, then log in to the CLIs once on the dev machine (`fly auth login`, `gh auth login`) and create a scoped Cloudflare API token. GitHub + `gh` login done; Fly.io + `fly` login done (flyctl in `~/.fly/bin`, not Homebrew); Cloudflare API token in Keychain (`CLOUDFLARE_API_TOKEN`) with zone access verified. Status: Done
- **Secrets:** store each value in the Keychain on the dev Mac under its env var name (the remote factory gets none of these); the orchestrator loads them into .env and Fly. Steps in [manual-setup.md](./manual-setup.md#secrets). Status: Not started
- **Real test accounts for Phase 8:** a Google account and a Spotify account the walkthrough agent can use, with any 2FA prompts handled by the user. Steps in [manual-setup.md](./manual-setup.md#real-test-accounts-for-phase-8). Status: Not started

**Orchestrator does via CLI once logged in:**
- GitHub repo (done: `naasanov/greenroom`, public), branch protection, Actions secrets (`gh`).
- Fly.io apps, Postgres, secrets, deploys (`flyctl`).
- Cloudflare DNS records for the app, the API, and email (Cloudflare API token).

# Testing strategy
- **Per phase:** every task ships with Playwright end-to-end tests derived from its design doc section. External services (Google Drive, Calendar, Picker, Spotify, Songsterr, GitHub) sit behind adapter interfaces with fake implementations for tests. The full suite runs in CI on every change, so regressions surface immediately.
- **Final validation:** an LLM agent using the Playwright MCP walks the real app on staging, connected to the user's REAL Google and Spotify accounts (no fakes). It goes through the design doc section by section, exercising each feature and comparing behavior to the doc, and files every gap or bug as a GitHub issue.

# Phase 0: Foundation
Parallel group 0A
- **0.1 Monorepo + stack scaffold.** pnpm/Turborepo; Next.js frontend, NestJS backend, shared types package (DTOs + Zod). TypeScript end to end. Status: Done
- **0.2 Database.** Postgres, migrations, core schema (users, bands, memberships, roles, events, recurrence, songs, setlists, lineups, media metadata). Starting input: [data-model.md](./data-model.md), a rough draft only, not the source of truth; change it freely. Status: Done
- **0.3 Infra.** Fly.io apps (frontend, backend, Postgres), Cloudflare DNS with app and API subdomains, staging environment, CI. Status: Done (staging live at staging.greenroom.fyi / api.staging.greenroom.fyi; prod not created yet; runbook in `infra/fly/README.md`)
- **0.4 Test harness.** Playwright setup, seeded test data, adapter interfaces + fakes for every external service. Status: Done

# Phase 1: Component library + Auth
Parallel group 1A
- **1.1 Component library / design system.** Bottom drawers, split drawer with slide + back arrow + swipe-back, right-side sheet, FAB, horizontal cards (Spotify-style), event chips, mobile bottom tab bar, desktop top tabs, band switcher + profile icon, icons (instruments, RSVP check/X/?), action bar, dialogs. Showcase page listing every component in its states. Status: Done (showcase at /showcase)
- **1.2 Auth.** Sign in with Google + email magic link in NestJS; sessions/cookies across subdomains (per-environment cookie names, see Hosting & domain in the design doc); post-login redirect to the original link. Status: Done
- **1.3 Bands + onboarding.** Signup (no auto band), create band, invite link (handles existing and new accounts), instrument picker (preset + custom, multiple), admin/member roles, multiple bands. Status: Done

🛑 **GATE 1: Component library review.** User reviews the showcase page on desktop and phone. Status: Approved (2026-10-20, after round 2 fixes passed CI and deployed to staging)

# Phase 2: App shell
- **2.1 Shell + navigation.** Three tabs (Events, Music Library, Roster); bottom bar on mobile, top tabs on desktop; band switcher next to profile icon; settings behind profile icon. Status: Done (2026-10-20: tabs are routes /events, /library, /roster; /settings behind the profile icon with Personal and admin-only Band sections; current band stored on the user server-side)
- **2.2 Deep links.** Routes for gigs, practice occurrences, songs; open the right view with drawer or sheet open; auto-switch band; share button (copy / native share). Status: Done (2026-10-20: /gigs/:id, /practices/:seriesId?date=, /songs/:id resolve via /links, switch band, open the drawer or sheet with a share button; event drawers show basic details until 3.1 and 3.3 replace them)

# Phase 3: Core tabs
Parallel group 3A
- **3.1 Events tab (calendar).** Month/week views, all-day strip, chips, today marker + jump to today, FAB + click-a-day create, split drawer, gig form (all gig fields, Places type-ahead), practice form (RRULE-compatible recurrence, end conditions), edit scope dialog (this / this and following / all), discard-changes confirm, gig delete (Drive media untouched, warning). Status: Done (2026-10-21: FullCalendar month/week, split create drawer, gig and practice forms, event drawer with RSVPs and edit scopes, deep links into the real calendar; replacing a drawer slides the old one down while the new one slides up over it; real Places adapter built 2026-10-21, live check waits for the Places API key)
- **3.2 Agenda sheet.** Right-side sheet, one timeline with today line and past-card peek, cards, gig/practice filter, opens event drawer beside or over. Status: Done (2026-10-21: agenda button above the FAB, one timeline with the pink today line and a past-card peek, window widens as either end is scrolled, gig/practice filter remembered per device, drawer opens beside the sheet on desktop and over it on phones)
- **3.3 Music Library.** Smart add input (Spotify/YouTube links, Spotify search, manual), progressive disclosure, song detail sheet (view/edit, links with favicons, notes, used-in, delete warning), list, search, sorts, duplicate check, playlist import with progress + summary, Songsterr suggestion. App-level Spotify credentials for search and lookup; playlist import uses the lazy Spotify user login (decided 2026-10-22, pulled forward from 5.3). Status: Done (2026-10-22: playlist import goes through a lazy Spotify connect step in the import dialog, with connect/disconnect in personal settings; live Spotify search and lookup verified, live user login waits for a real sign-in; earlier: 2026-10-21: library list, smart add sheet, song detail sheet, playlist import, real YouTube and Songsterr adapters; real Spotify adapter for search, track lookup, and public playlists built 2026-10-21 against stubbed responses; live check waits for the Spotify app credentials)
- **3.4 Roster + Settings.** Member cards, member detail sheet, invite link button, admin actions (promote, remove, reset link), leave band + last-admin rules, personal and band settings. Status: Done (2026-10-20: roster cards, member sheet with email and instruments, invite link button in the FAB spot, promote/demote/remove and invite reset for admins, leave band with last-admin and delete-band rules, personal settings (name, instruments, sign out) and admin band settings (name, bio, booking email, social links); no photo upload or per-member upcoming gigs yet)

🛑 **GATE 2: Core UI review.** Calendar, agenda, library, roster, settings. Status: Approved (2026-10-25, after feedback rounds 1 and 2; staging runs fake integrations, passcode sign-in via STAGING_LOGIN_PASSCODE in the Keychain)

# Phase 4: Setlists + lineup
- **4.1 Setlists.** Library drawer beside the event drawer with drag-in, phone tap-to-add fallback, drag-to-reorder, running total time, duplicate a past setlist (search gig history), add-song-in-place (adds to library and setlist), practice setlists with this-and-following + custom-setlist warning. Status: Done (2026-10-27: setlist section in the gig and practice drawers, edited live; library drawer beside the event drawer on desktop with drag-in at a position and drag-to-reorder, stacked over it on phones with tap-to-add check marks; copy from a past gig (replace or add to end); add a song in place; running total; practice setlists fork at the edited occurrence with the keep/replace prompt; a new gig or practice opens its drawer after create)
- **4.2 Lineup.** Roster drawer with the same drag/tap mechanic, default full band, copy-from-last-gig button. Status: Done (2026-10-27: lineup section with a roster drawer using the same drag and tap mechanic, remove per member, copy from last gig, former members tagged; new gigs default to the full band)

🛑 **GATE 3: Setlist and lineup feel review** (drag on desktop, tap fallback on phone). Status: Awaiting review (2026-10-27, staging deployed, CI green. Try on desktop: open a gig, Add songs, drag songs from the library into the setlist at a position, drag rows to reorder, Copy from a past gig, the + in the library to add a new song in place; Add people and drag or tap members in, Copy from last gig. Try on a phone: Add songs opens the library over the gig drawer, tap songs to check them, Done, then drag the handles to reorder. Practices: add songs to one occurrence of the weekly practice, check that earlier ones are unchanged and later ones follow; edit a later one, then an earlier one, to see the keep/replace question. Creating a gig or practice now opens it.)

# Phase 5: Integrations
Parallel group 5A
- **5.1 Google Calendar sync.** Lazy link banner, dedicated band calendar, members as attendees, two-way sync with etags and last-write-wins, delete wins, recurrence round-trip, RSVPs mapped to attendee status (accepted / tentative / declined / needs action), single RSVP list in the practice drawer. Invite each member at their calendar email (fallback: sign-in email) with attendee notifications on, so non-Google calendars like Outlook get invites and updates. Status: In progress (2026-10-27, started while Gate 3 is in review. Wave 1 done: real Google OAuth, Drive, and Calendar adapters and a per-band Google link flow (Drive and Calendar linked separately, any account). Wave 2 done: two-way sync backend (dedicated band calendar, all members invited at their calendar email, gigs and recurring practices with overrides, RSVPs both ways, etag last-write-wins, delete wins, pulled every minute). Wave 3 running: web UI (Events banner, Band settings connection, setup after connect))
- **5.2 Google Drive link.** Unlinked state, Google sign-in + Picker, full drive scope, Gigs folder structure, file-ID references, changes-API poller, missing-file placeholders, band and member photo upload into the "Profile photos" folder. Status: In progress (2026-10-27: wave 1 done (shared with 5.1); wave 2 done: folder setup after the Picker, Gigs and Profile photos folders, lazy gig folders, gig media API, changes poller every minute, band and per-band member photos. Wave 3 running: web UI (link flow with the Picker, media section unlinked state, photo upload))
- **5.3 Spotify user auth.** Export library/setlist to playlist (skipped-songs message), requesting the extra playlist-modify scopes on first export. The Spotify user-OAuth adapter, connection storage, and login-gated playlist import were pulled into 3.3 on 2026-10-22. Status: Done (2026-10-27: "Export to Spotify" in the library header and in gig and practice setlist sections; a dialog with an editable name creates a private playlist, asks for the extra playlist-modify scopes on first export and resumes after the round trip, then shows the skipped songs and an Open in Spotify link. Desktop specs green on the factory; mobile runs in CI only, since WebKit crashes on the factory)

# Phase 6: Media
- **6.1 Upload backend.** Server-brokered chunked uploads to Drive resumable sessions, progress tracking, resume/skip on re-add. Status: Not started
- **6.2 Media UI.** Drawer preview strip, full-screen view (static pop first), folder sections, collapsible headers, density toggle, Unsorted, upload tray with per-item border progress and batch bar, selection model + action bar, move/rename, single-item viewer with share/download, multi-download (share sheet on mobile, zip on desktop), delete to Drive trash, wake lock, keep-open note. Status: Not started
- **6.3 Public upload links.** Scoped, expiring, revocable, rate limited, type and size limits, lands in Unsorted. Status: Not started

- **6.5 Media linked to songs.** Song picker in the upload tray (per item and bulk) and a "Link to song" gallery action, built on the setlist library drawer components (`components/setlists/setlist-aside.tsx`, `song-row.tsx`) in single-pick mode with setlist songs first; linking renames items that have not been manually renamed to the song title (app and Drive); song tile label and viewer; "Videos" section on the song detail sheet grouped by gig. Schema and read shape land with 5.2. Status: Not started

🛑 **GATE 4: Media experience review** (try a real upload from an iPhone). Status: Not started

- **6.4 Grow/morph animation** from drawer to full-screen media and back. Status: Not started

# Phase 7: Remaining features
Parallel group 7A
- **7.1 Stage mode + offline.** Dark full-screen view, tap to advance, swipe back, wake lock, service worker caching upcoming setlists. Status: Not started
- **7.2 Public gig calendar.** Public fields only, per-gig toggle, list/calendar views, band profile header. Status: Not started
- **7.3 Feedback widget.** Posts to backend, which opens GitHub issues. Status: Not started

🛑 **GATE 5: Stage mode + public page review.** Status: Not started

# Phase 8: Validation
- **8.1 Full automated suite green** on staging. Status: Not started
- **8.2 LLM walkthrough via Playwright MCP** on staging with the user's real Google and Spotify accounts. Go through every design doc section, file gaps as GitHub issues. Status: Not started
- **8.3 Fix loop.** Resolve issues, re-run affected checks. Status: Not started

🛑 **GATE 6: Final sign-off.** Status: Not started

# Open questions
- (Resolved 2026-10-27) Member photos: set per band, stored in each band's Profile photos folder.

# Temporary
- **/status page.** Build-status tree at https://staging.greenroom.fyi/status, rendered from this file on GitHub `main`. Status: Done (live)
