# Greenroom Data Model

The authoritative schema is the Drizzle code in `packages/db/src/schema` (one file per area). Migrations are in `packages/db/migrations`. This page is a short map.

## Conventions
- uuid ids (`defaultRandom()`), `timestamptz` everywhere, `created_at`/`updated_at` on mutable tables.
- Soft delete (`deleted_at`) on songs, gigs, practice_series, media_items. Memberships soft-leave via `left_at`.
- Top-level band-owned tables and the practice, lineup, setlist-link and media tables carry an indexed `band_id`. Pure child tables (song_links, setlist_items) are scoped through their parent.

## Tables
- **users.ts:** users (google_sub column, no separate identities table), magic_link_tokens, sessions, oauth_connections (google | spotify, encrypted refresh token).
- **bands.ts:** bands (slug, resettable `public_calendar_token`, Drive/Calendar link columns), memberships (admin | member, partial unique index on active band+user), user_instruments (per user, not per membership: user_id, preset_key xor custom_name, position), invite_links.
- **gigs.ts:** gigs (required `date`, nullable `starts_at`, `all_day`, `time_zone`, venue/contact, Drive folder, gcal id + etag), gig_lineup (gig to membership).
- **practices.ts:** practice_series (RRULE + dtstart + time zone, expanded on read, never materialized; a one-off is COUNT=1), practice_occurrence_overrides (unique per series + original_start), practice_rsvps (series + original_start + user), practice_setlist_assignments (forward | single scope; resolution rule is documented in the schema file).
- **music.ts:** songs, song_links (label/value/position), setlists, setlist_items, gig_setlists (one setlist per gig).
- **media.ts:** media_folders, media_items (null folder = Unsorted; `trashed_at` mirrors Drive, `deleted_at` is app soft delete), upload_sessions, public_upload_links.
- **sync.ts:** drive_sync_cursors, calendar_sync_states (one row per band).
- **feedback.ts:** feedback.

## Resolved questions
- Practices are expanded on read from the RRULE; RSVPs key off (series_id, original_start, user_id).
