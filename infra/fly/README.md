# Fly.io staging runbook

Staging: web `https://staging.greenroom.fyi`, api `https://api.staging.greenroom.fyi`, region `iad`.
Apps: `greenroom-staging-web`, `greenroom-staging-api`, `greenroom-staging-db` (self-run `postgres:17`, private network only).
Prod is a copy: drop `staging-` from app names, use apex `greenroom.fyi` and `api.greenroom.fyi`, copy the tomls to `prod.*.toml`.

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
