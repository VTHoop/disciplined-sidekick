#!/usr/bin/env bash
# Fails if any table in the public schema has RLS disabled, and proves that
# new tables get RLS by default. Expects a migrated local Supabase database.
set -euo pipefail

# shellcheck source=lib/psql.sh
source "$(dirname "$0")/lib/psql.sh"

without_rls=$(psql_run -c "select tablename from pg_tables where schemaname = 'public' and not rowsecurity")
if [ -n "$without_rls" ]; then
  echo "RLS is disabled on public tables:" >&2
  echo "$without_rls" >&2
  exit 1
fi

probe=$(psql_run <<'SQL'
begin;
create table public._rls_probe (id int);
select rowsecurity from pg_tables where schemaname = 'public' and tablename = '_rls_probe';
rollback;
SQL
)
if [ "$probe" != "t" ]; then
  echo "New public tables do not get RLS by default (probe returned '$probe')." >&2
  exit 1
fi

echo "RLS check passed."
