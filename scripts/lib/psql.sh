# Shared helper: runs psql against the local Supabase database.
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54422/postgres}"

psql_run() {
  if command -v psql >/dev/null 2>&1; then
    psql "$DB_URL" -v ON_ERROR_STOP=1 -q -At "$@"
  else
    docker exec -i "$(docker ps --filter name=supabase_db_disciplined-sidekick -q | head -1)" \
      psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -At "$@"
  fi
}
