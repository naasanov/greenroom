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
- [Commit cadence](commit-cadence.md) — orchestrator commits on its own after validated checkpoints; no branching/pushing unless asked
- [Secrets in Keychain](secrets-in-keychain.md) — secrets are Keychain generic passwords named after the env var; inject into .env with `security`, never print
- [Scaffold gotchas](scaffold-gotchas.md) — Nest 12 ESM + ESLint (not oxlint), shadcn `cn` package, shared package must build first
