# Memory Index

One line per entry: `- [Title](file.md) — hook`. Keep this file an index only; content lives in the entry files.

## Entry format

Each entry is one file in `memory/` holding one fact:

```markdown
---
name: <short-kebab-case-slug, matches the filename>
description: <one-line summary used to judge relevance>
type: user | feedback | project | reference
---

<the fact. For feedback/project entries, follow with **Why:** and **How to apply:** lines. Link related entries with [[their-name]].>
```

- `user`: who the user is and how they like to work.
- `feedback`: guidance on how the agent should work (corrections and confirmed approaches), with the reason.
- `project`: ongoing decisions, goals, or constraints not derivable from the code or docs. Use absolute dates.
- `reference`: pointers to external resources (URLs, dashboards, accounts).

Before adding an entry, check for an existing one that covers it and update that instead. Delete entries that turn out to be wrong.

## Entries

- [Orchestrator role](orchestrator-role.md) — sessions start as Opus orchestrator; all code is written by Sonnet subagents
- [No plan approval](no-plan-approval.md) — never present a plan or use plan mode; design internally and start delegating
- [Parallel agent coordination](parallel-agent-coordination.md) — one lockfile owner per wave, orchestrator pre-installs deps, e2e mutex lock
- [Commit cadence](commit-cadence.md) — orchestrator commits and pushes on its own after validated checkpoints; watch CI + staging deploy
- [Status updates are immediate](status-updates-immediate.md) — push execution-plan status changes the moment they happen; /status reads GitHub main
- [Secrets in Keychain](secrets-in-keychain.md) — Mac: Keychain generic passwords named after the env var, inject with `security`, never print; factory: env vars only, real-mode secrets absent
- [Fly infra gotchas](fly-infra-gotchas.md) — merged FlyV1 deploy token format, deploy from repo root, DNS-only CNAMEs, db is private
- [Scaffold gotchas](scaffold-gotchas.md) — Nest 12 ESM + ESLint (not oxlint), shadcn `cn` package, shared package must build first
- [Non-modal drawer gotchas](drawer-nonmodal-gotchas.md) — Radix stays modal under Vaul; close event drawers by id; focus trap and aria-hidden caveats
- [E2E test scope](e2e-test-scope.md) — targeted specs + smoke during work; full suite only at ticket end or gates
- [Local run gotchas](local-run-gotchas.md) — full e2e across midnight fails date specs; `pnpm format` writes, revert stray reformatting
- [Batch pushes](batch-pushes.md) — CI cancels in-progress runs per push; push validated commits together
