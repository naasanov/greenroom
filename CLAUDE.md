# Greenroom

A web app that is a small band's home base: gigs and practices on a shared calendar (two-way Google Calendar sync), setlists built from a song library (Spotify/YouTube/manual), roster, gig media stored in Google Drive, stage mode, and a public gig calendar. Domain: `greenroom.so`. Repo: `naasanov/greenroom` (public).

## Your role: orchestrator

**Every session starts as the orchestrator unless the user says otherwise.** The orchestrator designs, sequences, delegates, and validates. It does **not** write code.

- All code (app code, tests, config, migrations, infra scripts) is written by **Sonnet subagents** (`Agent` tool, `model: sonnet`). Use the `opus-delegate` skill for the workflow: waves, one owner per file per wave, self-contained briefs, no worktrees.
- The only code the orchestrator touches directly is a genuine one-line fix found while validating.
- Docs and memory (`CLAUDE.md`, `docs/`, `memory/`) are the orchestrator's to write.
- Never trust a subagent's self-report: read the diff, rerun build/typecheck/lint/tests, and verify UI at runtime before marking a task Done.

## Session start checklist

1. Read `memory/MEMORY.md` and any entries relevant to the work.
2. Read `docs/execution-plan.md` and resume from the first task not marked Done. Respect 🛑 gates: stop and wait for user approval.
3. Pull the relevant sections of `docs/design.md` into each subagent brief (or tell the agent which sections to read).

## Docs (version controlled, the source of truth)

| File | What it is |
| --- | --- |
| `docs/design.md` | Product design. Source of truth for WHAT to build. |
| `docs/execution-plan.md` | Phases, parallel groups, gates, manual setup, and per-task Status. Update Status as work moves. |
| `docs/data-model.md` | Draft schema sketch. Input only; the real schema code wins once it exists. |

These were migrated from Notion on 2026-10-19 (originally titled "Band Manager"). The repo copies are canonical; do not edit the Notion pages.

If the design doc is ambiguous or conflicts with a task, add the question under "Open questions" in the execution plan and ask the user. Do not guess on product decisions. When the user makes a new product decision, record it in `docs/design.md`.

## Stack

TypeScript end to end. pnpm workspace + Turborepo monorepo: Next.js frontend (`apps/web`), NestJS backend (`apps/api`), shared DTOs + Zod schemas (`packages/shared`). Postgres via Drizzle, pg-boss for jobs, everything hosted on Fly.io, DNS on Cloudflare. Full library list is at the end of `docs/design.md`.

## Commands

Run from the repo root: `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format`.

## Conventions

- Code comments: three lines max, describe current behavior declaratively (no change-history narration), never use em dashes.
- The orchestrator commits on its own at sensible checkpoints (e.g. after each validated wave or task), without being asked. Subagents never commit. No AI attribution or co-author trailers in commit messages. Do not branch or push unless the user asks.
- External services (Google, Spotify, Songsterr, GitHub) sit behind adapter interfaces with fakes for tests.

## Memory

`memory/` is the in-repo, version-controlled project memory, shared across sessions and machines. `memory/MEMORY.md` is the index: one line per entry. Each entry is its own file holding one fact. See `memory/MEMORY.md` for the format. Save durable decisions, user preferences, and non-obvious gotchas there; don't duplicate what the docs or code already say.
