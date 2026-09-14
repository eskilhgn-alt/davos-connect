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
  if [ "$pass" = "1" ]; then
    # Snapshot av posisjonsradene mellom rundene: runde 2 skal ikke endre dem.
    psql_run -q -f "$HERE/locations_snapshot.sql"
  fi
done

echo "== policyer =="
psql_run -q -f "$HERE/policies.sql"

echo "== atferdstester =="
psql_run -q -f "$HERE/behavior.sql" 2>&1 \
  | sed -E 's/^psql:[^ ]+ //' \
  | grep -E "^(NOTICE|ERROR|FAIL)" \
  | sed 's/^NOTICE:  //'
# ON_ERROR_STOP + pipefail gjør at en feilet assert velter hele kjøringen.

echo "== parallell aktivering: to ekte psql-sesjoner, nøyaktig én aktiv tur =="
psql_run -q -f "$HERE/concurrency_setup.sql"
ACT="a0000000-0000-0000-0000-000000000002"
for t in "44444444-4444-4444-4444-444444444444" "55555555-5555-5555-5555-555555555555"; do
  psql_run -q -c "SELECT set_config('request.jwt.claim.sub','$ACT',false);
                  SELECT pg_sleep(0.2);
                  SELECT public.rpc_admin_set_active_trip('$t');" &
done
wait
psql_run -q -f "$HERE/concurrency_assert.sql" 2>&1 \
  | sed -E 's/^psql:[^ ]+ //' | grep -E "^(NOTICE|ERROR|FAIL)" | sed 's/^NOTICE:  //'

echo "== ingen destruktive setninger på toppnivå i pending-migrasjoner =="
# Kun toppnivå (kolonne 0). DELETE inne i en funksjonskropp er applikasjonslogikk.
! grep -nEi '^(DROP|DELETE[[:space:]]+FROM|TRUNCATE)\b' \
  "$ROOT"/supabase/migrations-pending/*.sql

echo "PORT0 OK"
