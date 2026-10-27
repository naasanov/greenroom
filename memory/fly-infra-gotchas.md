---
name: fly-infra-gotchas
description: Non-obvious Fly.io/Cloudflare facts for greenroom staging (merged deploy token format, flyctl path, DNS-only CNAMEs, db has no IPs)
type: project
---

Learned while standing up staging on 2026-10-19:

- On the Mac, flyctl lives at `~/.fly/bin/fly` (official installer, never Homebrew); prepend it to PATH in commands. On the factory (`FACTORY=1`), `fly`/`flyctl` are on PATH but not logged in, so staging deploys happen only through CI on push to `main`.
- `FLY_API_TOKEN` in GitHub Actions is two per-app deploy tokens merged as `FlyV1 <api macaroons>,<web macaroons>`: a single `FlyV1 ` prefix. Joining two full `FlyV1 ...` tokens with a comma fails auth. Tokens expire 2027-10 (8760h).
- `fly deploy` must be run from the repo root with `.` as the working dir plus `-c infra/fly/<file>.toml --dockerfile apps/<x>/Dockerfile`.
- Staging DNS: Cloudflare CNAMEs `staging` and `api.staging` to the `.fly.dev` hosts, DNS-only (grey cloud) so Fly terminates TLS.
- `greenroom-staging-db` has no public or private (Flycast) IPs; the API reaches it at `greenroom-staging-db.internal:5432`. DB password is in the Keychain as `GREENROOM_STAGING_DB_PASSWORD`.

**Why:** these cost debugging time once and aren't obvious from the configs.

**How to apply:** check here before touching deploys, tokens, or DNS; when creating prod, follow `infra/fly/README.md` and repeat the token merge format. Related: [[secrets-in-keychain]].
