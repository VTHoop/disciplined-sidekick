#!/usr/bin/env bash
# Proves the client_errors access rules and the 90-day purge against a migrated
# local Supabase database. Everything runs in one transaction that is rolled back.
set -euo pipefail

# shellcheck source=lib/psql.sh
source "$(dirname "$0")/lib/psql.sh"

psql_run <<'SQL'
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000d2');

-- The table holds the diagnostic fields and nothing else: no entry text, no food data.
do $$
declare cols text;
begin
  select string_agg(column_name, ',' order by column_name) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'client_errors';
  if cols is distinct from
     'app_version,created_at,error_code,error_message,http_status,id,online,operation,user_id' then
    raise exception 'client_errors has unexpected columns: %', cols;
  end if;
end $$;

-- A signed-in user inserts their own row; user_id defaults to their id.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

insert into public.client_errors
  (operation, error_message, error_code, http_status, online, app_version)
values ('save', 'Failed to fetch', null, null, false, 'abc1234');

do $$
begin
  if (select user_id from public.client_errors where operation = 'save')
     is distinct from '00000000-0000-0000-0000-0000000000d1'::uuid then
    raise exception 'user_id did not default to the caller';
  end if;
end $$;

-- ...but cannot write a row for someone else.
do $$
begin
  begin
    insert into public.client_errors
      (user_id, operation, error_message, online, app_version)
    values ('00000000-0000-0000-0000-0000000000d2', 'save', 'forged', true, 'v');
    raise exception 'authenticated inserted a row for another user';
  exception when insufficient_privilege or check_violation then null;
  end;
end $$;

-- ...and cannot update or delete.
do $$
begin
  begin
    update public.client_errors set error_message = 'edited';
    raise exception 'authenticated update was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.client_errors;
    raise exception 'authenticated delete was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- The operation is one of the known names.
do $$
begin
  begin
    insert into public.client_errors (operation, error_message, online, app_version)
    values ('anything', 'x', true, 'v');
    raise exception 'an unknown operation was accepted';
  exception when check_violation then null;
  end;
end $$;

-- Another user sees none of it, and can insert their own.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);

do $$
begin
  if exists (select 1 from public.client_errors) then
    raise exception 'a user read another user''s error rows';
  end if;
end $$;

insert into public.client_errors (operation, error_message, online, app_version)
values ('parse', 'HTTP 502', true, 'abc1234');

do $$
declare n int;
begin
  select count(*) into n from public.client_errors;
  if n <> 1 then
    raise exception 'owner should see exactly their own row, saw %', n;
  end if;
end $$;
reset role;

-- anon has no access at all.
set local role anon;
do $$
begin
  begin
    perform 1 from public.client_errors;
    raise exception 'anon select was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.client_errors (operation, error_message, online, app_version)
    values ('save', 'x', true, 'v');
    raise exception 'anon insert was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- No server writes this table: service_role gets no access.
set local role service_role;
do $$
begin
  begin
    perform 1 from public.client_errors;
    raise exception 'service_role select was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- purge_client_errors() is security definer, so only the retention job may run it.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if has_function_privilege(r, 'public.purge_client_errors()', 'execute') then
      raise exception '% can execute purge_client_errors()', r;
    end if;
  end loop;
end $$;

-- Retention: the purge deletes a 91-day-old row and keeps an 89-day-old one.
insert into public.client_errors
  (user_id, operation, error_message, online, app_version, created_at)
values
  ('00000000-0000-0000-0000-0000000000d1', 'save', 'purge-91', true, 'v', now() - interval '91 days'),
  ('00000000-0000-0000-0000-0000000000d1', 'save', 'purge-89', true, 'v', now() - interval '89 days');

select public.purge_client_errors();

do $$
begin
  if exists (select 1 from public.client_errors where error_message = 'purge-91') then
    raise exception 'the 91-day-old row survived the purge';
  end if;
  if not exists (select 1 from public.client_errors where error_message = 'purge-89') then
    raise exception 'the 89-day-old row was purged';
  end if;
end $$;

-- The purge is scheduled at least daily.
do $$
begin
  if not exists (
    select 1 from cron.job
    where command ilike '%purge_client_errors%'
      and schedule ~ '^\d+ \d+ \* \* \*$'
  ) then
    raise exception 'no daily pg_cron job runs public.purge_client_errors()';
  end if;
end $$;

rollback;
SQL

echo "client_errors check passed."
