---
name: secrets-in-keychain
description: On the Mac, secrets live in the macOS Keychain named after the env var (inject with the security CLI, never print); on the factory they are env vars and real-mode secrets are not provisioned
type: user
---

**Mac only** (no `FACTORY=1` in the environment). The user stores secrets (API tokens, client secrets, DSNs) in the macOS Keychain with `security add-generic-password`, using the env var name as the service name (e.g. `-s CLOUDFLARE_API_TOKEN`).

**Why:** the user's chosen workflow as of 2026-10-19, so secrets never get pasted into chat or committed.

**How to apply:** when a task needs a secret, check `security find-generic-password -s <VAR> >/dev/null` for existence, then write it into the repo-root `.env` (gitignored, chmod 600) via `security find-generic-password -s <VAR> -w` inside a command substitution. Never echo the value or include it in output, logs, or briefs; verify by checking the line exists or by calling the API. For Fly.io, pipe the same way into `fly secrets set`. If a secret is missing, ask the user to add it to the Keychain under the var name. Known entries: `CLOUDFLARE_API_TOKEN` (account-owned token: the `/user/tokens/verify` endpoint reports it invalid, but zone/DNS calls work).

**Remote factory** (`FACTORY=1`, Linux): there is no Keychain. Secrets arrive as env vars injected from Fly secrets, and `.env` (already present) holds dev values only. Real-mode integration secrets, `CLOUDFLARE_API_TOKEN`, and `FLY_API_TOKEN` are deliberately not provisioned there; if a task needs one, ask the user instead of looking for it.
