# Google connect

Per-band linking of Google Drive. (Google Calendar is not linked per user: band calendars are owned by a server-held service account, see `calendar-sync`. Old `calendar` link rows are ignored.) A link is a Google sign-in for whichever account the band chooses (a band account or a member's personal one); it can differ from the account used to sign into Greenroom. One link per band and service (`band_google_links`, unique on `band_id + service`). Tokens are AES-256-GCM encrypted with `OAUTH_TOKEN_KEY` (`common/token-crypto.ts`).

Scopes requested: `openid email` plus `https://www.googleapis.com/auth/drive` (service `drive`), with `access_type=offline`, `prompt=consent select_account`, `include_granted_scopes=false`. Shared types and Zod schemas: `packages/shared/src/google.ts`.

## Routes
All routes need a session except the callback. Non-members get 404 on band routes.

| Route | Behavior |
| --- | --- |
| `GET /bands/:bandId/integrations/google` | Any member. `{ drive: GoogleLinkStatus & { folderId }, calendar: GoogleLinkStatus & { calendarId } }` (calendar is `linked` when `bands.calendar_id` is set; its `email`, `linkedBy`, `linkedAt` are null) where `GoogleLinkStatus = { linked, email, linkedBy: { userId, displayName } \| null, linkedAt }`. `folderId` / `calendarId` come from `bands.drive_root_folder_id` / `bands.calendar_id`. |
| `GET /bands/:bandId/integrations/google/:service/start?redirectTo=<path>` | Any member. `302` to Google (404 for `calendar`, which has no sign-in). Full-page navigation, not fetch. `redirectTo` must be a same-site relative path, else `/`. Unknown service is 404. |
| `GET /integrations/google/callback?code&state[&error]` | Public; authorized by `state`. Redirect URI is `${API_PUBLIC_URL}/integrations/google/callback`. See below. |
| `DELETE /bands/:bandId/integrations/google/:service` | Band admins only (403 for other members). `204`, idempotent. `drive`: revokes the refresh token (best effort), deletes the link, and clears `drive_root_folder_id` + `drive_linked_by_user_id`. `calendar`: clears `calendar_id` + `calendar_linked_by_user_id` plus all Google event ids and sync state (calendar; no token is revoked and link rows are untouched). |
| `GET /bands/:bandId/integrations/google/drive/picker-config` | Any member. `{ accessToken, developerKey, appId, fake }` for the Google Picker; `developerKey` is `GOOGLE_PICKER_API_KEY`, `appId` is `GOOGLE_PROJECT_NUMBER` (both null when unset), `fake` is `INTEGRATIONS_MODE === "fake"`. `409 { code: "GOOGLE_NOT_LINKED" }` when Drive is not linked. |

## Return params
The callback redirects to `${WEB_URL}${redirectTo}` with `google=connected&service=drive` or `google=error&service=<...>&reason=<reason>`. Reasons: `denied` (user cancelled, `error` param), `scope_denied` (the service scope was not granted), `invalid_state` (unknown, reused or expired state; lands on `/` with no `service`), `exchange_failed` (code rejected, no refresh token, or Google unreachable). The UI should read the params, act on them, then strip them from the URL.

On success the link is upserted (replacing any existing link for that band and service) and `bands.drive_linked_by_user_id` is set to the user who started the flow. The folder id is set by a later flow, not here.

## State
`state` is a random 32-byte value; only its SHA-256 is stored in `oauth_states` (`provider=google`, `user_id`, `band_id`, `purpose` = service, `redirect_to`, 10 minute expiry). It is deleted on first use, so replays fail. The callback does not use the session cookie.

## Token lifecycle
`GoogleLinksService` is exported from `GoogleConnectModule` (import `google-connect/index.js`; the module imports no feature modules, so it cannot cause cycles):
- `getAccessToken(bandId, service): Promise<string | null>` returns a usable token, refreshing when it expires within 60 seconds and persisting a rotated refresh token if Google returns one. On `invalid-grant` the link is deleted, the band columns are cleared as in DELETE, and it returns null.
- `getLink(bandId, service)` returns the `band_google_links` row or undefined.
- `listLinkedBands(service)` returns band ids that have a link, for pollers.

## Fakes and staging
With `INTEGRATIONS_MODE=fake` the authorize URL is a dead domain. Fake codes are `fake-code:<email>`; the exchange returns a refresh token and the scopes that `start` requested. When `STAGING_LOGIN_PASSCODE` is set (staging) the URL is `${API_PUBLIC_URL}/fake-google/authorize` (shared with passcode sign-in, told apart by `redirect_uri`), an API-served page with a "Connect demo Google account" button (links `demo-band@example.com`) and Cancel (returns `error=access_denied`).
