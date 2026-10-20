# Greenroom Data Model (DRAFT)

> **DRAFT. Not the source of truth.** This is a rough starting sketch of entities, fields, and relationships, written before any code. [design.md](./design.md) is the source of truth for behavior. The orchestrator should treat this page as input only and is free to change, rename, split, or drop anything here while doing task 0.2 and the Phase 0 foundation. Once the real schema exists, the schema code is authoritative; update or replace this page to match it.

# Users & bands
- **User:** id, email (unique), display name, avatar URL, Google account id (nullable), created at.
- **Session / magic link token:** id, user id, token hash, expires at, used at.
- **Band:** id, name, slug (for public calendar), profile image, bio/links for public page, Google Drive root folder id (nullable), linked-by user id, Google Calendar id (nullable), created at.
- **Membership:** band id, user id, role (admin | member), joined at. Unique on band + user.
- **Member instrument:** membership id, instrument (preset key or custom text). Many per member.
- **Invite link:** band id, token, created by, revoked at. Reset = revoke + new.
- **OAuth connection:** user id, provider (google | spotify), scopes, encrypted refresh token, access token expiry.

# Events
- **Event:** id, band id, type (gig | practice), title, start, end, all-day flag, time zone, notes, created by, Google Calendar event id + etag, updated at, deleted at.
- **Gig details:** event id, venue name, address, Google Place id, lat/lng, load-in time, set time, pay, contact, public flag, Drive media folder id.
- **Practice series:** id, band id, RRULE string, start, time zone, location. Practices are events generated from or overriding the series.
- **Practice exception:** series id, original occurrence start, cancelled flag or override event id. Supports this / this and following / all.
- **RSVP:** event id (or series id + occurrence start), user id, status (going | maybe | not going | no response). Maps to Google attendee status accepted / tentative / declined / needs action.

# Music
- **Song:** id, band id, title, artist, duration seconds, key, tempo, notes, Spotify track id, YouTube URL, Songsterr URL, created at, deleted at.
- **Song link:** song id, URL, label.
- **Setlist:** id, band id, event id or practice series id (+ effective-from occurrence for this-and-following), name.
- **Setlist item:** setlist id, song id, position, per-item note.
- **Lineup entry:** event id, user id (who is playing that gig).

# Media
- **Media item:** id, band id, event id (nullable = Unsorted), Drive file id, file name, mime type, size, thumbnail, uploaded by (user or public link), created at, missing flag (from changes poller).
- **Upload session:** id, media target, Drive resumable session URL, bytes received, total bytes, status.
- **Public upload link:** id, band id, event id (nullable), token, expires at, revoked at, max file size, allowed types.
- **Drive sync cursor:** band id, changes page token, last polled at.

# Other
- **Feedback:** id, user id, band id, message, page URL, GitHub issue number, created at.
- **Calendar sync state:** band id, sync token, last synced at.

# Open questions for the orchestrator
- Whether practices should be fully materialized rows or expanded on read from the RRULE.
- Whether RSVPs on recurring practices key off occurrence start time or a materialized event id.
