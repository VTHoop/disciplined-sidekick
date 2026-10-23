#!/usr/bin/env bash
# Proves the ai_runs access rules and the 90-day purge against a migrated local
# Supabase database. Everything runs in one transaction that is rolled back.
set -euo pipefail

# shellcheck source=lib/psql.sh
source "$(dirname "$0")/lib/psql.sh"

psql_run <<'SQL'
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2');

insert into public.ai_runs
  (user_id, function_name, status, requested_model, effort, prompt_version,
   schema_version, attempts, input, started_at, finished_at)
values
  ('00000000-0000-0000-0000-0000000000a1', 'mine', 'success', 'm', 'low', 'p1', '1', 1, '{}', now(), now()),
  ('00000000-0000-0000-0000-0000000000a2', 'theirs', 'success', 'm', 'low', 'p1', '1', 1, '{}', now(), now());

-- A signed-in user reads only their own rows.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

do $$
declare n int; names text;
begin
  select count(*), string_agg(function_name, ',') into n, names from public.ai_runs;
  if n <> 1 or names <> 'mine' then
    raise exception 'authenticated user should see only their own row, saw % (%)', n, names;
  end if;
end $$;

-- ...and cannot insert, update or delete.
do $$
begin
  begin
    insert into public.ai_runs
      (user_id, function_name, status, requested_model, effort, prompt_version,
       schema_version, attempts, input, started_at, finished_at)
    values ('00000000-0000-0000-0000-0000000000a1', 'forged', 'success', 'm', 'low', 'p', '1', 1, '{}', now(), now());
    raise exception 'authenticated insert was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ai_runs set function_name = 'edited';
    raise exception 'authenticated update was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.ai_runs;
    raise exception 'authenticated delete was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- anon has no access at all.
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.ai_runs;
    raise exception 'anon select was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Retention: the purge deletes a 91-day-old row and keeps an 89-day-old one.
insert into public.ai_runs
  (user_id, function_name, status, requested_model, effort, prompt_version,
   schema_version, attempts, input, started_at, finished_at, created_at)
values
  (null, 'purge-91', 'success', 'm', 'low', 'p', '1', 1, '{}', now(), now(), now() - interval '91 days'),
  (null, 'purge-89', 'success', 'm', 'low', 'p', '1', 1, '{}', now(), now(), now() - interval '89 days');

select public.purge_ai_runs();

do $$
begin
  if exists (select 1 from public.ai_runs where function_name = 'purge-91') then
    raise exception 'the 91-day-old row survived the purge';
  end if;
  if not exists (select 1 from public.ai_runs where function_name = 'purge-89') then
    raise exception 'the 89-day-old row was purged';
  end if;
end $$;

-- The purge is scheduled at least daily.
do $$
begin
  if not exists (
    select 1 from cron.job
    where command ilike '%purge_ai_runs%'
      and schedule ~ '^\d+ \d+ \* \* \*$'
  ) then
    raise exception 'no daily pg_cron job runs public.purge_ai_runs()';
  end if;
end $$;

rollback;
SQL

echo "ai_runs check passed."
