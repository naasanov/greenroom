# YouTube connect

Lazy per-user YouTube connection for saving playlists to the user's own YouTube account. The export dialog shows "Connect to YouTube to export" until a user has connected. One YouTube connection per user (`oauth_connections`, `provider = "youtube"`, unique on `user_id + provider`). Tokens are AES-256-GCM encrypted with `OAUTH_TOKEN_KEY` (`common/token-crypto.ts`).

It reuses the existing Google OAuth client (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and the `GOOGLE_OAUTH` adapter, so no new env vars. A YouTube connection is independent of Google sign-in and of the band's Drive link (`google-connect`).

Scopes requested: `openid email https://www.googleapis.com/auth/youtube`, with `access_type=offline`, `prompt=consent`, `include_granted_scopes=false`. `openid email` identify the account (shown as the connected account); the `youtube` scope is the grant that matters. If the user unticks it on Google's consent screen the connect is treated as an error and the token is revoked.

## Routes

All routes need a session except the callback.

| Route                                               | Behavior                                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /integrations/youtube`                         | `200 { connected: boolean, displayName: string \| null }` (the Google account email).                                                                     |
| `GET /integrations/youtube/start?redirectTo=<path>` | `302` to Google's authorize URL. Full-page navigation. `redirectTo` must be a same-site relative path; anything else becomes `/`.                         |
| `GET /integrations/youtube/callback?code&state`     | Public; authorized by the single-use `state`. Exchanges the code, upserts the connection, then `302` to `${WEB_URL}${redirectTo}` with `youtube=connected`. |
| `DELETE /integrations/youtube`                      | `204`. Revokes the refresh token with Google (best effort) and deletes the connection (idempotent).                                                       |

The redirect URI is `${API_PUBLIC_URL}/integrations/youtube/callback`. After the round trip the browser lands on `${WEB_URL}${redirectTo}?...&youtube=connected|error`. `error` covers user denial, a bad/expired/reused `state` (lands on `/`), a failed code exchange, a missing refresh token, and a missing `youtube` scope. The export dialog reads `youtube`, `export` and `exportName`, reopens with the playlist name kept, and strips them from the URL.

## Token lifecycle

`getAccessToken(userId)` returns a usable access token, refreshing when it expires within 60 seconds. If Google answers `invalid_grant` the connection is deleted and the method returns `null` ("not connected").

## Export contract

`POST /bands/:bandId/songs/export/youtube` `{ name, sort? }` (library, in the given sort) and `POST /bands/:bandId/setlists/:setlistId/export/youtube` `{ name }` (setlist order) create one private playlist in the user's account and answer `200 { playlistId, playlistUrl, name, exported, skipped: [{ songId, title }], leftOut }`.

- A song's video is its YouTube link, else its YouTube Music link (`youtubeVideoId` in `@greenroom/shared`). Songs with neither, and videos YouTube refuses to add, are `skipped`. Repeated videos are added once.
- At most 50 videos are added (`YOUTUBE_PLAYLIST_MAX`); extra linked songs are counted in `leftOut`.
- No connection, a revoked grant, or a connection without the `youtube` scope: `409 { "code": "YOUTUBE_LOGIN_REQUIRED" }`.
- Google account without a YouTube channel: `409 { "code": "YOUTUBE_NO_CHANNEL" }`.
- Daily Data API quota exhausted (`quotaExceeded`): `503 { "code": "YOUTUBE_QUOTA_EXCEEDED" }`. The connection stays.
- No song has a YouTube link: `422 { "code": "NOTHING_TO_EXPORT" }`, and no playlist is created.
- Other YouTube failures: `502`.

## Quota

The Data API default is 10,000 units per day for the whole Google Cloud project. `playlists.insert` and each `playlistItems.insert` cost 50 units, so a 20 song playlist costs about 1,050 units (roughly nine such exports per day across all users). A quota increase request in Google Cloud is the fix if this becomes limiting.

## Fakes

With `INTEGRATIONS_MODE=fake` the Google fake builds the authorize URL (a dead domain, or `${API_PUBLIC_URL}/fake-google/authorize` with a "Connect demo Google account" page when `STAGING_LOGIN_PASSCODE` is set). Fake codes are `fake-code:<email>`. Test controls: `GET /__test__/youtube/created-playlists`, `POST /__test__/youtube/quota-exceeded {on}`, `POST /__test__/youtube/unavailable-videos {ids}`, `POST /__test__/google/revoke-refresh-tokens`.

## Google Cloud checklist (manual, cannot be verified in CI)

1. Enable the YouTube Data API v3 in the Google Cloud project that owns the OAuth client.
2. Add the `https://www.googleapis.com/auth/youtube` scope to the OAuth consent screen.
3. Add the redirect URIs to the OAuth client: `${API_PUBLIC_URL}/integrations/youtube/callback` for each environment (prod and staging API origins, plus `http://localhost:4000/integrations/youtube/callback` for local dev if used).
4. Add test users while the consent screen is in Testing mode.
5. Later, submit the app for Google verification: privacy policy URL, justification for the sensitive `youtube` scope, and a demo video of the flow. Until it is approved the app is capped at 100 users and shows an unverified-app warning.
