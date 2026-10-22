# Spotify connect

Lazy per-user Spotify login. Search and track lookup use app-level credentials; reading playlist contents needs the user's own token, so playlist import requires a connection. One Spotify connection per user (`oauth_connections`, unique on `user_id + provider`). Tokens are AES-256-GCM encrypted with `OAUTH_TOKEN_KEY` (`common/token-crypto.ts`).

Scopes requested: `playlist-read-private playlist-read-collaborative`.

## Routes
All routes need a session except the callback.

| Route | Behavior |
| --- | --- |
| `GET /integrations/spotify` | `200 { connected: boolean, displayName: string \| null }` for the current user. |
| `GET /integrations/spotify/start?redirectTo=<path>` | `302` to Spotify's authorize URL. This is a full-page navigation (not fetch): send the browser to `${API}/integrations/spotify/start?redirectTo=...`. `redirectTo` must be a same-site relative path (e.g. `/library`); anything else becomes `/`. |
| `GET /integrations/spotify/callback?code&state` | Public; authorized by `state`. Exchanges the code, upserts the connection, then `302` to `${WEB_URL}${redirectTo}` with `spotify=connected` set as a query param. |
| `DELETE /integrations/spotify` | `204`. Deletes the connection (idempotent). |

## Return param
After the round trip the browser lands on `${WEB_URL}${redirectTo}?...&spotify=connected|error`. `error` covers user denial (`error=access_denied`), a bad/expired/reused `state` (lands on `/`, since the return path cannot be trusted), and a failed code exchange. The UI should read `spotify`, act on it (for example resume the import), then strip it from the URL.

## State and redirect URI
- The redirect URI is `${API_PUBLIC_URL}/integrations/spotify/callback`, except a `localhost` host becomes `127.0.0.1` (Spotify rejects `localhost`). The session cookie may not be sent to that host, so the callback does not use it.
- `state` is a random 32-byte value; only its SHA-256 is stored (`oauth_states`: user id, redirectTo, 10 minute expiry). It is deleted on first use, so replays fail.

## Token lifecycle
`SpotifyConnectionsService.getAccessToken(userId)` returns a usable access token, refreshing when it expires within 60 seconds and persisting a rotated refresh token if Spotify returns one. If Spotify answers `invalid_grant`, the connection is deleted and the method returns `null` ("not connected").

## Playlist import contract
`POST /bands/:bandId/songs/import` with `{ url }`:
- No connection, or the grant was revoked (connection removed): `409 { "code": "SPOTIFY_LOGIN_REQUIRED", "message": ... }`. The UI should send the user through `start` with `redirectTo` set to the page they were on, then retry the import on return with `spotify=connected`.
- Playlist missing or not accessible to that Spotify account: `404 { "code": "PLAYLIST_NOT_FOUND_OR_PRIVATE" }`.
- Otherwise `202` with import progress (unchanged).

## Fakes and staging
With `INTEGRATIONS_MODE=fake` the authorize URL is a dead domain, except when `STAGING_LOGIN_PASSCODE` is set (staging): then it is `${API_PUBLIC_URL}/fake-spotify/authorize`, an API-served page with a "Connect demo Spotify" button (and Cancel, which returns `error=access_denied`). On staging any playlist id imports a 10-track demo set. Fake codes are `fake-code:<name>`; `POST /__test__/spotify/revoke-refresh-tokens` makes refreshes fail with invalid-grant.
