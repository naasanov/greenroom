# Links

Resolvers for web deep links, which carry no band id. Routes are not band-scoped; they sit behind the global `AuthGuard`. Response types live in `packages/shared/src/links.ts`.

- `GET /links/gigs/:gigId` returns `{ bandId, gigId }`.
- `GET /links/songs/:songId` returns `{ bandId, songId }`.
- `GET /links/practices/:seriesId?date=YYYY-MM-DD` returns `{ bandId, seriesId, occurrenceKey }`. `occurrenceKey` is the non-cancelled occurrence whose current local date (overrides applied, series time zone) equals `date`, else null (also for a missing or malformed date). Expansion reuses `events/occurrences.ts`.
- A missing or soft-deleted resource, a malformed id, and a caller who is not an active member of its band all return the same 404, so existence never leaks.
