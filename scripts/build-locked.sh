#!/usr/bin/env bash
# Runs a command (default `pnpm build`) while holding an mkdir lock, so parallel agents queue.
# Usage: build-locked.sh [command args...]. Env: BUILD_LOCK_DIR, BUILD_LOCKED_CMD, BUILD_LOCK_POLL.
# Stale locks (dead pid, or a plain file at the lock path) are cleared. Nested calls skip locking.
set -u

LOCK="${BUILD_LOCK_DIR:-/tmp/greenroom-build.lock}"
POLL="${BUILD_LOCK_POLL:-10}"

run() {
  if [ "$#" -gt 0 ]; then
    "$@"
  else
    eval "${BUILD_LOCKED_CMD:-pnpm build}"
  fi
}

# Re-entrant (the lock holder exports BUILD_LOCK_HELD) and a no-op when the lock parent is unwritable.
parent="$(dirname "$LOCK")"
if [ -n "${BUILD_LOCK_HELD:-}" ] || [ ! -d "$parent" ] || [ ! -w "$parent" ]; then
  run "$@"
  exit $?
fi

is_stale() {
  if [ -e "$LOCK" ] && [ ! -d "$LOCK" ]; then
    return 0
  fi
  if [ -f "$LOCK/pid" ]; then
    pid="$(cat "$LOCK/pid" 2>/dev/null)"
    [ -z "$pid" ] || ! kill -0 "$pid" 2>/dev/null
    return $?
  fi
  # No pid file: a holder that died between mkdir and writing it. Give live ones 60s.
  [ -d "$LOCK" ] && [ -n "$(find "$LOCK" -maxdepth 0 -mmin +1 2>/dev/null)" ]
}

release() {
  if [ -f "$LOCK/pid" ] && [ "$(cat "$LOCK/pid" 2>/dev/null)" = "$$" ]; then
    rm -rf "$LOCK"
  fi
}

until mkdir "$LOCK" 2>/dev/null; do
  if is_stale; then
    echo "build-locked: clearing stale lock $LOCK" >&2
    rm -rf "$LOCK"
    continue
  fi
  echo "build-locked: waiting for $LOCK (held by pid $(cat "$LOCK/pid" 2>/dev/null || echo '?'))" >&2
  sleep "$POLL"
done
echo "$$" > "$LOCK/pid"
trap release EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

export BUILD_LOCK_HELD=1
run "$@"
