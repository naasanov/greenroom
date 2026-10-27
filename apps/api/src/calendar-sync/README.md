# Calendar sync

Two-way sync between a band's gigs and practices and a dedicated Google Calendar. The Events tab works without it; nothing here runs until a band links Calendar and calls setup. Credentials come from `google-connect` (`GoogleLinksService.getAccessToken(bandId, "calendar")`); all Google calls go through the `GoogleCalendarAdapter`.

## Endpoints
- `POST /bands/:bandId/integrations/google/calendar/setup` `{ timeZone }` (any member). `409 GOOGLE_NOT_LINKED` without a link. Creates the calendar (summary = band name) if `bands.calendar_id` is null, takes a sync token, pushes every live gig dated 30 days ago or later and every live practice series. Idempotent. Returns `{ calendarId, gigs, practiceSeries, lastSyncedAt }`. The web calls it after returning with `?google=connected&service=calendar`.
- `GET /bands/:bandId/integrations/google/calendar/sync` returns `{ lastSyncedAt, pending }` (last pull time; unpushed app changes in this process).
- `DELETE .../google/calendar` (in google-connect) clears every `gcal_event_id`, `gcal_etag`, `gcal_instance_etag` and the `calendar_sync_states` row, and `bands.calendar_id`. The Google calendar is left alone. Linking a different Google account over a live link does the same; the next setup starts fresh.

## Mapping
- Every event carries `greenroomKind` (`gig` or `practice`) and `greenroomId` as private properties.
- Gig: summary = title; location = `venue, address`; description = notes, `Load-in: HH:mm`, and `${WEB_URL}/gigs/<id>`; timed when a start exists (end defaults to start + 2h), otherwise all-day on its date; time zone from the gig.
- Practice series: one recurring event (`RRULE` from the series, `timeZone`, start = dtstart, end = start + duration, description link `${WEB_URL}/practices/<seriesId>`). Overrides are instance exceptions with full content; cancellations are cancelled instances.
- Attendees: all active members at `users.calendar_email`, else the sign-in email. Writes notify attendees (adapter `sendUpdates: all`).
- RSVPs: going=accepted, maybe=tentative, not_going=declined, no_response=needsAction. The adapter's `attendeeResponses` field carries per-attendee statuses. Gig attendees are invites only; their answers are ignored.

## Push (app to Google)
Services enqueue after writes through `CalendarSyncQueue` (never throws, no-op when the band has no calendar). Kinds: `gig`, `gig-att`, `series`, `series-att`, `occ`, `rsvp`. Membership join/leave/remove and calendar-email changes enqueue `*-att` jobs (attendee list only, so unpulled content edits are not overwritten). Pushes read current state and reconcile with `ifMatchEtag`; returned etags are stored.
- Etag mismatch: this app write is newer, so it overwrites (for series, Google's attendee answers are applied to the app first). Attendee-only pushes take the remote edit in first.
- Not found on update: Google deleted it; delete wins, the app row is soft-deleted.
- App deletes delete the gig event or recurring event, or cancel the instance.
- Series pushes also patch instance exceptions: every override, plus occurrences whose RSVPs differ from the master's answer.
- Queue `calendar-push` (pg-boss, policy `short`, singleton key per event, 3s delay to coalesce bursts, retryLimit 5 with backoff).

## Pull (Google to app)
Queue `calendar-pull`, cron `* * * * *`: per linked band, `listChanges` with the stored token; `sync-token-expired` triggers a full list (events whose Google event is absent are treated as deleted). Per tagged event whose etag differs from the stored one:
- gigs: title, location (as venue text, address cleared, when it differs from what is pushed), start/end/all-day, time zone; deletes soft-delete.
- series: title, location, time, duration, time zone, recurrence; deletes soft-delete. A recurrence the app cannot represent (not exactly one supported RRULE) keeps the app's rule and re-enqueues a push. A schedule change drops overrides and RSVPs that no longer line up with an occurrence.
- instances: edits become overrides, cancellations become cancelled overrides; instance attendee answers become RSVPs.
- series-level answers (master attendee status) are written as per-occurrence RSVP rows for occurrences in the window (30 days back to 1 year ahead) with no instance-level answer from that member in Google, skipping cancelled occurrences.

## Conflicts and echo suppression
Etags, not timestamps, detect Google-side writes. A pass pulls first, then flushes pending pushes. A pending app change to an event makes the pull skip that event's remote edits (the push then overwrites); remote deletes and cancellations are always applied, and an app delete always wins over a remote edit. The pull writes the database directly (never through the events services), so nothing is enqueued, and it stores each event's new etag so the next listing skips it. Pending state is in memory (a restart falls back to the durable pg-boss jobs).

## Ignored
- Events created directly in Google on the band calendar (no `greenroomId` tag).
- Tagged events whose Google id does not match the app row's stored id (copies, duplicates, Google-side "this and following" splits), and instances that are not occurrences of the series.
- Gig attendee responses, description edits, and attendee list changes made in Google.

## Tests
With `INTEGRATIONS_MODE=fake` outside production there are no timers (no push worker, no cron). Specs call `testApi.calendarFlush(bandId?)` to drain pending pushes and `testApi.calendarSync(bandId)` for one pull pass (pull, then flush). Fake controls: `calendarEvents`, `calendarInfo`, `calendarEdit`, `calendarInstanceEdit`, `calendarDelete`, `calendarAttendeeResponse`, `calendarInstanceAttendeeResponse`, `calendarExpireSyncTokens`. Specs: `apps/e2e/tests/api-calendar-sync*.spec.ts`.
