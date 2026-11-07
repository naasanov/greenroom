# Calendar invites

Provider-neutral calendar delivery (design.md "Calendar invites"): each active member gets standard iCalendar invites by email (iMIP). Phases 10.1 and 10.2 cover the backend: invites, inbound replies, RSVP sync, one-click links and the subscription feed. The UI comes later. The Google service-account sync in `calendar-sync` is untouched and runs independently.

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

## Inbound replies (10.2)
`POST /webhooks/resend/inbound` (`@Public`) takes Resend's `email.received` event. The Svix signature (`svix.ts`: HMAC-SHA256 over `id.timestamp.rawBody`, key = base64 of `RESEND_WEBHOOK_SECRET` after `whsec_`, 5 minute window) is checked against the raw body (`rawBody: true` in `main.ts`); anything unsigned is 401. The webhook carries metadata only, so `EmailAdapter.fetchReceivedEmail` calls `GET /emails/receiving/{id}` and walks the original MIME (`integrations/email/mime.ts`) for `text/calendar` parts and `.ics` attachments. Needs a `RESEND_API_KEY` with read access.

`CalendarInviteInboundService.handleReply`: finds the `rsvp+<token>` recipient, validates the token (series only; gig replies are ignored), matches the sender to exactly one active non-roster member of the band by `users.calendar_email` or sign-in email (case-insensitive; a failed DMARC result is ignored), and parses `METHOD:REPLY` (`ics-reply.ts`). `PARTSTAT` ACCEPTED, TENTATIVE, DECLINED map to going, maybe, not_going. A `RECURRENCE-ID` reply sets that occurrence (`RANGE=THISANDFUTURE` uses scope `this_and_following`); a master reply uses scope `all` anchored on the next upcoming occurrence (a one-off uses its start). Everything goes through `PracticesService.setRsvp`, so scope semantics are the app's. Unknown sender, bad token, bad UID: HTTP 200, debug log only.

No echo: `CalendarInviteService.withSilentReply` compares the member's invite hash before and after the change; when their invite was current it moves the stored hash forward without emailing.

## RSVP sync from the app
`PracticesService.setRsvp` enqueues a `series` reconcile. The master VEVENT carries the member's answer for the next upcoming occurrence as `PARTSTAT`; other upcoming occurrences with a different answer (and no override) get a `RECURRENCE-ID` VEVENT with their own `PARTSTAT`. Only the answering member's hash changes, so only they get an updated REQUEST, and restating the same answer sends nothing. (The master's answer shifts when the next occurrence passes, which resends at the next reconcile of that series.)

## One-click RSVP links
Each practice invite body has Yes, Maybe, No links: `GET /public/rsvp/:token?response=going|maybe|no` on the API (`API_PUBLIC_URL`). The token (`rsvp-link.ts`) is `base64url(userId|seriesId|occurrenceKey|exp).HMAC`, 120 day expiry, same secret as the reply token. Recurring series links answer the whole series (scope `all`), one-offs their single occurrence. The response is a tiny no-store HTML page (400 invalid, 410 expired, 404 gone). Throttled per IP. A link opened by a mail scanner records the answer, which is the accepted cost of a no-login GET.

## Subscription feed
`memberships.calendar_feed_token` (64 hex, unique, migration 0019) is the per-member secret. `GET /bands/:bandId/calendar-feed` (member) returns `{ url, webcalUrl }`; `POST .../calendar-feed/rotate` writes a new token. `GET /public/calendar-feed/<token>.ics` returns `METHOD:PUBLISH` with the band's upcoming gigs and practice series (same builder; that member's RSVP as `PARTSTAT`), `Cache-Control: private, max-age=300, must-revalidate`, an `ETag` (304 on match), throttled per IP (`PUBLIC_CALENDAR_REQUESTS_PER_MINUTE`). Left members and unknown tokens are 404.

## Tests
- `testApi.calendarInvitesFlush(bandId?)` drains pending reconciles; `testApi.calendarInvitesFor(to?, clear?)` reads `GET /__test__/email/calendar-invites` (`?to=`, `?clear=1`); `testApi.calendarInvitesEnabled(userId, enabled)` toggles the opt-out. Reset clears the log and the queue.
- `testApi.addInboundEmail({ emailId, from, recipients, calendars })` (`POST /__test__/email/inbound`) stores a message the signed webhook can fetch; `testApi.calendarInviteReply({ from, to, ics })` runs a parsed reply straight through the handler and returns its outcome. The e2e API signs with the fixed `RESEND_WEBHOOK_SECRET` set in `apps/e2e/src/servers.ts`.
- Specs: `api-calendar-invites.spec.ts`, `api-calendar-invite-replies.spec.ts`, `api-calendar-feed.spec.ts`.
- Pure and DB checks without a build: compile `__checks__/ics.ts` (pure) or `__checks__/service.ts` (needs `CHECK_DATABASE_URL` of a scratch database) with `tsc --outDir <tmp>` and run with node.

## Env
`EMAIL_REPLY_DOMAIN` (default `greenroom.fyi`), `INVITE_TOKEN_SECRET` (optional), `EMAIL_FROM`, `RESEND_API_KEY`, `WEB_URL` (links), `API_PUBLIC_URL` (RSVP links, feed URL), `RESEND_WEBHOOK_SECRET` (inbound webhook).
