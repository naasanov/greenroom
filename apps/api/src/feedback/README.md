# Feedback

`POST /feedback` (signed-in users) opens a GitHub issue labelled `feedback` through the `GITHUB` adapter. GitHub credentials never leave the server.

- Body (`feedbackSchema` in `packages/shared/src/feedback.ts`): `message` (required, trimmed, max 4000), optional `title` (max 120; derived from the message when blank), `pageUrl`, `userAgent`, `bandId`. Returns `201 { ok: true }`.
- The issue body holds the message, then the reporter's display name and email, the band name (only when `bandId` is a band the caller is an active member of), the page URL and the user agent. No tokens or session data are included.
- Rate limit: 5 submissions per user per hour, kept in memory per API process. Over the cap returns `429 FEEDBACK_RATE_LIMITED`.
- Real mode without `GITHUB_FEEDBACK_TOKEN` returns `503 FEEDBACK_NOT_CONFIGURED`. A GitHub failure returns 502.
- Env: `GITHUB_FEEDBACK_TOKEN` (fine-grained PAT, Issues write), `GITHUB_FEEDBACK_REPO` (default `naasanov/greenroom`).
- Fake mode records issues in memory; specs read them from `GET /__test__/github/issues`.
