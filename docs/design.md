# Greenroom Design Doc

> Source of truth for WHAT to build. Order, parallelism, gates, and status live in [execution-plan.md](./execution-plan.md). The draft schema lives in [data-model.md](./data-model.md).

# Overview
A web app for a small local band that plays a handful of gigs. The goal is to replace the group chat, which is where most coordination currently happens and isn't well suited to it. This doc is the source of truth and shared memory across multiple design sessions.

# Goals
- Be the band's home for structured info (gigs, practices, setlists, media) alongside the group chat. **Revised:** the group chat stays the main communication channel; the app does not try to replace it.
- Calendar integration (Google Calendar / general calendar) to track gigs and practices.
- Media handling tied to gigs: flyers, photos from gigs, and videos from gigs — the kind of content currently scattered across the group chat or an infrequently used Google Drive. Intended for posting to socials.
- Google Drive integration for media.

# Key Design Decisions
- Media should not be stored in the app itself; delegate storage to Google Drive if possible.
- Two-way sync with Google Calendar (see Practices).
- Calendar sync conflict resolution: last-write-wins, resolved via stored sync tokens/etags per event (not raw cross-system timestamp comparison, to avoid clock skew between Google and our server). Store Google's etag/updated token per event plus our own app-side updated-at column; on each sync, check whether Google's token still matches the last one we saw to detect which side wrote last.
- Deletes: delete always wins (a delete on either side beats a concurrent edit). Accidental deletes are handled app-side later via soft delete / undo window if needed, not by weakening the rule.

# Practices
- Recurring practices.
- In the app you set the practice, and everyone gets an invite and RSVPs (going / maybe / not going).
- You can mark that you're not making a practice from the app, and that updates Google Calendar.
- You can also decline on Google Calendar, and that updates the app (two-way sync).
- **RSVP display (in the practice drawer):** one attendee list, Google Calendar style, not separate lists. Going members show a check icon; not-going members show an X and sort to the bottom. **"Maybe" is supported** (maps to Google's tentative status) with a question-mark icon. Sort order: going, maybe, no response (neutral/no icon), then not going at the bottom.
- **RSVPs mirror Google Calendar's native RSVP system:** each member's response maps to the attendee response status on the Calendar event (accepted / tentative / declined / needs action), so the same check marks show in Google Calendar and in the app, synced both ways.
- Practices are cancelable.
- A single practice can be moved to a different day without moving the rest of the recurring series.
- **Editing or canceling a recurring practice works like Google Calendar:** when you change details (time, location, etc.) or cancel, you're asked to apply it to "This event," "This and following events," or "All events." This maps cleanly onto RRULE/Calendar sync. (Setlists keep their own "this and following" rule described under Practice form fields.)

# Open Questions
- (Resolved) Delegating media storage entirely to Google Drive: yes, see Storage, Upload Brokering, and Linking Google Drive.
- (Resolved) Resumable uploads for the iPhone failure problem: yes, server-brokered chunked uploads to Drive resumable sessions (see Upload Brokering & Resumable Uploads).

# Events & Gigs
- Gigs are also events on the same calendar, marked/distinguished in some way.
- Event types: there should be a concept of different event types (e.g. practice vs. gig).
- Gig events have a location, plus details. Possibly Google Maps integration so you can see photos of the venue.
- Each event has an upload media section right in the event.
- Media is organized into folders (superseded the earlier "tags" idea; see Media experience).

# Media & Google Drive Structure
- Proposed Drive layout: a top-level `Gigs` folder → a folder per gig date → folders per tag inside each date.
- Those tag folders would be surfaced/displayed within the app.
- Defensiveness against direct Drive edits (people will rename/move/delete in Drive, since Drive stays usable outside the app). Three layers, all included in the plan:
  1. Reference everything by stable Drive file ID, never by path or folder name — immune to renames and moves for free.
  2. Graceful handling of deletions: when a file ID returns 404 from Drive, show a "no longer in Drive" placeholder instead of a broken thumbnail, and flag it for cleanup.
  3. Active reconciliation via polling the Google Drive changes API (chosen over push-notification webhooks for this scale). Store a Drive change token; each poll asks for everything changed since that token and gets back just the diff plus a fresh token — cheap even when nothing changed, no full folder re-walk. Poll interval ~30s to a few minutes (sub-second freshness isn't needed for gig media); optionally only poll while the media view is open. Avoids webhook headaches entirely: no channel renewals, no public webhook endpoint to secure, and still gives a precise diff rather than a vague "something changed" ping.
- Problem: uploading directly to Google Drive from iPhone is unreliable — if the phone sleeps/turns off mid-upload, the upload usually fails.
- Want to make uploading as resilient and user-friendly as possible via the web app, even though keeping an upload alive in the background is largely controlled by the user's browser and may be hard.

# Shareable Upload Links
- Be able to share a link for uploading media — e.g. "the gig is done, drop all your media here," linking directly to that upload page.
- Could also share the link with friends/guests who took photos.
- Possibly a public upload page scoped to one event: lets people upload media for that event without exposing the rest of the event's info.
- Hardening for public/unauthenticated upload links (an open upload endpoint is an abuse vector, so lock it down):
  - Link expiry: upload links expire after a set window (e.g. a few days after the gig) so they're not live forever.
  - Rate limiting: cap uploads per link / per IP over a time window to prevent flooding.
  - File type allowlist: accept only expected media types (images/videos), reject executables and other arbitrary files.
  - File size caps: per-file and per-link total size limits.
  - Revocable links: the band can kill a link early if it leaks or gets abused.
  - Scope: a link only grants upload to its one event, never read access to other event info or the rest of the app.
  - Optional abuse safeguards to consider: a lightweight CAPTCHA or similar on the public page, and virus/malware scanning of uploads before they land in the shared Drive.

# Feedback
- A feedback widget at the top of the app that anyone can submit through — for UI issues or anything missed in the build.
- Feedback submissions go directly to the GitHub repo as issues — no separate admin interface needed. The widget posts to our backend; the server opens the GitHub issue (keeps GitHub credentials server-side, never client-side). Reuses the existing backend.
- Note: the overnight autonomous agent that reviews/fixes feedback is NOT part of this design or implementation — it's handled separately elsewhere, and was only mentioned in passing.

# Auth & Onboarding
- Flow: someone creates a band, then sends out an invite link.
- On clicking the invite, the app checks whether the person already has an account. If yes, add them to the band; if not, they sign up and then land in the band. One link handles both cases.
- Signup does NOT auto-create or auto-join a band. Signing up just creates the account. From there, two paths: (a) create a band, or (b) join an existing band via an invite link. The invite link is what signals which path you're on — an invited member (e.g. a new bassist) is never forced through a "create your band" screen they don't want.
- Decision: skip user search — invite links only. Simpler to build and discovery isn't needed for a small band.
- At signup, ask what instrument(s) the user plays. Pick from a preset list (each with a nice icon); also allow a custom instrument for things not in the list (e.g. oddball/traditional instruments). A user can play multiple instruments.

# Tech Stack

## Storage
- Keep media out of the database. The database only holds metadata — pointers (Drive file ID / URL), tags, and which gig/event each file belongs to.
- Google Drive acts as the object store for the actual files (consistent with the earlier no-in-app-storage decision).
- Database leaning: Postgres over Mongo, since the data (bands, users, events, RSVPs) is quite relational.

## Frontend / Backend / Repo
- TypeScript end to end.
- Next.js front end.
- Dedicated long-running Node backend (not serverless) to handle the chunk-streaming resumable uploads without timeout issues.
- Monorepo (e.g. pnpm workspace / Turborepo) containing frontend, backend, and a shared types package — shared DTO types (and possibly Zod schemas) so the API contract is enforced at compile time on both ends.

## Upload Brokering & Resumable Uploads
- Google Drive's API supports resumable uploads natively (a session URL you upload chunks against).
- Plan: route uploads through our own server rather than browser-direct to Drive, because (a) Drive credentials stay secure server-side, and (b) the public/shareable upload link needs a backend anyway.
- Flow: browser uploads chunks to our server → server streams them to Drive's resumable session → server tracks progress so an interrupted upload can resume.
- The database role is unchanged by this — it still just stores pointers and metadata; the resumable logic lives in the server brokering layer.
- Backend framework: NestJS. Chosen for its batteries-included feature set (DI, validation pipes, modules, auth guards) and especially its opinionated, consistent structure — which keeps the agent-driven, no-code development approach on well-trodden, predictable patterns across sessions.

## Login
- **Sign in with Google** as the primary option (the band already runs on Google for Drive and Calendar), plus an **email magic link** for anyone who doesn't want to use Google.
- Built into the NestJS backend (no separate paid auth service).

## Hosting & domain
- **Everything on Fly.io:** Next.js frontend, NestJS backend, and Postgres. One provider, one bill, one deploy setup, frontend and backend on the same private network. (Considered Vercel for the frontend; rejected in favor of single-provider simplicity for an agent-built app. Heroku also available but not preferred.)
- **Domain via Cloudflare** (DNS). App and API on subdomains of the same domain so auth cookies work smoothly. Domain: **greenroom.fyi** (registered on Cloudflare).
- Note: Cloudflare's proxy caps request bodies at 100 MB, which is fine because uploads are already chunked.
- Development approach: agent-written code, no-code iteration — the user is not reviewing code directly, so consistency and convention matter more than minimizing framework concepts.

# Setlists (new feature)
- Setlists per gig/event. The band revolves around songs, so this is core — build setlists tied to events, and a setlist can inform what a practice is working on.
- A setlist entry has a type / can carry multiple sources, to handle every case:
  - Spotify track — linked to a real Spotify track (title, artist, album art, duration pulled from the API).
  - YouTube link — any entry can carry a pasted YouTube URL. Covers songs on YouTube but not Spotify, and the band member who uses YouTube Music.
  - Manual entry — just a typed title/artist, for originals and anything not on a streaming service. Essential, not optional.
- Spotify integration (centerpiece):
  - Paste a Spotify playlist link → pull all tracks via the API to pre-populate a setlist with metadata + cover art. (Easy, high-impact direction.)
  - Spotify search → type a song, pick from results, add to setlist (build a setlist without an existing playlist).
  - Export direction: build a setlist in the app and push it back out as a Spotify playlist via the API (needs write scopes).
- Manual/non-Spotify entries + playlist export: when exporting a setlist to a Spotify playlist, skip entries that don't resolve to a Spotify track (manual entries, originals, YouTube-only songs). Surface a clear message like "3 songs weren't added because they're not on Spotify" so the short playlist isn't confusing.
- Auth note: Spotify integration needs the band to connect a Spotify account via OAuth; the export-to-playlist direction requires write scopes.
- YouTube Music note: no clean first-class public API the way Spotify has one, so a full YouTube Music streaming integration is genuinely harder / more of a workaround. The pasted-YouTube-link approach above deliberately sidesteps this and covers the same need far more simply.

## Setlist building UX
- Core insight: setlists are mostly similar gig-to-gig (a few songs added/removed). Design around "start from something that exists and tweak it," never rebuild from scratch.
- Master song library + per-gig setlists: maintain one pool of all the band's songs (Spotify / YouTube / manual), each added once. Building a gig's setlist = picking from the library and ordering, not re-entering song data.
- Duplicate a past setlist as a starting point: copy any previous gig's setlist, then add/remove the few differences.
  - Not limited to the last gig: browse the full gig history newest-to-oldest, and search the gigs list to jump to a specific past gig, then copy its setlist.
- Drag-to-reorder: definite feature (not optional), despite being a bit of extra front-end work — song order matters for sequencing a live show.
- Running total time as you build: since Spotify tracks carry durations, show a live running total so you instantly see if a set is too long/short without mental math. (Manual/YouTube entries without known durations just won't contribute to the total.)
- Rejected: saved "template" setlists — unnecessary once duplicating a past setlist covers the same need.

## Song notes & reference material
- Two distinct kinds of info, deliberately stored in different places based on lifespan:
- Per-song (lives on the song in the library, once — inherited by every gig that uses it):
  - Structured key-value pairs for reference links: e.g. key "lyrics" → link, key "Songsterr tabs" → link, key "chords" → link, etc. Flexible keys, value is usually a link.
  - A free-form notes field alongside the pairs for anything that isn't a link (e.g. "capo on 2").
- Per-gig (performance-specific tweaks): go in gig-wide notes on the gig itself — e.g. "longer version of Song X," "skip the bridge on Song Y."
- Decision: NO per-song-per-gig notes layer. That's a full matrix of data to build/maintain and is overkill for a handful of gigs; a line in the gig's notes carries the same info. Can promote to something structured later if it turns out to happen constantly.

# Gig data class (fields)
- Core/required: title, date & time. A gig can be dropped on the calendar with just these (e.g. a tentative gig) and fleshed out later — most other fields are optional by design, matching how bands actually book ("something that weekend, details TBD").
- Date & time: start and end, plus a separate call/load-in time (distinct from go-on time — "be there at 6, play at 9").
- Location/address: searchable via Google Maps / Places API type-ahead rather than manual address entry. (Same integration as the existing venue-photos Maps note — treat as one thing: Places API gives both address search and venue info/photos.)
- Lineup: who in the band is actually playing this gig (not everyone makes every gig).
- Point of contact: optional — booker / sound person, with phone or email.
- Setlist, notes (already covered).
- **Deleting a gig does NOT touch its Google Drive media folder.** The folder and files stay in Drive (photos are hard to recover). The delete confirm warns: the media will remain in Google Drive.
- Deferred (add later if useful, not now): status field (confirmed vs tentative), load-in / logistics details (parking, unloading).

# UI / Navigation
- **Tab placement (revised):** on mobile, a bottom tab bar like a native app, tap to switch (no swipe). On desktop, tabs across the top. **Rejected:** left-hand sidebar nav (the original plan). With only three tabs it's mostly empty space and takes width the calendar and setlists need.
- **LOCKED: three tabs, in this order — Calendar, Music Library, Roster.** The app opens to Calendar (the daily-use surface); Music Library second (used whenever building setlists); Roster last (rarely changes once everyone has joined).
- **Decision: NO separate Gigs tab.** The agenda/list sheet inside the Calendar tab already covers browsing past and upcoming gigs, the gig filter, and the duplicate-a-past-setlist flow.
- Settings is NOT a tab: it lives behind the profile icon.
- Rationale for not over-splitting: a tab should be a distinct way of working, not just a filter on the same data. Don't give practices and gigs each their own calendar-duplicate tab — three views of the same events means three places to look.
  - Practices live essentially entirely on the calendar; no separate home needed.
  - Gigs DO have a second life beyond "when" (setlist, lineup, media, contact = "manage this gig" work). The non-date view of gigs that's actually needed is a browsable gigs LIST — which the "duplicate a past setlist" feature already requires (browse gig history). Resolved: that list is the agenda sheet inside the Calendar tab, not a separate Gigs tab.
- Calendar tab: behaves like Google Calendar — month / week view toggle. Both practices and gigs appear on it, distinguished by type (color-coded / marked).
- How events render (borrow what fits from Google Calendar, drop the rest — we have far fewer event types than a general calendar):
  - All-day vs. timed distinction IS worth keeping: a gig with a date but no time yet (the tentative case) sits in an all-day strip at the top of that day. Once it has a time, it drops into its time slot. Maps directly onto the drop-it-then-flesh-out-later flow.
  - Month mode: no time grid. Show each day's events as chips (color-coded gig vs. practice, time as text on the chip). Month mode is for "what's coming up," not precise scheduling.
  - Week mode: light time grid (so you can see e.g. a practice at 7pm Tuesday), with the all-day strip on top.
  - Day mode: explicitly SKIPPED. Only pays off when a single day is crowded, which won't happen here; week already gives the time-of-day view. Don't build unless it's ever actually missed.
- Tapping an existing event: opens the SAME drawer, now populated, to view/manage it — edit the setlist, see the lineup, reach the media. This is the everyday action once the band is using the app, and the calendar is a main front door into a gig (the duplicate-past-setlist and media features all assume you can reach a gig).
- "Today": a clear today marker on the calendar plus a quick "jump to today" button to snap back after scrolling off to another month.
- Filtering (gigs-only / practices-only view): consciously DEFERRED — for a small band the color-coding is enough and the calendar is never crowded. Decided against rather than left open.
- Explicitly NOT adding (general-calendar bloat that doesn't serve a band): external calendar overlays, weather, travel-time.

## Agenda / list view (events as a list)
- Lives INSIDE the calendar tab — no new tab. A list is just another lens on the same events, not a different way of working. Also doubles as the browse-past-gigs surface the "duplicate a past setlist" feature needs.
- Opened via a floating button; pulls out as a sheet from the RIGHT. Deliberate spatial contrast: bottom drawers = create/edit one thing; right-side sheet = browse many. Helps build a mental model.
- Past and upcoming live together in ONE continuous timeline (no toggle between them), anchored by a "today" line (e.g. a blue line). Opens positioned on the today line: scroll down = soonest-to-latest upcoming, scroll up = most-recent-to-oldest past. Same sort, one axis — matches how you actually think about time (one timeline with "now" in the middle).
  - Signal that past is upward: show a sliver/peek of the most recent past card above the today line (a half-visible card is a universal "scroll up for more" cue). Chosen over an up-arrow + "past" caption, which is more explicit but more clutter.
- Cards: time-ordered rectangle cards stacked vertically. Summary view only — can't show everything.
  - On each card: title, date, time, and a type indicator (gig vs. practice). Time is worth including (identifying — afternoon vs. evening gig — and tiny). Maybe venue NAME on gigs; NOT the full address (address is post-open detail, not scan-time).
- Tapping a card opens the SAME event drawer, populated. On desktop it opens beside the sheet (to its left); on a narrow phone screen there's no room side-by-side, so it comes up over the sheet (consistent with the drawer elsewhere).
- Gig/practice/both filter lives HERE (a list genuinely benefits from "just gigs"), which is the same filter consciously deferred on the calendar itself — kept here, calendar stays unfiltered.
- Creating an event: click a day → a drawer slides up from the bottom. First choice inside the drawer is gig vs. practice, presented as a split: the drawer is cut vertically in half — left half is "Practice," right half is "Gig." Tapping a half slides the drawer horizontally to that side's form (gig form or practice form). Gives each type its own "room."
  - Must be easy to go back if you pick the wrong side: both a back arrow AND swipe-back to return to the split. The return trip has to be cheap so the choice never feels like a one-way trapdoor.
- Floating FAB (+ button) in the corner that opens the SAME event drawer — a way to add an event without first clicking a day on the calendar. More discoverable (universal "new thing" gesture) and handles the case where you don't have a specific date in mind yet (tentative gig). The drawer covers the FAB when open.
- Required fields: because the FAB entry has no day context, the gig form needs its own date field. Title + date are the only two required fields (a gig with no date has nowhere to live on the calendar, so date can't be optional); everything else stays optional, preserving the drop-it-and-flesh-out-later principle.
- Exiting the drawer discards the in-progress event. Flag (maybe, not now): if the user has actually typed something, show a "discard changes?" confirm so an accidental backdrop tap doesn't throw away a half-filled gig — but NOT on an untouched drawer.
- Gig form: title field + an (initially empty) setlist with an "Add songs" button (plus the other gig fields from the Gig data class section).
- Practice form fields: title; start time + duration; recurrence (how often it repeats + which day(s) — e.g. weekly, every 2 weeks, monthly, "every Tue & Thu"); end condition (never / until a date / after N occurrences); location as free text (practices aren't venue gigs); **optional setlist** that works exactly like the gig setlist (same library drawer, add/reorder, duplicate-a-past-setlist).
  - Recurring practices: each occurrence has its own setlist, but they're linked with "this and following" behavior. Changing the setlist on one occurrence (e.g. 10/4) applies that setlist to that occurrence and every later one in the series; earlier occurrences are untouched (past practices keep a record of what was worked on).
  - Conflict rule: by default the change overwrites forward. If any later occurrence has its own custom (individually edited) setlist, warn first, e.g. "10/18 has its own setlist. Replace it or keep it?" No prompt when there's nothing custom to lose.
  - Recurrence must map to what Google Calendar's API can represent (it uses the RRULE recurrence standard). Mirror RRULE's supported options rather than inventing custom recurrence that can't round-trip through Calendar sync.
- Bottom-drawer pattern throughout: chosen deliberately — thumb-reachable, touch/mobile-friendly, feels native when pulling the app up at a venue. Flow reveals only the next decision at each step (no wall of fields).
- Adding songs = second drawer: tapping "Add songs" slides up a second, thin drawer listing songs from the Music Library. If the library is empty, a big "Add song" button → paste a link / search Spotify / etc., which adds the song to the library. Then drag the song from the library drawer into the setlist in the gig drawer.
  - Same mechanic for lineup: a Roster drawer you drag people from into the gig, exactly like the song library. One drag gesture, learned once, reused for songs and people.
  - Two thin drawers open at once (library + gig) is the intended drag experience. Caveat: on a narrow phone screen side-by-side drag may not fit — fall back to tap-to-add there. Decided phone fallback:
    - On narrow screens the library drawer opens OVER the gig drawer (not side by side).
    - Tap a song to append it to the end of the setlist; it shows a check mark. Tap a checked song again to remove it.
    - Done returns to the setlist, where drag-to-reorder still works (single-list drag is fine on phones).
    - Roster drawer for lineup works exactly the same way.
- Default lineup for a new gig: default to the FULL band (most gigs are everyone; "start with all, remove who's out" is fewer actions than building up). Offer "copy from last gig" as a button/option, NOT as the default. Empty-by-default rejected — makes the common case annoying.

## Media experience (viewing/uploading a gig's media)
- Media lives INSIDE the gig, not in its own global tab — media is always media *of* a gig, not a separate activity. Reached by tapping the event (opens the populated drawer), where media is one section alongside setlist, lineup, contact. The gig is the hub for everything about that show.
  - Open thread (not now): the social-posting goal is cross-gig ("post our best shots from the last few months"), which a per-gig home serves weakly. Possible future lightweight "recent media across all gigs" view IF social posting becomes a real workflow. Not a tab, not yet.
- Folders, not "tags": reconciled with the existing Drive structure — Gigs → gig date → subfolders (e.g. performance videos, posed/after photos, flyer). The user mental model is folders (concrete, matches what they see in Drive), so on upload you pick which FOLDER a file goes in rather than applying an abstract tag. Same data, honest word.
- Upload UI: a big full-width "add media" button/box with a large center plus — both an obvious drag-and-drop target and the mobile tap-to-pick entry (choose from files / photos&videos / camera).
  - Once files are dropped/picked, the plus box becomes the queue: each file is a big row (the box is both the drop zone and the list). Per-row: its own progress bar, a folder picker (set before/during upload since folder = where it lands in Drive), rename, and cancel mid-flight.
  - Auto-start the queue once files land (don't force a manual "Start" — extra step for the common case). Per-row cancel covers the slow-connection case. This is where the resumable/resilient upload backend becomes visible: each item progresses and retries independently without affecting the others.
- Drawer is the doorway, full view is the room: the drawer stays the quick hub (gig info + a media preview — the add-media/preview rectangle). Interacting with the media opens a FULL-SCREEN media view scoped to that gig, where folders + thumbnail grid + upload queue get real space. (This is the right shape of the earlier "media tab?" instinct — not a global tab, a full screen scoped to one gig, reached through the gig.)
- Transition: the media rectangle grows out of the drawer and expands to fill the whole screen, collapsing back the same way. Purpose is spatial continuity (you know the full view came from this gig's media and where it returns to) — consistent with the app's physical language (drawers rise, split drawer slides, media grows).
  - IMPLEMENTATION NOTE (for later ticketing/sequencing): the grow/morph animation is genuinely some of the trickier front-end work (smooth morph from a small in-drawer box to full-screen and back, no flicker). It IS wanted — not a nice-to-have, it will happen — but sequence it AFTER the foundation. First iteration: static pop to full-screen, no animation; nail the core media UX (folders, grid, upload queue) first. Then add the grow animation as the follow-up layer. The content must work even if the morph is simplified.

## Media gallery & upload flow (detail)
- **Drawer preview:** minimal strip — 3–4 recent thumbnails plus a count (e.g. "24 photos, 6 videos"). Whole strip is tappable and opens the full-screen media view.
- **Full view opens view-first.** Adding media is a secondary floating plus button (same FAB language as the calendar).
- **Layout: folders as stacked vertical sections.** Each folder has a header label with its thumbnails in a wrapping grid below. Headers plus spacing act as dividers, so there are no ruled lines. Everything scrolls vertically as one page. **Rejected for now:** horizontal per-folder carousels.
- **Collapsible headers:** each section header collapses and expands. Up and down arrows skip to the previous or next section.
- **View density toggle:** large preview, compact preview, and a names-only rows view.
- **"Unsorted" default section:** media lands here when no folder is chosen. Mid-gig uploads need zero decisions, and sorting happens later.
- **Upload staging tray (thin, mobile-first):** after picking files (for example, the iPhone photo picker), a thin bottom tray slides up, one thumbnail tall, with the gallery visible above. It scrolls horizontally. Each item is a square rounded-corner thumbnail with its file name (truncated is fine) below. Uploads auto-start.
- **Per-item progress:** items start grayed out with no border. A blue border traces clockwise from the top-left as the upload progresses. The item turns full color when done, then flies up into its folder section.
- **Selection model (one model, tray and gallery):** tapping a thumbnail toggles it in or out of the selection and never cancels anything, so stray taps are safe. Whenever a selection exists, an action bar appears and section headers become "move here" targets. The action bar adapts to the selection: cancel and move to folder for any number of items, and rename only when exactly one item is selected. Items can be moved while still uploading, and they land in the new section when finished.
- **Tray header strip:** bulk folder selector (defaults to Unsorted) plus a cancel-all button with an "are you sure" confirm.
- **Batch progress:** a thin straight bar along the tray's top edge fills left to right. **Rejected:** wrapping the progress around the whole tray border (too busy).
- **Keep screen awake automatically** while uploads are active (Screen Wake Lock API), released when the batch finishes. No toggle needed.
- **Close-and-return limits:** Drive resumable uploads keep the partial file server-side, but the browser loses access to the phone's local file when the tab closes or is killed. Uploads therefore can't continue in the background or resume on their own. Show a "keep this open" note while uploading. On return, the tray shows what finished and marks unfinished items "re-add to finish." Re-picking resumes or skips anything already uploaded. True background upload would need a native app (future consideration).
- **Moving media into folders: tap-to-place is primary.** With items selected, section headers become "move here" targets. Tap one and the items fly in, filed at the end of that section. Tapping the header was chosen over tapping anywhere in the section body, which would conflict with tapping a photo to view it.
- **Drag and drop is secondary/optional** (long-press, items gather under the thumb). It is not the main path, because drag-plus-autoscroll on mobile is error-prone.
- **Single-item viewer:** tapping a photo or video in the gallery (with no selection active) opens a full-screen viewer you can swipe through, with share and download buttons. Share is the simplest path toward the social-posting goal.
- **Deleting:** deleting in the app also deletes in Drive, but moves the file to Drive's trash so it can be recovered. Only band members can delete.
- **Public uploads:** files from the shareable upload link always land in Unsorted. Outside uploaders never see or choose folders.
- **Downloading:** users must be able to download media to their computer or phone, both single items and a multi-selection (and possibly a whole folder or gig). Decided:
  - Single item: download button in the single-item viewer.
  - Multi-select on mobile: use the native share sheet (Web Share API with multiple files) so users can save straight to Photos. Avoids zips, which land in Files on iPhone and are awkward for social posting.
  - Multi-select on desktop: the server bundles the selection into a zip download.
  - Whole gig/folder: link out to that gig's Google Drive folder rather than building a bulk download.
- **Quick rename:** tapping the name label under a thumbnail renames it directly (inline), in both the tray and the gallery. The tap area spans the full thumbnail width and is about fingertip height (~44pt), even though the text is small. Tapping the picture selects it. Fallback if the target still feels cramped: long-press to rename. **Rejected:** double-tap to rename, because it forces a delay on every single tap, making selection laggy, and double-tap usually means zoom or like on phones.

# Public gig calendar (new feature)
- A publicly shareable, view-only link showing the band's gigs (for example, for an Instagram bio). It has no access to anything else in the app.
- **Public fields only:** title, date, start time, and venue name.
- **Never public:** setlist, lineup, notes, point of contact, call/load-in time, media, and practices.
- **Per-gig "show on public calendar" toggle, ON by default.** Turn it off for tentative bookings or private events.
- **Views:** toggle between a list of upcoming shows and a calendar view. List is the default, since it reads best on phones. Both can reuse the app's existing agenda and calendar components in read-only mode.

# Music Library tab

## Empty state & create
- Empty state: placeholder text ("No music yet — press + to add one").
- Plus (FAB) in the same spot as on the calendar, for consistency. Tapping it splits into **Add song** and **Import playlist**.
- **Add song dialog: one smart input, no tabs.** Paste a Spotify or YouTube link (auto-detected), or type to search Spotify. A small "enter manually" link sits underneath.
- On a match, show a preview (art, title, artist) to confirm it's the right song, then auto-fill title, artist, duration, and the link as a key-value pair.
- YouTube import fills title from the video title and artist from the channel name.
- Every imported field stays editable; it doesn't need to match the source exactly.
- **Only title is required.**
- Links: a simple key-value list at the bottom of the form. Plus adds a row (label | value). Imports add their own row automatically. Free-form notes field (optional) below that. Done button saves.
- **Add = the song detail sheet in edit mode.** Adding a song opens the same right-hand detail sheet used for viewing/editing (full-screen on mobile), already in edit mode with empty fields and the smart input at the top. One component, one mental model.
- **Progressive disclosure in the add sheet:** initially only the smart input is shown. The rest of the form appears when (a) a Spotify/YouTube match is picked (fields appear pre-filled), or (b) the user taps "enter manually" (fields appear, with any typed text carried into Title). If a search returns no results, suggest manual entry the same way. Editing an existing song always shows all fields.
- **Adding songs while building a setlist (from the gig drawers):** never punt to the Music Library tab. The library drawer has a plus that opens the same add sheet in place (on desktop beside the drawers; on mobile full-screen, returning to the setlist on Done). On save, the song is added to the library AND appended to the end of the current setlist automatically (no extra drag). If a search in the library drawer finds no match, offer "Add this song" with the typed text pre-filled into the smart input.

## Library list
- Looks like a Spotify playlist: horizontal cards stacked vertically, showing thumbnail, title, artist, and duration.
- Thumbnail: Spotify album art, else the YouTube thumbnail, else placeholder art. Users can optionally upload their own image.
- Cards must look good with only a title filled in.

## Song detail sheet
- Tapping a card opens a sheet on the right with full info: all links and notes. Full-screen on mobile.
- On desktop you can click other songs while the sheet stays open. On mobile, up/down arrows or swipe inside the sheet move between songs.
- Link values render as tappable links with the site's favicon and open directly.
- Edit button top-right switches fields to editable in place without shifting the layout (no jitter when toggling edit/cancel).
- Delete lives in edit mode, with a warning if the song is used in setlists ("this is in 3 setlists").

## Playlists & Spotify auth
- Import playlist: paste a playlist link. Songs already in the library are skipped (no duplicates).
- Export: whole library or a setlist can be exported as a Spotify playlist.
- **Spotify auth is lazy.** Track lookup, search, and public playlist import use app-level credentials, so no user login is needed. User Spotify login is only requested when actually needed (first export, or importing a private playlist). Never at signup.
- **Private playlist import:** private playlists require the user's Spotify login. If a pasted playlist can't be found while logged out, show "Can't see this playlist — it might be private" with a "Log in with Spotify" button (private and nonexistent look the same to the API, so the copy covers both). After login, automatically retry the same link. If it still fails, show a plain "playlist not found."
- Possible follow-up once logged in: a "pick from my playlists" list as an alternative to pasting links.

## Library gaps resolved
- **Search bar** over the library.
- **Sort options:** Title A–Z, Artist A–Z, Recently added (default), Last played (most recent gig using the song), Most played (number of setlists it's in).
- **"Used in" list** on the song detail sheet: which gigs/setlists use this song. Powers the delete warning and the last/most played sorts.
- **Duplicate check on single adds:** "already in your library" if the song exists.
- **Large playlist imports:** progress indicator plus an end summary (e.g. "52 added, 8 already in library").
- **Rejected for now:** tags (original/cover, needs work, etc.) and extra fields like key/tempo. Use notes instead; revisit only if needed.
- **Songsterr tab suggestion:** when a song is added, the backend searches Songsterr's public search endpoint by title/artist (no key needed; no browser CORS, so it must be server-side). On a match, the form shows "Found a tab on Songsterr. Add it?" and one tap adds it as a link key-value pair. It's a suggestion, never added automatically, since matches can be wrong. Caveat: commercial use may need Songsterr approval; check if this becomes a product. **Rejected:** Ultimate Guitar (no official API; scraping violates their terms).

# Roster tab
- List of band members as cards (same card style as the Music Library): name, photo, instrument icons.
- Tapping a card opens the same right-hand detail sheet (full-screen on mobile) with contact info and possibly their upcoming gigs.
- **Invite link button takes the place of the plus/create button** used on the other tabs.
- **Deferred:** subs / fill-in players who aren't full members. It's an edge case; leave it out of the first implementation.
- **Roles:** the band creator is an admin. Admins can promote other members to admin, remove members, and reset (regenerate) the invite link. Everyone else is a regular member.

# Stage mode (setlist reading view)
- Opened from a gig via a "Stage mode" button. Full-screen, dark background, very large high-contrast text, readable from a phone on the floor or a music stand.
- **One song at a time:** current song title huge, with its notes underneath (e.g. "capo on 2"), plus the next song shown smaller below. A small position indicator (e.g. "4 of 12").
- Tap anywhere to advance to the next song. Swipe back to undo an accidental advance (deliberate choice: quick tap-forward wins over accidental-tap protection).
- Screen stays awake while in stage mode (Screen Wake Lock, same as uploads).
- **Rejected:** a whole-setlist view; setlists can be long and only the current moment matters on stage.
- **Works offline** (venues often have bad signal). A service worker caches the app shell (no installable app needed). Whenever the app is opened online, it quietly caches the setlists and song notes for upcoming gigs locally, so stage mode works with no connection. Limitation: the phone must have opened the app online at least once after the setlist was last updated.

# Settings
- Reached from the profile icon (not a nav tab). Split into two sections:

## Personal settings (every user)
- Name, photo, instruments, Spotify connection, log out.

## Band settings (admins only)
- Band name and photo.
- Google Drive and Google Calendar connections.
- Public gig calendar link, with copy and reset buttons.
- **Band profile for the public page:** social links (e.g. Instagram, TikTok, YouTube, Spotify), contact info (e.g. a booking email), and a free-form bio. These show at the top of the public gig calendar page alongside the band name and photo.

# Shareable deep links (members only)
- Every resource has its own URL so a link can be dropped in the group chat (e.g. "here's the gig, add the tabs there"). Not public: login required.
- Routes like `/gigs/:id`, `/practices/:seriesId?date=...` (a single occurrence of a recurring practice needs its date), `/songs/:id`.
- Opening a gig/practice link shows the calendar at that date with the event drawer already open; a song link opens the song detail sheet.
- Logged-out users sign in, then get redirected to the original link.
- Each drawer/sheet has a share button: copy link, or the native share sheet on mobile.

# Decided against
- **Notifications:** skipped. No installable app (PWA) wanted, and the group chat remains the main communication channel.
- **Comments/discussion threads on events:** skipped for the same reason.
- **Money tracking (gig pay, merch, splits):** skipped for now.
- **In-app lyrics/chords viewer:** skipped for now. Researched: licensed lyrics APIs (e.g. Musixmatch) are paid, partial on free tiers, and have no chords; no official chords+lyrics API exists (Ultimate Guitar has none, and scraping violates its terms). A possible future version would be user-pasted ChordPro rendered with chords above lyrics, transpose, and stage-mode display. For now, a link to the Ultimate Guitar page in the song's key-value links is enough.
- **RSVP/availability on gigs:** skipped. Gigs are set up more intentionally (availability is sorted out before booking), so the lineup is managed directly instead. RSVPs stay a practice-only feature.

# Linking Google Drive
- A band starts in an **unlinked** state. The first time anyone interacts with media, they see "This band hasn't been linked to a Google Drive yet" with a button to link it now (also available in Band settings).
- Linking flow: Google sign-in, then the **Google Picker** to choose which folder the band's media lives in (never dumped in the Drive root). The app builds the Gigs structure inside that folder.
- **Decided scope: full Drive access** (`drive` scope), not `drive.file`. Researched: with `drive.file`, picking a folder does NOT grant access to its contents, so files added directly in Drive would be invisible to the app and the changes poller. Full access lets the poller see outside-the-app uploads too. Trade-off accepted: since it's essentially just our band using it, users will see Google's "unverified app" warning rather than going through Google's restricted-scope review. Revisit if the app is ever opened to other bands. The picked folder is still where the app stores media and the scope it watches.
- **Ownership is the band's choice:** a dedicated band Google account or a member's personal account. The app doesn't enforce either. (Risk to note: if the linked account's owner leaves, media access goes with them.)
- Files added directly in the Drive folder outside the app DO show up in the app (via the changes poller), landing in the matching folder section, or Unsorted if they're not in a known folder.

# Linking Google Calendar
- Same lazy pattern as Drive: the Calendar tab works fully without Google Calendar. An unlinked band shows a small banner on the Calendar tab offering to connect (also available in Band settings).
- On connect, the app creates a **new dedicated calendar named after the band** in the connecting account, rather than writing into anyone's personal calendar.
- Every practice and gig on that calendar invites band members as attendees by email. Members RSVP from their own Google Calendar, which is what drives the two-way decline/RSVP sync.
- Ownership follows the same rule as Drive: the band chooses whose account (dedicated band account or a member's).

# Multiple bands & leaving
- A user can belong to multiple bands. A **band switcher** (band name + photo) sits at the top of the screen next to the profile icon, on both desktop and mobile (mobile tabs are in the bottom bar). Deep links automatically switch to the band the linked resource belongs to.
- **Leaving:** "Leave band" button in settings. Past lineups keep the person's name so the band's history stays intact.
- **Last admin:** can't leave until they promote someone else to admin. If they're the only member left, leaving means deleting the band.

## Tech Stack: Libraries
Principle: if a well-maintained library already does it, use it rather than building from scratch.
- **Calendar UI:** FullCalendar (month/week views, all-day row, date click, RRULE plugin).
- **Recurrence:** rrule library on both frontend and backend; RRULE strings are the stored format, which matches Google Calendar.
- **Components:** shadcn/ui (Radix primitives, code is owned and customizable). Bottom drawers via Vaul (shadcn Drawer).
- **Drag and drop:** dnd-kit for setlists and lineups.
- **Data fetching:** TanStack Query (React Query) from day one for caching, retries, and optimistic updates.
- **Database access:** Drizzle ORM for type-safe queries and migrations.
- **Background jobs:** pg-boss (Postgres-backed queue, no Redis) for the Drive changes poller, Calendar sync, and other async work.
- **Forms:** React Hook Form with Zod resolvers, reusing the shared Zod schemas.
- **Google APIs:** official googleapis Node client for Drive and Calendar.
- **Time zones:** date-fns with date-fns-tz.
- **Error tracking:** Sentry on frontend and backend.
- **Email (magic links):** Resend.
