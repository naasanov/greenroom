#!/usr/bin/env bash
# Isolated fake-mode Greenroom stacks for manual walkthroughs (slots 1..4, run in parallel).
# Usage: walkthrough-stack.sh build | up N | down N | status N
# Slot N: web :3200+N, API :4200+N, DB greenroom_wt<N>, state in /tmp/walkthrough/<N>/.
#
# API URL: the web bundle derives it at runtime as web port + 1000 on localhost, so
# no per-slot build or proxy is needed. NEXT_PUBLIC_API_URL must stay unset at build.
# Session cookie is gr_wt<letter>_session per slot because cookies ignore ports.
#
# Sign in: /sign-in -> Google button -> /fake-google/authorize, email + passcode
# "walkthrough", then choose the Demo Band. /__test__ routes are on (NODE_ENV=test).
# Reset a slot: down N; dropdb greenroom_wt<N> (psql, user greenroom); up N.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE=/tmp/walkthrough
PGURL="${WT_ADMIN_DATABASE_URL:-postgres://greenroom:greenroom@localhost:5432/postgres}"

die() { echo "error: $*" >&2; exit 1; }
slot_arg() {
  [[ "${1:-}" =~ ^[1-4]$ ]] || die "slot N must be 1..4"
  N="$1"
  WEB_PORT=$((3200 + N)); API_PORT=$((4200 + N))
  DIR="$BASE/$N"; DB="greenroom_wt$N"
  DB_URL="${PGURL%/*}/$DB"
}

alive() { [[ -f "$1" ]] && kill -0 "$(cat "$1")" 2>/dev/null; }

build() {
  cd "$ROOT"
  unset NEXT_PUBLIC_API_URL
  pnpm --filter @greenroom/shared build
  pnpm --filter @greenroom/api build
  pnpm --filter @greenroom/web build
}

prepare_db() {
  cd "$ROOT/apps/e2e"
  ADMIN="$PGURL" TARGET="$DB_URL" DBNAME="$DB" node --input-type=module -e '
    import { createDb, runMigrations } from "@greenroom/db";
    const admin = createDb(process.env.ADMIN, { max: 1 });
    const rows = await admin.client`select 1 from pg_database where datname = ${process.env.DBNAME}`;
    if (rows.length === 0) await admin.client.unsafe(`create database "${process.env.DBNAME}"`);
    await admin.close();
    await runMigrations(process.env.TARGET);
  '
}

wait_for() {
  local url="$1" pidfile="$2" i
  for ((i = 0; i < 300; i++)); do
    alive "$pidfile" || return 1
    curl -fs -o /dev/null "$url" && return 0
    sleep 0.2
  done
  return 1
}

up() {
  slot_arg "${1:-}"
  [[ -f "$ROOT/apps/api/dist/main.js" && -d "$ROOT/apps/web/.next" ]] || die "not built; run: $0 build"
  if alive "$DIR/api.pid" || alive "$DIR/web.pid"; then die "slot $N already running"; fi
  mkdir -p "$DIR"
  prepare_db
  local letter; letter="$(printf '\x'"$(printf %x $((96 + N)))")"
  local web_url="http://localhost:$WEB_PORT" api_url="http://localhost:$API_PORT"
  (
    cd "$ROOT/apps/api"
    env -u COOKIE_DOMAIN -u NEXT_PUBLIC_API_URL \
      API_PORT="$API_PORT" DATABASE_URL="$DB_URL" INTEGRATIONS_MODE=fake NODE_ENV=test \
      WEB_URL="$web_url" WEB_ORIGIN="$web_url" API_PUBLIC_URL="$api_url" \
      OAUTH_TOKEN_KEY="dGVzdC1vbmx5LW9hdXRoLXRva2VuLWtleS0zMmJ5ISE=" \
      STAGING_LOGIN_PASSCODE=walkthrough SESSION_COOKIE_NAME="gr_wt${letter}_session" \
      setsid node dist/main.js >"$DIR/api.log" 2>&1 </dev/null &
    echo $! >"$DIR/api.pid"
  )
  (
    cd "$ROOT/apps/web"
    env -u NEXT_PUBLIC_API_URL \
      setsid node node_modules/next/dist/bin/next start -p "$WEB_PORT" >"$DIR/web.log" 2>&1 </dev/null &
    echo $! >"$DIR/web.pid"
  )
  wait_for "$api_url/health" "$DIR/api.pid" || { echo "API failed; see $DIR/api.log" >&2; down "$N"; exit 1; }
  wait_for "$web_url" "$DIR/web.pid" || { echo "web failed; see $DIR/web.log" >&2; down "$N"; exit 1; }
  echo "slot $N up: web $web_url  api $api_url  db $DB  logs $DIR"
}

stop_pid() {
  local f="$1" pid i
  alive "$f" || { rm -f "$f"; return 0; }
  pid="$(cat "$f")"
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  for ((i = 0; i < 50; i++)); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
  kill -0 "$pid" 2>/dev/null && { kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true; }
  rm -f "$f"
}

down() {
  slot_arg "${1:-}"
  stop_pid "$DIR/web.pid"; stop_pid "$DIR/api.pid"
  echo "slot $N down"
}

status() {
  slot_arg "${1:-}"
  local s
  for s in api web; do
    if alive "$DIR/$s.pid"; then
      echo "$s: running pid $(cat "$DIR/$s.pid") rss_kb $(ps -o rss= -p "$(cat "$DIR/$s.pid")" | tr -d ' ')"
    else echo "$s: stopped"; fi
  done
  echo "web http://localhost:$WEB_PORT  api http://localhost:$API_PORT  db $DB"
}

case "${1:-}" in
  build) build ;;
  up) up "${2:-}" ;;
  down) down "${2:-}" ;;
  status) status "${2:-}" ;;
  *) die "usage: $0 build | up N | down N | status N" ;;
esac
