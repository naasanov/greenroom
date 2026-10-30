# Public calendar

A view-only, token-addressed list of a band's upcoming shows (web page at `/c/<token>`).

- Admin (`@BandAdmin`): `GET /bands/:bandId/public-calendar` returns `{ token, url }`; `POST .../reset` writes a new `bands.public_calendar_token`, so the old URL 404s at once.
- Anonymous: `GET /public/calendar/:token`, `@Public` plus `ThrottlerGuard` (per IP, `PUBLIC_CALENDAR_REQUESTS_PER_MINUTE`, default 60; `x-test-ip` honored in fake mode).
- The response is a whitelist: band name, photo, bio, social links (instagram, tiktok, youtube, spotify, website), booking email, and gigs with `title`, `date`, `startTime`, `venueName`. Gigs are upcoming (date today or later), not deleted, and `show_on_public_calendar` true.
- Never add setlist, lineup, notes, contact, load-in, media, practice, or id fields. The service selects explicit columns, and `api-public-calendar.spec.ts` asserts the payload shape.
- Profile fields are edited through `PATCH /bands/:bandId` (bands module). The per-gig toggle is `showOnPublicCalendar` on the gig DTO (default true).
