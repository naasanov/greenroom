# Calendar invites

Provider-neutral calendar delivery (design.md "Calendar invites"): each active member gets standard iCalendar invites by email (iMIP). Phase 10.1 covers the backend core only; inbound replies, the RSVP links, the feed and the UI come later. The Google service-account sync in `calendar-sync` is untouched and runs independently.

## Flows
Every change enqueues a reconcile job through `CalendarInviteQueue` (never throws). A reconcile loads the current event, computes what each recipient should hold, compares it with the `calendar_invites` rows, and sends only what differs:

- New or changed content: `METHOD:REQUEST` with the same `UID` and `SEQUENCE` = previous + 1 (first send is 0).
- Event deleted, or recipient no longer a member or recipient address changed: `METHOD:CANCEL` (`STATUS:CANCELLED`, `SEQUENCE` + 1, row `cancelled_at` set). A later REQUEST to the same address continues the sequence.
- Unchanged content (`last_payload_hash` equal): nothing is sent.

Hooks: gig create, update, delete enqueue `gig`; practice create, edit (any scope), occurrence cancel, series or `this_and_following` delete enqueue `series` (a split enqueues both series); member join, leave, removal, claimed roster entry and account deletion enqueue `band`; a calendar email change enqueues `band` for each of the user's bands. A `band` job reconciles every upcoming gig and every practice series of the band.

Only upcoming events are considered: gig date today or later (in the gig zone); a series whose rule yields an occurrence within 800 days; a one-off by its (possibly moved) start. Past events are never sent or cancelled.

## Recipients
Active members that are not roster-only, at `users.calendar_email` else `users.email`, deduplicated case-insensitively. Each recipient gets their own email with one `ATTENDEE` (`PARTSTAT=NEEDS-ACTION`, `RSVP=TRUE`; override and one-off occurrences use the member's current RSVP). Opt-out is `users.calendar_invites_enabled` (default true): a disabled member is skipped entirely (no sends, no cancels). Re-enabling enqueues a `band` job, which sends only events whose content differs from what they last received, plus events they never got.

## Content
`ics.ts` is a pure builder (`buildCalendar`): CRLF, 75-octet folding, text escaping, `VTIMEZONE` generated from the IANA zone via `Intl` (yearly `RRULE` observances when the rule is stable, dated observances otherwise; UTC events use `Z` times without a VTIMEZONE), all-day as `VALUE=DATE`. Gigs reuse the calendar-sync mapping (`gigInput`: summary, `venue, address` location, notes, load-in, app link). A practice series is one master VEVENT with the stored `RRULE`, `EXDATE` for cancelled occurrences, and one `RECURRENCE-ID` VEVENT per moved or edited occurrence. UIDs are `gig-<id>@<domain>` and `series-<id>@<domain>`.

## Organizer and reply token
`ORGANIZER` is `rsvp+<token>@EMAIL_REPLY_DOMAIN` and the email From uses the same address, so Gmail sees sender and organizer match. The token (`reply-token.ts`) is stateless: kind char (`g` gig, `p` series) + event uuid hex + 20 hex chars of HMAC-SHA256 (key from `INVITE_TOKEN_SECRET`, else `OAUTH_TOKEN_KEY`), lowercase so mail systems cannot break it. `parseInviteToken` / `tokenFromAddress` verify it for the inbound wave; the sender address identifies the member.

## Email transport
`EmailAdapter.sendCalendarInvite({ to, subject, text, html, ics, method, from? })`. Resend has no raw MIME or alternative parts, so the real adapter sends text and html bodies plus an `invite.ics` attachment with `content_type: text/calendar; method=REQUEST|CANCEL; charset=UTF-8`, which Gmail, Outlook and Apple Mail treat as an invite. Not yet verified against live inboxes.

## Queue
Queue `calendar-invites` (pg-boss, policy `short`, singleton key per job, 30s delay so bursts coalesce into one email per recipient, retryLimit 5 with backoff). The in-memory dirty map mirrors `calendar-push`: it is what tests drain and what a retry re-adds. With `INTEGRATIONS_MODE=fake` outside production there are no timers.

## Tests
- `testApi.calendarInvitesFlush(bandId?)` drains pending reconciles; `testApi.calendarInvitesFor(to?, clear?)` reads `GET /__test__/email/calendar-invites` (`?to=`, `?clear=1`); `testApi.calendarInvitesEnabled(userId, enabled)` toggles the opt-out. Reset clears the log and the queue.
- Spec: `apps/e2e/tests/api-calendar-invites.spec.ts`.
- Pure and DB checks without a build: compile `__checks__/ics.ts` (pure) or `__checks__/service.ts` (needs `CHECK_DATABASE_URL` of a scratch database) with `tsc --outDir <tmp>` and run with node.

## Env
`EMAIL_REPLY_DOMAIN` (default `greenroom.fyi`), `INVITE_TOKEN_SECRET` (optional), `EMAIL_FROM`, `RESEND_API_KEY`, `WEB_URL` (links).
