#!/usr/bin/env bash
# ============================================================================
# Port 0 — kjør atferdstestene mot en ISOLERT, midlertidig Postgres.
# Rører aldri produksjon: eget mktemp-område, egen unix-socket, INGEN TCP,
# og alle PG*-miljøvariabler nullstilles så en tilkoblet prosjektdatabase
# aldri kan bli truffet ved uhell.
#
#   bash supabase/tests/port0/run.sh
#
# Hele migrasjonssekvensen 20260813 -> 20260814 -> 20260815 kjøres TO ganger
# for å bevise idempotens/reproduserbarhet.
#
# Postgres nekter å kjøre som root. Kjøres skriptet som root, slippes
# privilegier til uid/gid 1000 (lovable) med setpriv for initdb/pg_ctl/psql.
# ============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PENDING="$ROOT/supabase/migrations-pending"
MIGS=(
  "$PENDING/20260813_port0_trip_model_authz.sql"
  "$PENDING/20260814_port0b_trip_status_draft.sql"
  "$PENDING/20260815_port0c_trip_rpc_hardening.sql"
)

# Ingen arvede tilkoblingsparametre.
unset PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSERVICE PGSSLMODE PGDATA || true

WORK="$(mktemp -d /tmp/port0-XXXXXXXX)"
PGDATA="$WORK/pgdata"
SOCK="$WORK/sock"
LOG="$WORK/pg.log"
mkdir -p "$PGDATA" "$SOCK"

AS=()
if [ "$(id -u)" = "0" ]; then
  AS=(setpriv --reuid=1000 --regid=1000 --clear-groups)
  chown -R 1000:1000 "$WORK"
fi

cleanup() {
  "${AS[@]}" pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

"${AS[@]}" initdb -U postgres -A trust -D "$PGDATA" >"$WORK/initdb.log" 2>&1
"${AS[@]}" pg_ctl -D "$PGDATA" -o "-k $SOCK -c listen_addresses=''" -l "$LOG" -w start >/dev/null

psql_run() {
  "${AS[@]}" psql -v ON_ERROR_STOP=1 -h "$SOCK" -U postgres -d postgres "$@"
}

echo "== fikstur =="
psql_run -q -f "$HERE/fixture.sql"

for pass in 1 2; do
  for m in "${MIGS[@]}"; do
    echo "== migrasjon (kjøring $pass): $(basename "$m") =="
    # Egen psql-prosess per fil => egen transaksjonskontekst. Nødvendig fordi
    # ALTER TYPE ... ADD VALUE (20260814) ikke kan BRUKES i samme transaksjon.
    psql_run -q -f "$m"
  done
done

echo "== policyer =="
psql_run -q -f "$HERE/policies.sql"

echo "== atferdstester =="
psql_run -q -f "$HERE/behavior.sql" 2>&1 \
  | sed -E 's/^psql:[^ ]+ //' \
  | grep -E "^(NOTICE|ERROR|FAIL)" \
  | sed 's/^NOTICE:  //'
# ON_ERROR_STOP + pipefail gjør at en feilet assert velter hele kjøringen.

echo "== parallell aktivering: nøyaktig én aktiv tur =="
psql_run -q -f "$HERE/concurrency.sql"

echo "== ingen destruktive setninger i pending Shot/Port0-migrasjoner =="
! grep -nEi '^[[:space:]]*(DROP|DELETE[[:space:]]+FROM|TRUNCATE)\b' \
  "$ROOT"/supabase/migrations-pending/*.sql

echo "PORT0 OK"
