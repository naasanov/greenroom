# Bands

Access guards for any route under `/bands/:bandId/...` (they run after the global `AuthGuard`).

```ts
import { BandAdmin, BandMember, CurrentMembership, type BandMembership } from "../bands/index.js";

@BandMember()                       // active member, else 404 (band ids never leak)
@Get(":bandId/gigs")
list(@CurrentMembership() m: BandMembership) {}   // { id, bandId, userId, role }

@BandAdmin()                        // non-member 404, non-admin member 403
@Post(":bandId/gigs/settings")
save(@CurrentMembership() m: BandMembership) {}
```

- The route param must be named `:bandId`. A malformed id is a 404.
- `@UseGuards` instantiates the guard in the host module; `DRIZZLE` is global, so no imports are needed.
- A `memberships` row with `left_at` set is not a member. Past lineups keep pointing at it.
- Instruments are per user (`user_instruments`), not per membership. Presets live in `@greenroom/shared`.
- 409 bodies carry `code`: `LAST_ADMIN`, `ONLY_MEMBER_MUST_DELETE` (`BAND_ERROR_CODES`).
- Invites: one active link per band; `GET /invites/:token` is public, accept needs a session.
