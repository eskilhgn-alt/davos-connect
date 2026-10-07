#!/usr/bin/env bash
# CHAT-MEDIA-01 harness. Isolated native PostgreSQL only; never the app database.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
for pg_var in ${!PG@}; do unset "$pg_var"; done
WORK="$(mktemp -d /tmp/chatmedia01-XXXXXXXX)"
PGDATA="$WORK/data"; SOCK="$WORK/socket"; mkdir -p "$PGDATA" "$SOCK"
AS=()
cleanup() { "${AS[@]}" pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
if [ "$(id -u)" = 0 ]; then AS=(setpriv --reuid=1000 --regid=1000 --clear-groups); chown -R 1000:1000 "$WORK"; fi
"${AS[@]}" initdb -U postgres -A trust -D "$PGDATA" >"$WORK/init.log" 2>&1
"${AS[@]}" pg_ctl -D "$PGDATA" -o "-k $SOCK -c listen_addresses=''" -l "$WORK/pg.log" -w start >/dev/null
run() { "${AS[@]}" psql -X -v ON_ERROR_STOP=1 -h "$SOCK" -U postgres -d postgres "$@"; }
run -q -f "$HERE/fixture.sql"
PRE=$(run -At -c "select md5(string_agg(t::text, ',' order by id)) from gallery_items t")
for pass in 1 2; do run -q -f "$HERE/migration.sql"; echo "migration pass $pass OK"; done
POST=$(run -At -c "select md5(string_agg(t::text, ',' order by id)) from gallery_items t")
[ "$PRE" = "$POST" ] && echo "PASS historical gallery hash unchanged ($PRE)" || { echo "FAIL hash"; exit 1; }
run -f "$HERE/behavior.sql"
# Parallel: two sessions save the same new story simultaneously -> exactly one row.
run -q -c "insert into stories values ('10000000-0000-0000-0000-0000000000ff','00000000-0000-0000-0000-00000000000a','a/race.jpg','image','00000000-0000-0000-0000-0000000000a1')"
CALL="begin; set local role authenticated; select set_config('request.uid','00000000-0000-0000-0000-00000000000a',true); select pg_sleep(0.3); select (rpc_save_story_to_minner('10000000-0000-0000-0000-0000000000ff')).id; commit;"
run -At -c "$CALL" >"$WORK/p1" & run -At -c "$CALL" >"$WORK/p2" & wait
N=$(run -At -c "select count(*) from gallery_items where storage_path='a/race.jpg'")
I1=$(tail -2 "$WORK/p1" | head -1); I2=$(tail -2 "$WORK/p2" | head -1)
[ "$N" = 1 ] && [ "$I1" = "$I2" ] && echo "PASS parallel saves -> 1 row, same id" || { echo "FAIL parallel N=$N $I1 $I2"; exit 1; }
echo "ALL GREEN"
