# Memory Index

One line per entry: `- [Title](file.md) — hook`. Keep this file an index only; content lives in the entry files.

## Entry format

Each entry is one file in `memory/` holding one fact:

```markdown
---
name: <short-kebab-case-slug, matches the filename>
description: <one-line summary used to judge relevance>
type: user | feedback | project | reference
applies-to: <optional: comma-separated path globs, or all>
---

<the fact. For feedback/project entries, follow with **Why:** and **How to apply:** lines. Link related entries with [[their-name]].>
```

- `user`: who the user is and how they like to work.
- `feedback`: guidance on how the agent should work (corrections and confirmed approaches), with the reason.
- `project`: ongoing decisions, goals, or constraints not derivable from the code or docs. Use absolute dates.
- `reference`: pointers to external resources (URLs, dashboards, accounts).

`applies-to` marks gotchas tied to code: the factory build pipeline pastes every entry whose globs match a unit's files into that unit's agent briefs. Add it to any entry about how code in a specific area must be written or tested. Entries are public: no secrets, emails or user data.

Before adding an entry, check for an existing one that covers it and update that instead. Delete entries that turn out to be wrong.

## Entries

- [Orchestrator role](orchestrator-role.md) — sessions start as Opus orchestrator; all code is written by Sonnet subagents
- [No plan approval](no-plan-approval.md) — never present a plan or use plan mode; design internally and start delegating
- [Parallel agent coordination](parallel-agent-coordination.md) — one lockfile owner per wave, orchestrator pre-installs deps, e2e and build mutex locks (`pnpm build:locked`)
- [Commit cadence](commit-cadence.md) — orchestrator commits and pushes on its own after validated checkpoints; watch CI + staging deploy
- [Status updates are immediate](status-updates-immediate.md) — push execution-plan status changes the moment they happen; /status reads GitHub main
- [Secrets in Keychain](secrets-in-keychain.md) — Mac: Keychain generic passwords named after the env var, inject with `security`, never print; factory: env vars only, real-mode secrets absent
- [Fly infra gotchas](fly-infra-gotchas.md) — merged FlyV1 deploy token format, deploy from repo root, DNS-only CNAMEs, db is private
- [Scaffold gotchas](scaffold-gotchas.md) — Nest 12 ESM + ESLint (not oxlint), shadcn `cn` package, shared package must build first; use @googleapis/<api>, not googleapis
- [Non-modal drawer gotchas](drawer-nonmodal-gotchas.md) — Radix stays modal under Vaul; close event drawers by id; focus trap and aria-hidden caveats
- [E2E test scope](e2e-test-scope.md) — locally only targeted specs + smoke, never the full suite; CI runs the full suite on push
- [Local run gotchas](local-run-gotchas.md) — full e2e across midnight fails date specs; `pnpm format` writes, revert stray reformatting; factory runs desktop only (WebKit crashes)
- [Batch pushes](batch-pushes.md) — CI cancels in-progress runs per push; push validated commits together
- [Known flaky e2e specs](flaky-e2e-specs.md) — the quarantine mechanism (apps/e2e/quarantine.json, now empty, non-blocking CI job) and the causes of past flakes; failures there are never CI failures, never weaken assertions
- [Stage snapshot source](stage-snapshot-source.md) — stage renders from the offline snapshot; write mutations through, return undefined (not empty) on fetch failure
- [Swipe gestures](swipe-gestures.md) — track pointerId, cancel on multi-touch, skip controls/portals, guard window keys, reset scroll
- [WebKit route interception](webkit-route-interception.md) — page.route does not hold or fulfill reliably on mobile; MutationObserver, desktop-only specs
- [Grep specs for changed behavior](grep-specs-for-changed-behavior.md) — run every spec that touches changed behavior, not only the feature's own
- [Pending save vs edit mode](pending-save-vs-edit-mode.md) — disable edit entry points while a mutation is pending; shared mutationKey, no reset mid-flight
- [Text locators vs list changes](e2e-text-locators-vs-list-changes.md) — adding items to a picker breaks `.first()` and hasText drawer specs; grep before pushing
- [Drawer and aside gotchas](drawer-aside-focus-gotchas.md) — retry-focus in the setlist aside, no always-mounted sheets, one aside, Escape in viewers
- [Calendar grid date dependence](calendar-grid-date-dependence.md) — seed dates are relative to today; page the grid with `pageToDay` / `pageAwayFromDay`
- [Untrusted file parsing caps](untrusted-file-parsing-caps.md) — cap bytes, pixels and element counts before decoding user files
- [Upload type allowlist](upload-type-allowlist.md) — type exceptions must still pass the per-link allow callback
- [Dialog grid min-width](dialog-grid-min-width.md) — long names widen the DialogContent grid track; use grid-cols-[minmax(0,1fr)] plus min-w-0 on direct children, not on the container
- [Folder link provenance](folder-link-provenance.md) — source_folder_id null means a hand link; hand upserts null it, backfill and poller keep the IS NOT NULL guard, chunk at 500, take the drive-poll lock
- [Migration journal collisions](migration-journal-collisions.md) — parallel branches claim the same migration number; rebuild _journal.json in ascending when order, never rename an applied migration
- [Factory DATABASE_URL is staging](factory-database-url-is-staging.md) — export local DATABASE_URL and TEST_DATABASE_URL in the same shell before any db, migrate, api test or e2e command
- [Legacy column fallback and deletes](legacy-column-fallback-delete.md) — deleting a source reference must clear the fallback column or the derived value returns
