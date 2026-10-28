# Lineups

Routes under `/bands/:bandId/gigs/:gigId/lineup`, `@BandMember()`, any member may edit. Schemas: `packages/shared/src/setlists.ts`. A lineup is a list of memberships (`gig_lineup`); each entry returns `membershipId`, `userId`, `displayName`, `avatarUrl` and `left`.

| Route | Purpose |
| --- | --- |
| `GET /` | The lineup, sorted by name. |
| `PUT /` | `{ membershipIds }`: replaces the lineup. Ids must be memberships of this band (400 `INVALID_MEMBERSHIP`). A former member is accepted only if already in this lineup. |
| `POST /copy` | `{ sourceGigId }`: replaces the lineup with that gig's members (any gig of this band, past or future); people who have since left are not copied. 404 when either gig is not in the band. Returns the updated lineup. |
| `POST /copy-from-last` | Replaces the lineup with that of the latest earlier gig (by date, strictly before) that has one. People who have since left are not copied. 404 `NO_PREVIOUS_LINEUP` when none exists. Returns the lineup plus `sourceGigId`. |

## History

`GET /bands/:bandId/lineups/history?q=&limit=` (member-only; `limit` 1-100, default 30). Past gigs (date today or earlier) whose lineup has at least one current member, newest first. `q` matches title or venue, case-insensitive. Returns `[{ gigId, title, venueName, date, memberCount }]`; `memberCount` counts current members only (those a copy would add). The client filters out the gig being edited.

## Rules
- Gig creation (in `events/gigs.service.ts`) inserts every active member, so new gigs default to the full band.
- Former members stay listed by name with `left: true` (past lineups keep the person's name). On a gig dated today or earlier, a PUT that omits them keeps them; on a future gig an omitted former member is removed.
- A rejoin is a new membership row, so old lineups keep pointing at the old row.
