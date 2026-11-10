# Logging

Errors must be visible in `fly logs`. Log at failure points only; success paths stay quiet.

## Where errors must be logged

- Uncaught errors: `ExceptionLoggingFilter` (apps/api/src/common) logs every 5xx with its stack. 4xx stay quiet.
- Job handlers: `JobsService.register` logs any handler failure (queue, job id, trimmed data) with its stack and rethrows. Do not swallow errors inside handlers.
- External calls (Resend, Google, Spotify, YouTube, GitHub, Places, Songsterr): a non-OK response throws an error carrying the upstream status and a trimmed body (200-300 chars). A fallback (`return null`, `not-found`) logs at `warn` first.
- Any `catch` that does not rethrow logs the error. An empty `catch {}` needs a comment saying why silence is correct.

## Levels

- `error`: an operation failed and the user or job saw it fail. Include the stack.
- `warn`: an expected degraded path (best-effort lookup, revoked token, skipped item).
- `debug`/`log`: sparingly, for state changes already worth tracing.

Use Nest `Logger` in the API and `console.error` for server-side web code. Include the operation and ids (bandId, eventId, userId, importId).

## Never log

Tokens, refresh tokens, API keys, magic links, session cookies, full email bodies, full request payloads, query strings of request URLs. Prefer a user id over an email address.
