# Calendar sync

Two-way sync between a band's gigs and practices and a dedicated Google Calendar. The Events tab works without it; nothing here runs until a band calls setup. Every band calendar is owned by one server-held Google service account: `CalendarBotTokenService` signs an RS256 JWT from the optional env `CALENDAR_SA_KEY` (base64 of the service account JSON key, scope `calendar`) and exchanges it at Google's token endpoint for access tokens (cached, refreshed within 60s of expiry, one shared request at a time). Members need no Google link. In `INTEGRATIONS_MODE=fake` no key is needed. All Google calls go through the `GoogleCalendarAdapter`.

A service account cannot invite attendees without Workspace domain-wide delegation, so events have no attendees. Instead the calendar is shared with members through ACL rules (role `reader`, share notification email on); each member accepts the share once. **Google RSVP sync is not supported with a service account**: RSVPs live only in the app.

## Endpoints

- `POST /bands/:bandId/integrations/google/calendar/setup` `{ timeZone }` (any member). `409 CALENDAR_BOT_NOT_CONFIGURED` in real mode when the service account key is missing or rejected. Creates the calendar on the service account (summary = band name) if `bands.calendar_id` is null, takes a sync token, pushes every live gig dated 30 days ago or later and every live practice series. Idempotent. Returns `{ calendarId, gigs, practiceSeries, lastSyncedAt }`. The web calls it from the "Sync to Google Calendar" actions. It also reconciles the ACL (see Sharing).
- `GET /bands/:bandId/integrations/google/calendar/sync` returns `{ lastSyncedAt, pending }` (last pull time; unpushed app changes in this process).
- `DELETE .../google/calendar` (in google-connect) clears every `gcal_event_id`, `gcal_etag`, `gcal_instance_etag` and the `calendar_sync_states` row, and `bands.calendar_id`. The Google calendar is left alone and no token is revoked; the next setup creates a fresh calendar. Existing `band_google_links` rows with service `calendar` are ignored.

## Mapping

- Every event carries `greenroomKind` (`gig` or `practice`) and `greenroomId` as private properties.
- Gig: summary = title; location = `venue, address`; description = notes, `Load-in: HH:mm`, and `${WEB_URL}/gigs/<id>`; timed when a start exists (end defaults to start + 2h), otherwise all-day on its date; time zone from the gig.
- Practice series: one recurring event (`RRULE` from the series, `timeZone`, start = dtstart, end = start + duration, description link `${WEB_URL}/practices/<seriesId>`). Overrides are instance exceptions with full content; cancellations are cancelled instances.

## Sharing
Member address = `users.calendar_email`, else the sign-in email (deduplicated case-insensitively). The `acl` queue job (`CalendarAclService.reconcile`) lists the calendar's rules, deletes `reader` user rules for addresses that are no longer active members, and inserts a `reader` rule (`sendNotifications: true`) for each member without one. Other roles (the owner) are never touched. Already-shared addresses are skipped and addresses Google refuses (non-Google or malformed, a 400/404) are logged and skipped, so neither fails the job. Setup, membership join/leave/removal and calendar-email changes enqueue or run it, so it is idempotent. Disconnect leaves the ACL and the Google calendar alone.

## Push (app to Google)

Services enqueue after writes through `CalendarSyncQueue` (never throws, no-op when the band has no calendar). Kinds: `gig`, `series`, `occ`, `acl` (id = band id; see Sharing). Pushes read current state and reconcile with `ifMatchEtag`; returned etags are stored.

- Etag mismatch: this app write is newer, so it overwrites.
- Not found on update: Google deleted it; delete wins, the app row is soft-deleted.
- App deletes delete the gig event or recurring event, or cancel the instance.
- Series pushes also patch instance exceptions: every override and cancellation.
- Queue `calendar-push` (pg-boss, policy `short`, singleton key per event, 3s delay to coalesce bursts, retryLimit 5 with backoff).

## Pull (Google to app)

Queue `calendar-pull`, cron `* * * * *`: per band with a `calendar_id`, `listChanges` with the stored token; `sync-token-expired` triggers a full list (events whose Google event is absent are treated as deleted). Per tagged event whose etag differs from the stored one:

- gigs: title, location (as venue text, address cleared, when it differs from what is pushed), start/end/all-day, time zone; deletes soft-delete.
- series: title, location, time, duration, time zone, recurrence; deletes soft-delete. A recurrence the app cannot represent (not exactly one supported RRULE) keeps the app's rule and re-enqueues a push. A schedule change drops overrides and RSVPs that no longer line up with an occurrence.
- instances: edits become overrides, cancellations become cancelled overrides.

## Conflicts and echo suppression

Etags, not timestamps, detect Google-side writes. A pass pulls first, then flushes pending pushes. A pending app change to an event makes the pull skip that event's remote edits (the push then overwrites); remote deletes and cancellations are always applied, and an app delete always wins over a remote edit. The pull writes the database directly (never through the events services), so nothing is enqueued, and it stores each event's new etag so the next listing skips it. Pending state is in memory (a restart falls back to the durable pg-boss jobs).

## Ignored

- Events created directly in Google on the band calendar (no `greenroomId` tag).
- Tagged events whose Google id does not match the app row's stored id (copies, duplicates, Google-side "this and following" splits), and instances that are not occurrences of the series.
- Description edits and any attendee or RSVP changes made in Google.

## Tests

With `INTEGRATIONS_MODE=fake` outside production there are no timers (no push worker, no cron). Specs call `testApi.calendarFlush(bandId?)` to drain pending pushes and `testApi.calendarSync(bandId)` for one pull pass (pull, then flush). Fake controls: `calendarEvents`, `calendarInfo`, `calendarEdit`, `calendarInstanceEdit`, `calendarDelete`, `calendarAcl`, `calendarSimulateAcl`, `calendarExpireSyncTokens`. Specs: `apps/e2e/tests/api-calendar-sync*.spec.ts`.
