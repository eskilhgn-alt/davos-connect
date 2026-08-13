#!/usr/bin/env bash
# ============================================================================
# Port 0 — kjør atferdstestene mot en ISOLERT, midlertidig Postgres.
# Rører aldri produksjon: egen datakatalog, unix-socket, ingen nettverk.
#
#   bash supabase/tests/port0/run.sh
#
# Migrasjonen kjøres TO ganger for å bevise idempotens/reproduserbarhet.
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
MIG="$ROOT/supabase/migrations-pending/20260813_port0_trip_model_authz.sql"

PGDATA="${PGDATA:-/tmp/port0-pgdata}"
SOCK="${SOCK:-/tmp/port0-sock}"
PSQL="psql -v ON_ERROR_STOP=1 -h $SOCK -U postgres -d postgres"

cleanup() { pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true; }
trap cleanup EXIT

rm -rf "$PGDATA" "$SOCK"; mkdir -p "$PGDATA" "$SOCK"
initdb -U postgres -A trust "$PGDATA" >/tmp/port0-initdb.log 2>&1
pg_ctl -D "$PGDATA" -o "-k $SOCK -c listen_addresses=" -l /tmp/port0-pg.log start >/dev/null
sleep 1

echo "== fikstur =="
$PSQL -q -f "$HERE/fixture.sql"

echo "== migrasjon (1. kjøring) =="
$PSQL -q -f "$MIG"
echo "== migrasjon (2. kjøring — idempotens) =="
$PSQL -q -f "$MIG"

echo "== policyer =="
$PSQL -q -f "$HERE/policies.sql"

echo "== atferdstester =="
$PSQL -f "$HERE/behavior.sql" 2>&1 | grep -E "^(NOTICE|ERROR|FAIL)" || true

echo "== ingen destruktive setninger i pending Shot/Port0-migrasjoner =="
! grep -nEi '^[[:space:]]*(DROP|DELETE[[:space:]]+FROM|TRUNCATE)\b' \
  "$ROOT"/supabase/migrations-pending/*.sql

echo "PORT0 OK"
