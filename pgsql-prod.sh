#!/usr/bin/env bash
# Open psql on the production Postgres database.
#
# Uses the same environment as bootrun-proddb.sh (e.g. from .envrc):
#   MORSOR_PROD_DB_HOST      required, e.g. dpg-xxxx.oregon-postgres.render.com
#   MORSOR_PROD_DB_NAME      required
#   MORSOR_PROD_DB_USER      required
#   MORSOR_PROD_DB_PASSWORD  required
#   MORSOR_PROD_DB_PORT      optional, default 5432
#
# Any arguments are passed through to psql, e.g.: ./pgsql-prod.sh -c '\dt'
set -euo pipefail

usage() {
  sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//' >&2
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
esac

missing=()
for v in MORSOR_PROD_DB_HOST MORSOR_PROD_DB_NAME MORSOR_PROD_DB_USER MORSOR_PROD_DB_PASSWORD; do
  if [ -z "${!v:-}" ]; then
    missing+=("$v")
  fi
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "Error: not set: ${missing[*]} (see --help)" >&2
  exit 1
fi

PGPASSWORD="$MORSOR_PROD_DB_PASSWORD" PGSSLMODE=require \
  exec psql \
    -h "$MORSOR_PROD_DB_HOST" \
    -p "${MORSOR_PROD_DB_PORT:-5432}" \
    -U "$MORSOR_PROD_DB_USER" \
    -d "$MORSOR_PROD_DB_NAME" \
    "$@"
