# Fly.io staging runbook

Staging: web `https://staging.greenroom.fyi`, api `https://api.staging.greenroom.fyi`, region `iad`.
Apps: `greenroom-staging-web`, `greenroom-staging-api`, `greenroom-staging-db` (self-run `postgres:17`, private network only).
Production (`greenroom.fyi`, `api.greenroom.fyi`) is a copy of this setup; see the [Production](#production) section at the end.

All commands run from the repo root. On the Mac `fly` is `~/.fly/bin/fly`; on the remote factory (`FACTORY=1`) `fly` is on PATH but not logged in, so deploys there go through CI on push to `main`. Never print secrets.

```sh
export PATH="$HOME/.fly/bin:$PATH"   # Mac only
fly auth whoami   # must be logged in
ORG=personal      # adjust if the Fly org differs
```

## 1. Create apps and volume

```sh
fly apps create greenroom-staging-db  -o $ORG
fly apps create greenroom-staging-api -o $ORG
fly apps create greenroom-staging-web -o $ORG
fly volumes create pgdata -a greenroom-staging-db -r iad -s 1 -n 1 --yes
```

## 2. Database password and secrets

The password is hex (URL-safe), held in a shell variable, stored in the Keychain (Mac), and piped to Fly.
`--stage` queues secrets until the first deploy because no machines exist yet.

```sh
DB_PW=$(openssl rand -hex 24)
security add-generic-password -a "$USER" -s GREENROOM_STAGING_DB_PASSWORD -w "$DB_PW" -U
printf 'POSTGRES_PASSWORD=%s\n' "$DB_PW" | fly secrets import --stage -a greenroom-staging-db
printf 'DATABASE_URL=postgres://greenroom:%s@greenroom-staging-db.internal:5432/greenroom\n' "$DB_PW" \
  | fly secrets import --stage -a greenroom-staging-api
unset DB_PW
```

Read it back later with `security find-generic-password -s GREENROOM_STAGING_DB_PASSWORD -w`.

Optional API secret `CALENDAR_SA_KEY` is the base64 of the JSON key of the service account `greenroom-calendar@greenroom-fyi.iam.gserviceaccount.com`, which owns band calendars (scope `calendar`). Stage it from a laptop with `fly secrets set -a greenroom-staging-api CALENDAR_SA_KEY="$(base64 -w0 key.json)"` (on macOS `base64 -i key.json | tr -d '\n'`), then delete the key file. Without it, calendar setup answers `409 CALENDAR_BOT_NOT_CONFIGURED` in real mode.

## 3. Deploy: db, then api, then web

```sh
fly deploy -c infra/fly/staging.db.toml --ha=false --no-public-ips
fly deploy . -c infra/fly/staging.api.toml --dockerfile apps/api/Dockerfile --remote-only --ha=false
fly deploy . -c infra/fly/staging.web.toml --dockerfile apps/web/Dockerfile --remote-only --ha=false
```

The api deploy runs `release_command` (migrations) against the db before releasing.
The db app must show no IPs: `fly ips list -a greenroom-staging-db` should be empty.

## 4. Certificates

```sh
fly certs add staging.greenroom.fyi     -a greenroom-staging-web
fly certs add api.staging.greenroom.fyi -a greenroom-staging-api
```

## 5. Cloudflare DNS (DNS-only, grey cloud, so Fly terminates TLS)

```sh
CLOUDFLARE_API_TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' .env | cut -d= -f2-)
CF="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
ZONE_ID=$(curl -s -H "$CF" "https://api.cloudflare.com/client/v4/zones?name=greenroom.fyi" | jq -r '.result[0].id')

curl -s -X POST -H "$CF" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  --data '{"type":"CNAME","name":"staging","content":"greenroom-staging-web.fly.dev","proxied":false,"ttl":1}' | jq '.success,.errors'

curl -s -X POST -H "$CF" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  --data '{"type":"CNAME","name":"api.staging","content":"greenroom-staging-api.fly.dev","proxied":false,"ttl":1}' | jq '.success,.errors'
unset CLOUDFLARE_API_TOKEN CF
```

Then wait for issuance: `fly certs check staging.greenroom.fyi -a greenroom-staging-web` and the same for the api (Ready / issued).
If `fly certs add` asks for an `_acme-challenge` record, create the CNAME it prints the same way.

## 6. GitHub deploy token

The workflow deploys two apps, so create one deploy token per app and merge them. Each token is `FlyV1 <macaroons>`; the merged token keeps a single `FlyV1 ` prefix (two full tokens joined by a comma fail to authenticate).

```sh
T_API=$(fly tokens create deploy -a greenroom-staging-api -x 8760h | tail -n1)
T_WEB=$(fly tokens create deploy -a greenroom-staging-web -x 8760h | tail -n1)
printf '%s,%s' "$T_API" "${T_WEB#FlyV1 }" | gh secret set FLY_API_TOKEN --repo naasanov/greenroom
unset T_API T_WEB
```

Fallback if the comma list is rejected: `fly tokens create org -o $ORG -x 8760h` piped to `gh secret set FLY_API_TOKEN` (broader scope).

## 7. Verify

```sh
curl -s https://api.staging.greenroom.fyi/health          # {"status":"ok",...,"database":"up"}
curl -s -o /dev/null -w "%{http_code}\n" https://staging.greenroom.fyi/   # 200
dig +short staging.greenroom.fyi api.staging.greenroom.fyi
fly status -a greenroom-staging-api
```

Machines auto-stop when idle, so the first request after idle takes a few seconds.

## Later deploys

`pnpm deploy:staging` (api then web) from a laptop, or merge to `main`: `deploy-staging.yml` runs after CI succeeds.

## Backups

Fly takes daily volume snapshots; `staging.db.toml` keeps them 7 days. List with `fly volumes snapshots list <vol-id>`.
Restore by creating a new volume from a snapshot (`fly volumes create pgdata --snapshot-id <id> ...`). For an extra copy, `pg_dump` over `fly proxy 5433:5432 -a greenroom-staging-db`.

## Rough monthly cost (staging)

| Item | Estimate |
| --- | --- |
| db machine, shared-cpu-1x 256MB, always on | about $2.00 |
| 1GB volume + snapshots | about $0.15 to $0.30 |
| api + web, shared-cpu-1x 256MB, auto-stopped | under $1 combined at low traffic |
| Shared IPv4 / IPv6, certs | $0 |
| Total | about $3 to $4 |

A dedicated IPv4 would add $2 per app; not needed.

## Staging sign-in

Staging ran fake integrations until 2026-10-28, when it switched to real Google and Spotify (`INTEGRATIONS_MODE = "real"` in `staging.api.toml`). The passcode page below exists only while the mode is fake; to use it again, set the mode back to `"fake"`. Instead, setting a passcode secret makes "Sign in with Google" open a built-in page at `/fake-google/authorize` (email, passcode, and an option to create a "Demo Band" with sample members, gigs, songs and a weekly practice when the user has no band).

```sh
fly secrets set STAGING_LOGIN_PASSCODE=<passcode> -a greenroom-staging-api
```

The route exists only when `INTEGRATIONS_MODE=fake` and the secret is non-empty, both read at startup. Never set it on prod: prod runs real integrations, so the route never exists there. Wrong passcodes are limited to 10 per IP per 15 minutes.

## Production

Prod mirrors staging: web `https://greenroom.fyi` (apex), api `https://api.greenroom.fyi`, region `iad`, apps `greenroom-web`, `greenroom-fyi-api`, `greenroom-db`. Configs are `infra/fly/prod.{db,api,web}.toml`. Differences from staging: real integrations, session cookie `gr_session` with `COOKIE_DOMAIN=greenroom.fyi`, api `min_machines_running = 1` with 512MB (background pollers run every minute and must not be stopped), 14 day snapshots. Prod never sets `STAGING_LOGIN_PASSCODE`. Creating these resources and DNS needs explicit user approval.

### P1. Create apps and volume

```sh
fly apps create greenroom-db  -o $ORG
fly apps create greenroom-fyi-api -o $ORG
fly apps create greenroom-web -o $ORG
fly volumes create pgdata -a greenroom-db -r iad -s 1 -n 1 --yes
```

### P2. Database password and secrets

```sh
DB_PW=$(openssl rand -hex 24)
security add-generic-password -a "$USER" -s GREENROOM_PROD_DB_PASSWORD -w "$DB_PW" -U
printf 'POSTGRES_PASSWORD=%s\n' "$DB_PW" | fly secrets import --stage -a greenroom-db
printf 'DATABASE_URL=postgres://greenroom:%s@greenroom-db.internal:5432/greenroom\n' "$DB_PW" \
  | fly secrets import --stage -a greenroom-fyi-api
unset DB_PW
```

API secrets (set with `fly secrets set --stage -a greenroom-fyi-api NAME=value`, or pipe `NAME=value` lines to `fly secrets import --stage`). Names come from `.env.example` and the api code.

| Secret | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Set in P2. |
| `OAUTH_TOKEN_KEY` | yes | `openssl rand -base64 32`; encrypts stored OAuth tokens. Losing it invalidates stored Google and Spotify links. Keep a copy in the Keychain. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | yes | Google OAuth web client (sign-in, Calendar, Drive). |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | yes | Spotify app credentials. |
| `GOOGLE_PLACES_API_KEY` | yes | Venue search and photos. |
| `GOOGLE_PICKER_API_KEY`, `GOOGLE_PROJECT_NUMBER` | yes for Drive folder picking | Without them the picker config returns nulls and the Drive picker cannot open. |
| `CALENDAR_SA_KEY` | yes for calendar setup | Base64 one-line JSON key of `greenroom-calendar@greenroom-fyi.iam.gserviceaccount.com` (see the staging note above). Without it calendar setup answers `409 CALENDAR_BOT_NOT_CONFIGURED`. |
| `YOUTUBE_API_KEY` | optional | Without it YouTube songs get no auto duration. |
| `GITHUB_FEEDBACK_TOKEN` | optional | Fine-grained PAT, Issues write on `naasanov/greenroom`. Without it `POST /feedback` returns 503. |
| `RESEND_API_KEY` | required for sign-in in real mode | Resend key with Sending access on `greenroom.fyi`. Without it magic-link sign-in fails. |
| `RESEND_WEBHOOK_SECRET` | required for calendar replies | Svix signing secret (`whsec_...`) of the Resend inbound webhook; see "Calendar invite replies (Resend inbound)". Without it the webhook answers 401 and replies from calendars are not applied. |
| `EMAIL_FROM` | optional | From address for magic-link emails; default `Greenroom <login@greenroom.fyi>`. Must be on the verified `greenroom.fyi` domain. |

Non-secret values (`GITHUB_FEEDBACK_REPO` defaults to `naasanov/greenroom`) need no setting. No Sentry DSN variables exist in the code. Never set `STAGING_LOGIN_PASSCODE` on prod.

### P3. First deploy: db, then api, then web

```sh
fly deploy -c infra/fly/prod.db.toml --ha=false --no-public-ips
fly deploy . -c infra/fly/prod.api.toml --dockerfile apps/api/Dockerfile --remote-only --ha=false
fly deploy . -c infra/fly/prod.web.toml --dockerfile apps/web/Dockerfile --remote-only --ha=false
fly ips list -a greenroom-db   # must be empty
```

### P4. Certificates

```sh
fly certs add greenroom.fyi     -a greenroom-web
fly certs add api.greenroom.fyi -a greenroom-fyi-api
```

### P5. Cloudflare DNS (DNS-only, grey cloud)

Reuse the `CF` header and `ZONE_ID` from step 5. Run `fly ips list -a greenroom-web` and `fly certs show greenroom.fyi -a greenroom-web` for the exact targets. The apex cannot be a plain CNAME at most DNS hosts, but Cloudflare flattens a root CNAME, so either of these works (keep `proxied: false`):

```sh
# Option A: A + AAAA to the web app's Fly addresses (from fly ips list)
curl -s -X POST -H "$CF" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  --data '{"type":"A","name":"@","content":"<web v4>","proxied":false,"ttl":1}' | jq '.success,.errors'
curl -s -X POST -H "$CF" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  --data '{"type":"AAAA","name":"@","content":"<web v6>","proxied":false,"ttl":1}' | jq '.success,.errors'

# Option B: flattened CNAME at the apex
curl -s -X POST -H "$CF" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  --data '{"type":"CNAME","name":"@","content":"greenroom-web.fly.dev","proxied":false,"ttl":1}' | jq '.success,.errors'

# api subdomain
curl -s -X POST -H "$CF" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  --data '{"type":"CNAME","name":"api","content":"greenroom-fyi-api.fly.dev","proxied":false,"ttl":1}' | jq '.success,.errors'
```

Add any `_acme-challenge` CNAME that `fly certs add` prints. Then `fly certs check greenroom.fyi -a greenroom-web` and `fly certs check api.greenroom.fyi -a greenroom-fyi-api` until issued. Existing `staging` and `api.staging` records are unaffected.

### P6. GitHub `production` environment and deploy token

Create the environment in the repo settings (Settings, Environments, `production`) and add required reviewers so each prod deploy needs approval. Store the token as an environment secret named `FLY_API_TOKEN` (separate from the repo-level staging secret):

```sh
T_API=$(fly tokens create deploy -a greenroom-fyi-api -x 8760h | tail -n1)
T_WEB=$(fly tokens create deploy -a greenroom-web -x 8760h | tail -n1)
printf '%s,%s' "$T_API" "${T_WEB#FlyV1 }" | gh secret set FLY_API_TOKEN --env production --repo naasanov/greenroom
unset T_API T_WEB
```

### P7. OAuth redirect URIs

Add these exact URIs for prod (keep the staging ones):

| Provider | Redirect URI |
| --- | --- |
| Google (sign-in) | `https://api.greenroom.fyi/auth/google/callback` |
| Google (Calendar and Drive linking) | `https://api.greenroom.fyi/integrations/google/callback` |
| Spotify | `https://api.greenroom.fyi/integrations/spotify/callback` |

Also add `https://greenroom.fyi` as an authorized JavaScript origin for the Google client (Drive picker), and make sure the OAuth consent screen is published for external users.

### P8. Deploy and verify

```sh
gh workflow run deploy-prod.yml -f ref=main
gh run watch    # pick the deploy-prod run; approve the pending deployment in the GitHub UI if reviewers are required
curl -s https://api.greenroom.fyi/health
curl -s -o /dev/null -w "%{http_code}\n" https://greenroom.fyi/
```

`deploy-prod.yml` is manual only. It refuses to run unless the chosen commit has a successful CI run, deploys api then web, and fails if `/health` is not ok afterwards.

### Rollback and backups

```sh
fly releases -a greenroom-fyi-api            # find the last good version / image
fly releases -a greenroom-fyi-api --image    # shows image refs
fly deploy -c infra/fly/prod.api.toml --image <registry.fly.io/greenroom-fyi-api:deployment-...>
```

Repeat for `greenroom-web`. Rolling the api back does not undo migrations, so keep migrations backward compatible. Backups: daily Fly volume snapshots kept 14 days (`fly volumes snapshots list <vol-id> -a greenroom-db`), restored by creating a new volume from a snapshot. Take a `pg_dump` before risky migrations: `fly proxy 5433:5432 -a greenroom-db`.

## Calendar invite replies (Resend inbound)

Manual one-time setup so replies sent from Google, Outlook or Apple Calendar reach the app. Nothing here is automated. Replies go to `rsvp+<token>@<EMAIL_REPLY_DOMAIN>` (default `greenroom.fyi`).

1. **Pick the receiving domain.** Resend requires its MX record to have the lowest priority value on the domain, so it replaces any other mail service on the same name. If `greenroom.fyi` already receives mail (a real inbox), use a subdomain such as `reply.greenroom.fyi` instead and set `EMAIL_REPLY_DOMAIN=reply.greenroom.fyi` on the api app. The From address of invites then also uses that domain, so verify it for sending in Resend too.
2. **Enable receiving.** Resend dashboard, Domains, open the domain (add and verify it first if it is a new subdomain), turn on the receiving toggle. A dialog shows the MX record.
3. **Add the MX record in Cloudflare** exactly as Resend shows it: type `MX`, name the domain (or subdomain), value the host Resend gives (for example `inbound-smtp.<region>.amazonaws.com` or `receive.forge.rmta.net`; it varies per domain), priority as shown. DNS only (grey cloud). Click "I've added the record" and wait until receiving shows verified. Do not point other MX records at a lower priority.
4. **Create the webhook.** Resend dashboard, Webhooks, Add webhook: endpoint `https://api.greenroom.fyi/webhooks/resend/inbound` (staging: the staging api URL), event `email.received`. Copy the signing secret from the webhook details page.
5. **Set the secret** (restarts the machine, which briefly drops sessions):
   ```sh
   fly secrets set RESEND_WEBHOOK_SECRET=whsec_... -a greenroom-fyi-api
   ```
   Use `-a greenroom-staging-api` for staging. `RESEND_API_KEY` must have Full access, because the handler fetches the received message from the Receiving API (a Sending-only key cannot read it).
6. **Verify.** Send an invite to yourself, answer it in your calendar, then check that the RSVP changed in the app. In Resend, Webhooks, the delivery log should show 200. A 401 means the secret is wrong or missing.

Replies from unknown senders, forged tokens and gig invites are answered with 200 and ignored, so the log shows 200 for them too.
