#!/usr/bin/env bash
# Run the app locally (./gradlew bootRun) against the production Postgres database.
#
# Connection settings come from the environment (e.g. .envrc):
#   MORSOR_PROD_DB_HOST      required, e.g. dpg-xxxx.oregon-postgres.render.com
#   MORSOR_PROD_DB_NAME      required
#   MORSOR_PROD_DB_USER      required
#   MORSOR_PROD_DB_PASSWORD  required
#   MORSOR_PROD_DB_PORT      optional, default 5432
#
# Profiles: postgres and proddb are added to SPRING_PROFILES_ACTIVE (default s3troves), and no-auth
# is removed (sign in with a prod user). proddb makes Flyway validate only: it never migrates prod,
# and startup fails if this build has migrations prod doesn't have yet.
#
# Any arguments are passed through to ./gradlew bootRun.
set -euo pipefail

usage() {
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//' >&2
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

host="$MORSOR_PROD_DB_HOST"
port="${MORSOR_PROD_DB_PORT:-5432}"
db="$MORSOR_PROD_DB_NAME"
user="$MORSOR_PROD_DB_USER"

profiles="${SPRING_PROFILES_ACTIVE:-s3troves}"
# no-auth has no form login (POST /login 405s) while the SPA still sends you to /login; against
# prod you sign in with a real prod user instead.
if [[ ",$profiles," == *",no-auth,"* ]]; then
  echo "Note: dropping no-auth profile; sign in with a prod user" >&2
  profiles="$(printf '%s' "$profiles" | tr ',' '\n' | grep -vx 'no-auth' | paste -sd, - || true)"
fi
for p in postgres proddb; do
  case ",$profiles," in
    *",$p,"*) ;;
    *) profiles="${profiles:+$profiles,}$p" ;;
  esac
done

echo "Running against PRODUCTION database $user@$host:$port/$db (profiles: $profiles)" >&2

cd "$(dirname "$0")"
SPRING_PROFILES_ACTIVE="$profiles" \
SPRING_DATASOURCE_URL="jdbc:postgresql://$host:$port/$db?sslmode=require" \
SPRING_DATASOURCE_USERNAME="$user" \
SPRING_DATASOURCE_PASSWORD="$MORSOR_PROD_DB_PASSWORD" \
  exec ./gradlew bootRun "$@"
