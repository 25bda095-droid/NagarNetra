#!/usr/bin/env bash
# Applies every migration to a throwaway PostGIS container and runs the RLS tests.
# Usage: npm run test:db      (needs Docker)
set -euo pipefail

cd "$(dirname "$0")/.."
NAME=nagarnetra-test-db
IMAGE=postgis/postgis:17-3.5
PORT=54329

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

# wal_level=logical like Supabase, so the realtime publication works
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=test -p "$PORT:5432" "$IMAGE" -c wal_level=logical >/dev/null

echo "Waiting for Postgres..."
until docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
sleep 2   # the image restarts once after its init scripts

run_sql() {
  docker exec -i "$NAME" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres -f - < "$1"
}

run_sql supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "Applying $(basename "$f")"
  run_sql "$f"
done

echo "Running tests"
run_sql supabase/tests/rls_test.sql
