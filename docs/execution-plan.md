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
- **Google Cloud project:** create the project; enable Drive, Calendar, Picker, and Places APIs; configure the OAuth consent screen (keep it in Testing mode and add the band members as test users, which avoids Google verification for the full drive scope); create OAuth client IDs and a Places/Picker API key. Status: Not started
- **Spotify developer app:** create the app; set the redirect URIs; copy the client id and secret. Status: Not started
- **Magic-link email provider:** decided: Resend. Create the account and verify the sending domain. The DNS records can then go to the orchestrator. Status: Not started
- **Sentry:** create the org and projects and copy the DSNs. Status: Not started
- **Accounts + logins:** create accounts for Fly.io, Cloudflare, and GitHub with billing set up, then log in to the CLIs once on the dev machine (`fly auth login`, `gh auth login`) and create a scoped Cloudflare API token. GitHub + `gh` login done; Fly.io + `fly` login done (flyctl in `~/.fly/bin`, not Homebrew); Cloudflare API token in Keychain (`CLOUDFLARE_API_TOKEN`) with zone access verified. Status: Done
- **Secrets:** put the keys above in a local .env / Fly secrets, or hand them to the orchestrator to set. Status: Not started
- **Real test accounts for Phase 8:** a Google account and a Spotify account the walkthrough agent can use, with any 2FA prompts handled by the user. Status: Not started

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

🛑 **GATE 1: Component library review.** User reviews the showcase page on desktop and phone. Status: Awaiting review (round 2; round 1 fixes deployed 2026-10-20: sliding segmented toggle, Calendar tab renamed Events, non-modal drawers, stacked library drawer on phones, iOS keyboard fit, right sheet animation on phones, Links renamed Reference with plain values not linked). Re-review at https://staging.greenroom.fyi/showcase

# Phase 2: App shell
- **2.1 Shell + navigation.** Three tabs (Events, Music Library, Roster); bottom bar on mobile, top tabs on desktop; band switcher next to profile icon; settings behind profile icon. Status: Not started
- **2.2 Deep links.** Routes for gigs, practice occurrences, songs; open the right view with drawer or sheet open; auto-switch band; share button (copy / native share). Status: Not started

# Phase 3: Core tabs
Parallel group 3A
- **3.1 Events tab (calendar).** Month/week views, all-day strip, chips, today marker + jump to today, FAB + click-a-day create, split drawer, gig form (all gig fields, Places type-ahead), practice form (RRULE-compatible recurrence, end conditions), edit scope dialog (this / this and following / all), discard-changes confirm, gig delete (Drive media untouched, warning). Status: In progress (backend API built 2026-10-20 with 23 API specs, under orchestrator validation; UI waits for Gate 1)
- **3.2 Agenda sheet.** Right-side sheet, one timeline with today line and past-card peek, cards, gig/practice filter, opens event drawer beside or over. Status: In progress (range listing API is part of the 3.1 backend; UI waits for Gate 1)
- **3.3 Music Library.** Smart add input (Spotify/YouTube links, Spotify search, manual), progressive disclosure, song detail sheet (view/edit, links with favicons, notes, used-in, delete warning), list, search, sorts, duplicate check, playlist import with progress + summary, Songsterr suggestion. App-level Spotify credentials only. Status: In progress (backend API + pg-boss JobsModule built 2026-10-20, under orchestrator validation; real Spotify/YouTube/Songsterr adapters are still stubs and need the Spotify app credentials; UI waits for Gate 1)
- **3.4 Roster + Settings.** Member cards, member detail sheet, invite link button, admin actions (promote, remove, reset link), leave band + last-admin rules, personal and band settings. Status: Not started

🛑 **GATE 2: Core UI review.** Calendar, agenda, library, roster, settings. Status: Not started

# Phase 4: Setlists + lineup
- **4.1 Setlists.** Library drawer beside the event drawer with drag-in, phone tap-to-add fallback, drag-to-reorder, running total time, duplicate a past setlist (search gig history), add-song-in-place (adds to library and setlist), practice setlists with this-and-following + custom-setlist warning. Status: Not started
- **4.2 Lineup.** Roster drawer with the same drag/tap mechanic, default full band, copy-from-last-gig button. Status: Not started

🛑 **GATE 3: Setlist and lineup feel review** (drag on desktop, tap fallback on phone). Status: Not started

# Phase 5: Integrations
Parallel group 5A
- **5.1 Google Calendar sync.** Lazy link banner, dedicated band calendar, members as attendees, two-way sync with etags and last-write-wins, delete wins, recurrence round-trip, RSVPs mapped to attendee status (accepted / tentative / declined / needs action), single RSVP list in the practice drawer. Status: Not started
- **5.2 Google Drive link.** Unlinked state, Google sign-in + Picker, full drive scope, Gigs folder structure, file-ID references, changes-API poller, missing-file placeholders. Status: Not started
- **5.3 Spotify user auth.** Add a Spotify user-OAuth adapter + fake (auth URL, code exchange, refresh; not in the 0.4 adapter set). Lazy login, export library/setlist to playlist (skipped-songs message), private playlist import with retry flow. Status: Not started

# Phase 6: Media
- **6.1 Upload backend.** Server-brokered chunked uploads to Drive resumable sessions, progress tracking, resume/skip on re-add. Status: Not started
- **6.2 Media UI.** Drawer preview strip, full-screen view (static pop first), folder sections, collapsible headers, density toggle, Unsorted, upload tray with per-item border progress and batch bar, selection model + action bar, move/rename, single-item viewer with share/download, multi-download (share sheet on mobile, zip on desktop), delete to Drive trash, wake lock, keep-open note. Status: Not started
- **6.3 Public upload links.** Scoped, expiring, revocable, rate limited, type and size limits, lands in Unsorted. Status: Not started

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
- (none yet)

# Temporary
- **/status page.** Build-status tree at https://staging.greenroom.fyi/status, rendered from this file on GitHub `main`. Status: Done (live)
