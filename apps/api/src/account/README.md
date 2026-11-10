# Account

Deleting your own account. Both routes need a session.

| Route | Notes |
| --- | --- |
| `GET /users/me/deletion-preview` | `DeletionPreview`: `deleteBands` (you are the only active member, roster-only members excluded), `leaveBands`, `blockedBands` (you are the last admin and others remain). Each entry is `{ id, name }`. |
| `DELETE /users/me` `{ confirm: "DELETE" }` | 204 and the session cookie is cleared. 400 for any other `confirm`. 409 `ACCOUNT_LAST_ADMIN` with `bands: [{ id, name }]` when `blockedBands` is not empty; nothing is changed. |

Deletion runs in one transaction: bands in `deleteBands` are deleted and the rest are left via `BandsService.leaveInTx` (same rules as `POST /bands/:id/leave`), then sessions, OAuth connections and states, the profile photo, instruments, magic-link tokens and feedback ownership are removed.

The `users` row is kept and anonymized (unique placeholder email, no Google sub, avatar, or calendar email) because memberships and past lineups point at it; `display_name` stays so lineup history keeps the name. Signing in again with the old email creates a fresh account.

After commit, best effort and never failing the request: calendar invite refresh for left bands, trashing the Drive copies of the profile photo, and revoking Google refresh tokens. Drive files are never deleted.
