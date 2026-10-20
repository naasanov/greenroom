# Events (gigs and practices)

All routes sit under `/bands/:bandId/...` behind `@BandMember()` (non-members get 404). Any active member may create, edit and delete events; the design requires admin nowhere here. Schemas and response types live in `packages/shared/src/events.ts`.

## Endpoints
- `POST /gigs`, `GET|PATCH|DELETE /gigs/:gigId`. Input uses local `date`, `startTime`, `endTime`, `loadInTime` ("HH:mm") plus `timeZone`; the server stores instants and returns both forms. `endTime` at or before `startTime` rolls to the next day. DELETE is a soft delete (`deleted_at`) and never touches Drive fields.
- `POST /practices` creates a series. `GET /practices/:seriesId`.
- `GET|PATCH|DELETE /practices/:seriesId/occurrences/:key`. PATCH body carries `scope`; DELETE takes `?scope=`.
- `PUT /practices/:seriesId/occurrences/:key/rsvp` `{status}`. Returns the occurrence.
- `PUT /practices/:seriesId/occurrences/:key/setlist` `{setlistId, scope: this | this_and_following, onConflict?: replace | keep}`.
- `POST .../setlist` `{scope, onConflict?, sourceSetlistId?, copyCurrent?}` creates a new setlist (optionally pre-filled from another setlist or the one in force) and assigns it; returns the assignment result plus `newSetlistId`.
- `DELETE .../setlist?scope=&onConflict=` clears the occurrence's setlist (same scopes and conflict flags).
- `GET /events?from=&to=&type=gig|practice` (ISO instants, at most 400 days). Gigs plus expanded occurrences, time ordered, each with a `type` discriminator.
- `GET /places/autocomplete?q=` and `GET /places/:placeId` through the Places adapter; 30 requests per minute per user.

## Occurrence key
`YYYYMMDDTHHMMSSZ`, the UTC instant the rule generated (the override `original_start`). It is URL-safe and never changes when an occurrence is moved. The calendar event id is `${seriesId}_${key}`. A key that is not a real occurrence of the series is a 404 with `code: INVALID_OCCURRENCE`.

## Recurrence
Series store an RRULE line without DTSTART (`RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=...Z`) plus `dtstart`, `time_zone` and `duration_minutes`. Supported: one-off (`FREQ=DAILY;COUNT=1`), weekly with `INTERVAL` and `BYDAY`, monthly by day of month or nth weekday, ending never, `UNTIL` or `COUNT`. Anything else is rejected (`UNSUPPORTED_RECURRENCE` or a 400). `UNTIL` is UTC. Rules are expanded on the series' local wall clock, so DST never shifts local times. A start date that does not match the weekday list moves to the first match.

## Scopes (edit and delete)
- `this`: an override row keyed by the original start (edit) or `cancelled = true` (delete). Edit may move date/time and change title, location, duration.
- `this_and_following`: the old rule gets `UNTIL` at its last kept occurrence and a new series starts at the occurrence (a counted rule divides its COUNT). Overrides, RSVPs and single setlists at or after it move to the new series when the schedule is unchanged and are dropped otherwise; the setlist in force carries over. On the first occurrence it behaves like `all`. Delete ends the rule and removes later per-occurrence rows.
- `all`: updates the series. Changing time, start date, time zone or recurrence deletes overrides, since their keys no longer match. Delete soft-deletes the series.

## Setlist assignment
Resolution (`assignment.ts`): a `single` row at exactly the occurrence start wins, else the latest `forward` row with `effective_from <=` it. `this_and_following` writes a forward row and removes later forward rows; later single rows are removed with `onConflict: replace` (default) or kept with `keep`. A row with a null `setlist_id` is an explicit "no setlist" marker: clearing writes one only when an earlier forward row would otherwise still apply (a cleared single still counts as a custom row in `laterCustomSetlists`, with `setlistId: null`). The response and occurrence reads list later occurrences that have their own single setlist (`conflicts`, `laterCustomSetlists`) so the UI can warn.

## RSVPs
Attendees are active members; a missing row is `no_response`. Order: going, maybe, no_response, not_going, then by name.
