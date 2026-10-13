#!/usr/bin/env bash
# Creates a disposable local-only cluster. NEVER accepts a database URL.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ "$(id -u)" = 0 ]; then echo 'Run as an ordinary non-root OS user; do not point this at production.' >&2; exit 2; fi
for name in ${!PG@}; do unset "$name"; done
WORK="$(mktemp -d /tmp/guttahutte-social-XXXXXXXX)"
mkdir -p "$WORK/socket"
cleanup() { pg_ctl -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
initdb -U postgres -A trust -D "$WORK/data" >"$WORK/init.log" 2>&1
pg_ctl -D "$WORK/data" -o "-k $WORK/socket -c listen_addresses=''" -l "$WORK/server.log" -w start >/dev/null
SOCIAL_TEST_PG_SOCKET="$WORK/socket" node "$HERE/run.mjs" --native
