#!/usr/bin/env bash
# Isolated native PostgreSQL only. Never uses the connected app database.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
for pg_var in ${!PG@}; do unset "$pg_var"; done
WORK="$(mktemp -d /tmp/trip-save-XXXXXXXX)"
PGDATA="$WORK/data"
SOCK="$WORK/socket"
mkdir -p "$PGDATA" "$SOCK"
AS=()
cleanup() {
  "${AS[@]}" pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
if [ "$(id -u)" = 0 ]; then
  AS=(setpriv --reuid=1000 --regid=1000 --clear-groups)
  chown -R 1000:1000 "$WORK"
fi
"${AS[@]}" initdb -U postgres -A trust -D "$PGDATA" >"$WORK/init.log" 2>&1
"${AS[@]}" pg_ctl -D "$PGDATA" -o "-k $SOCK -c listen_addresses='' -c wal_level=logical" -l "$WORK/pg.log" -w start >/dev/null
run() { "${AS[@]}" psql -v ON_ERROR_STOP=1 -h "$SOCK" -U postgres -d postgres "$@"; }
run -q -f "$ROOT/supabase/tests/port0/fixture.sql"
run -q -c 'CREATE PUBLICATION supabase_realtime;'
for pass in 1 2; do
  run -q -f "$ROOT/supabase/migrations-pending/20260816a_trip_status_draft.sql"
  run -q -f "$ROOT/supabase/migrations-pending/20260816b_trip_save_patch_rpc.sql"
  run -q -f "$ROOT/supabase/migrations/20260916052024_trip_save_compatibility_guards.sql"
done
run -q -f "$HERE/behavior.sql"
run -q <<'SQL'
SELECT public.save_assert((SELECT count(*)=2 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename IN ('trips','trip_members')),'both Realtime tables published');
INSERT INTO public.trips(id,name,destination,timezone,currency,status) VALUES
 ('44444444-4444-4444-4444-444444444444','Concurrent A','Oslo','Europe/Oslo','NOK','draft'),
 ('55555555-5555-5555-5555-555555555555','Concurrent B','Oslo','Europe/Oslo','NOK','draft');
INSERT INTO public.trip_members(trip_id,user_id) VALUES
 ('44444444-4444-4444-4444-444444444444','a0000000-0000-0000-0000-000000000001'),
 ('55555555-5555-5555-5555-555555555555','a0000000-0000-0000-0000-000000000001');
SQL
pids=()
for trip in 44444444-4444-4444-4444-444444444444 55555555-5555-5555-5555-555555555555; do
  run -q -c "BEGIN;
    SET LOCAL ROLE authenticated;
    SET LOCAL statement_timeout='10s';
    SELECT set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',true);
    SELECT public.rpc_admin_set_active_trip('$trip');
    SELECT pg_sleep(0.3);
    COMMIT;" >"$WORK/$trip.log" 2>&1 &
  pids+=("$!")
done
failed=0
for pid in "${pids[@]}"; do wait "$pid" || failed=1; done
if [ "$failed" -ne 0 ]; then cat "$WORK"/444*.log "$WORK"/555*.log; exit 1; fi
run -q <<'SQL'
SELECT public.save_assert((SELECT count(*)=1 FROM public.trips WHERE status='active'),'one active after concurrent commits');
SELECT public.save_assert((SELECT count(*)=1 FROM public.trips WHERE id IN ('44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555') AND status='active'),'concurrent target is active');
SELECT public.save_assert((SELECT count(*)=1 FROM public.trips WHERE id IN ('44444444-4444-4444-4444-444444444444','55555555-5555-5555-5555-555555555555') AND status='archived'),'other concurrent target is archived');
SQL
echo 'TRIP SAVE NATIVE SQL AND CONCURRENCY PASSED'
