#!/usr/bin/env bash
# Isolated native PostgreSQL only. Never uses the connected app database.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
MIG="$ROOT/supabase/migrations/20261004063021_clean01b_retire_rounds_polls_faktasjekk.sql"
for pg_var in ${!PG@}; do unset "$pg_var"; done
WORK="$(mktemp -d /tmp/clean01b-XXXXXXXX)"
PGDATA="$WORK/data"; SOCK="$WORK/socket"; mkdir -p "$PGDATA" "$SOCK"
AS=()
cleanup() { "${AS[@]}" pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
if [ "$(id -u)" = 0 ]; then AS=(setpriv --reuid=1000 --regid=1000 --clear-groups); chown -R 1000:1000 "$WORK"; fi
"${AS[@]}" initdb -U postgres -A trust -D "$PGDATA" >"$WORK/init.log" 2>&1
"${AS[@]}" pg_ctl -D "$PGDATA" -o "-k $SOCK -c listen_addresses='' -c wal_level=logical" -l "$WORK/pg.log" -w start >/dev/null
run() { "${AS[@]}" psql -X -v ON_ERROR_STOP=1 -h "$SOCK" -U postgres -d postgres "$@"; }
run -q -f "$HERE/fixture.sql"
PGOPTIONS="-c c01b.phase=pre" run -q -f "$HERE/snapshot.sql"
for pass in 1 2; do run -q -f "$MIG"; echo "migration pass $pass OK"; done
PGOPTIONS="-c c01b.phase=post" run -q -f "$HERE/snapshot.sql"
run -f "$HERE/behavior.sql"
