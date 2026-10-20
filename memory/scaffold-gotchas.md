---
name: scaffold-gotchas
description: Non-obvious choices in the monorepo scaffold (Nest 12 ESM + ESLint instead of oxlint/vitest, shadcn's cn package, shared package build order)
type: project
---

Choices made in task 0.1 (2026-10-19) that a fresh agent might "fix" by mistake:

- `apps/api` is ESM (`"type": "module"`, nodenext), so relative imports need `.js` extensions. This follows the Nest 12 template.
- Nest 12's generator ships oxlint + vitest; we removed both and use ESLint 9 + typescript-eslint across api and shared for consistency. Test tooling is decided in task 0.4.
- `apps/web/src/lib/utils.ts` re-exports `cn` from the `cn` npm package (maintained by shadcn, replaces clsx + tailwind-merge). This is the current shadcn default, not a typo.
- `@greenroom/shared` compiles to `dist`; turbo runs `^build` before dev/build/lint/typecheck, so a stale or missing `dist` breaks consumers.

- `NEXT_PUBLIC_API_URL` is inlined at Next build time. The e2e run serves the web build on 3100 against the API on 4100, so the first task that makes the web app call the API must give the e2e build its own API URL (e.g. a Next rewrite or e2e-specific build env).
- The API loads the repo-root `.env` via `process.loadEnvFile` (first import in `main.ts`); variables already in the environment win.

**Why:** these diverge from older Nest/shadcn conventions that agents may remember from training data.

**How to apply:** mention the relevant bullet in briefs for agents touching the API, lint/test config, or shadcn components.
