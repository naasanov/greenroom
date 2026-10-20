---
name: secrets-in-keychain
description: API keys/secrets live in the macOS Keychain as generic passwords named after the env var; inject into .env with the security CLI, never print them
type: user
---

The user stores secrets (API tokens, client secrets, DSNs) in the macOS Keychain with `security add-generic-password`, using the env var name as the service name (e.g. `-s CLOUDFLARE_API_TOKEN`).

**Why:** the user's chosen workflow as of 2026-10-19, so secrets never get pasted into chat or committed.

**How to apply:** when a task needs a secret, check `security find-generic-password -s <VAR> >/dev/null` for existence, then write it into the repo-root `.env` (gitignored, chmod 600) via `security find-generic-password -s <VAR> -w` inside a command substitution. Never echo the value or include it in output, logs, or briefs; verify by checking the line exists or by calling the API. For Fly.io, pipe the same way into `fly secrets set`. If a secret is missing, ask the user to add it to the Keychain under the var name. Known entries: `CLOUDFLARE_API_TOKEN` (account-owned token: the `/user/tokens/verify` endpoint reports it invalid, but zone/DNS calls work).
