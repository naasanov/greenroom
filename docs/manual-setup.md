# Manual setup instructions

Step-by-step instructions for the human tasks listed under "Manual setup" in [execution-plan.md](./execution-plan.md). Each `##` heading matches an item name there; the staging `/status` page shows these steps under that item.

Every secret goes into the macOS Keychain on the dev Mac under the exact env var name shown, never into chat. The orchestrator on the Mac reads it from there and sets it in `.env` and on Fly. The remote factory (`FACTORY=1`) has no Keychain and does not receive these secrets.

## How to hand over secrets
1. In a terminal on the dev Mac, run this once per value, replacing `NAME` with the env var name from the item's steps:
   - `security add-generic-password -a "$USER" -s NAME -U -w`
   - It prompts for the value (hidden) twice. Paste it each time. `-U` overwrites an existing entry, so the same command also updates a value.
2. To check what is stored without printing it: `security find-generic-password -s NAME >/dev/null && echo stored`
3. Tell the orchestrator which names you added. It copies them into `.env` and the Fly apps.

## Google Cloud project
Used for Google sign-in, Drive, Calendar, the Drive folder Picker, and the venue type-ahead (Places).

1. Go to https://console.cloud.google.com, signed in as the Google account that should own the project (ideally the band's shared account).
2. Create a project: project picker (top left) > **New project** > name it `Greenroom` > **Create**. Make sure it is selected afterwards.
3. Enable the APIs: **APIs & Services > Library**, search for each and click **Enable**:
   - Google Drive API
   - Google Calendar API
   - Google Picker API
   - Places API (New) (not the legacy "Places API")
   - Places needs a billing account on the project: **Billing > Link a billing account**. The monthly free credit covers a band's usage.
4. Configure the consent screen: **APIs & Services > OAuth consent screen** (also labelled **Google Auth Platform**) > **Get started**.
   - App name `Greenroom`, user support email: yours. Audience: **External**. Contact email: yours. Agree and **Create**.
   - **Branding**: app home page `https://greenroom.fyi`, authorized domain `greenroom.fyi`. Save.
   - **Data access > Add or remove scopes**: add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`, `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/calendar`. Save.
   - **Audience > Publishing status**: click **Publish app** to move it to **In production**. Do not submit it for verification. Testing mode would make Drive and Calendar logins expire every 7 days. Sign-in shows no warning; the admin who links Drive sees Google's "unverified app" screen once (click **Advanced > Go to Greenroom**). Unverified apps are capped at 100 users.
5. Create the OAuth client: **Clients** (or **Credentials > Create credentials > OAuth client ID**) > type **Web application**, name `Greenroom web`.
   - Authorized JavaScript origins: `https://staging.greenroom.fyi`, `https://greenroom.fyi`, `http://localhost:3000`
   - Authorized redirect URIs (all six):
     - `https://api.staging.greenroom.fyi/auth/google/callback`
     - `https://api.staging.greenroom.fyi/integrations/google/callback`
     - `https://api.greenroom.fyi/auth/google/callback`
     - `https://api.greenroom.fyi/integrations/google/callback`
     - `http://localhost:4000/auth/google/callback`
     - `http://localhost:4000/integrations/google/callback`
   - **Create**, then store the two values shown: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
6. Create the server key for Places: **APIs & Services > Credentials > Create credentials > API key**. Open it (**Edit API key**):
   - Name `Greenroom server (Places)`. Application restrictions: **None** (the server has no fixed IP). API restrictions: **Restrict key** > only **Places API (New)**. Save.
   - Store it as `GOOGLE_PLACES_API_KEY`.
7. Create the browser key for the Drive Picker: **Create credentials > API key** again, then edit it:
   - Name `Greenroom browser (Picker)`. Application restrictions: **Websites**, add `https://staging.greenroom.fyi/*`, `https://greenroom.fyi/*`, `http://localhost:3000/*`. API restrictions: only **Google Picker API**. Save.
   - Store it as `GOOGLE_PICKER_API_KEY`.
8. Copy the project number: **IAM & Admin > Settings** > **Project number** (digits only, not the project ID). Store it as `GOOGLE_PROJECT_NUMBER`.

Band calendars are owned by a Google service account, not a member. Use `greenroom-calendar@greenroom-fyi.iam.gserviceaccount.com` in the `greenroom-fyi` project and make sure the **Google Calendar API** is enabled there. Create a JSON key for the account (**IAM & Admin > Service accounts > Keys > Add key**), base64 it onto one line (`base64 -w0 key.json`), and stage it as the Fly secret `CALENDAR_SA_KEY` with `fly secrets set -a greenroom-staging-api CALENDAR_SA_KEY=<base64>`; delete the key file afterwards. The variable is optional: without it calendar setup answers `409 CALENDAR_BOT_NOT_CONFIGURED`. Members receive the calendar as a share by email (no domain-wide delegation is needed). Keychain name: `CALENDAR_SA_KEY`.

Keychain names: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PLACES_API_KEY`, `GOOGLE_PICKER_API_KEY`, `GOOGLE_PROJECT_NUMBER`.

## Spotify developer app
Used for song search, track lookup, and public playlist import (app-level), and later for exporting playlists and importing private ones (user login).

1. Go to https://developer.spotify.com/dashboard and log in with the Spotify account that should own the app. Accept the developer terms if asked.
2. **Create app**:
   - App name `Greenroom`, description `Band setlists and song library`, website `https://greenroom.fyi`.
   - Redirect URIs (add each, then **Add**). Spotify does not accept `localhost`, so local dev uses `127.0.0.1`:
     - `https://api.staging.greenroom.fyi/integrations/spotify/callback`
     - `https://api.greenroom.fyi/integrations/spotify/callback`
     - `http://127.0.0.1:4000/integrations/spotify/callback`
   - Which APIs: tick **Web API**. Agree to the terms and **Save**.
3. Open the app > **Settings** > **Basic Information**. Store **Client ID** as `SPOTIFY_CLIENT_ID`, then click **View client secret** and store it as `SPOTIFY_CLIENT_SECRET`.
4. **User Management** tab: add the name and Spotify account email of each band member who will export playlists or import private ones. In development mode only listed users can log in with Spotify. Search and public imports work without this.

Keychain names: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`.

## Magic-link email provider
Resend sends the sign-in emails for people who don't use Google sign-in.

1. Sign up at https://resend.com.
2. **Domains > Add domain**: enter `greenroom.fyi`, region **North Virginia (us-east-1)** (closest to the Fly region). **Add**.
3. Resend shows DNS records (MX, SPF TXT, DKIM TXT, optionally DMARC). Do not add them yourself: tell the orchestrator, which adds them through the Cloudflare API (DNS-only, not proxied). Then click **Verify DNS records** in Resend once they're in (can take a few minutes).
4. **API Keys > Create API key**: name `greenroom`, permission **Sending access**, domain `greenroom.fyi`. Store it as `RESEND_API_KEY`.
5. Emails go out from `Greenroom <signin@greenroom.fyi>`; no mailbox is needed for that address.

Keychain names: `RESEND_API_KEY`.

## Sentry
Error reporting for the web app and the API.

1. Sign up at https://sentry.io and create an organization (e.g. `greenroom`). The free Developer plan is enough.
2. **Projects > Create project**, twice:
   - Platform **Next.js**, name `greenroom-web`.
   - Platform **Node.js** (or **NestJS** if listed), name `greenroom-api`.
   - Skip the setup wizards; the orchestrator wires the SDKs.
3. For each project: **Settings > Projects > (project) > Client Keys (DSN)**, copy the DSN. Store them as `SENTRY_DSN_WEB` and `SENTRY_DSN_API`.
4. For readable stack traces: **Settings > Auth Tokens** (organization tokens) > **Create new token**, name `greenroom-ci`. Store it as `SENTRY_AUTH_TOKEN`, and tell the orchestrator your organization slug (shown in the Sentry URL).

Keychain names: `SENTRY_DSN_WEB`, `SENTRY_DSN_API`, `SENTRY_AUTH_TOKEN`.

## Secrets
Done by following "How to hand over secrets" above for each item. Mark this done once every Keychain name listed in the other items is stored and the orchestrator has confirmed it loaded them.

## Real test accounts for Phase 8
An agent walks through the real app on staging in Phase 8 with real Google and Spotify accounts.

1. Create (or pick) a Google account for testing, e.g. a new Gmail.
2. Create (or pick) a free Spotify account and add its email under the Spotify app's **User Management**.
3. Keep your phone nearby during the walkthrough: you'll be asked to complete sign-ins and any 2FA prompts yourself. Passwords are never handed over.
4. Tell the orchestrator the two account emails (not secrets).
