#!/usr/bin/env bash
# Proves the user_targets access rules against a migrated local Supabase
# database. Everything runs in one transaction that is rolled back.
set -euo pipefail

# shellcheck source=lib/psql.sh
source "$(dirname "$0")/lib/psql.sh"

psql_run <<'SQL'
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b2');

-- The other user's row exists from the start.
insert into public.user_targets (user_id, protein_g)
values ('00000000-0000-0000-0000-0000000000b2', 90);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true);

-- A signed-in user sees no one else's row.
do $$
declare n int;
begin
  select count(*) into n from public.user_targets;
  if n <> 0 then
    raise exception 'authenticated user saw % rows that are not theirs', n;
  end if;
end $$;

-- The client upserts without a user_id: the row is theirs, and an edit
-- touches only the columns it names.
insert into public.user_targets (protein_g) values (120)
  on conflict (user_id) do update set protein_g = excluded.protein_g;
insert into public.user_targets (fruit_veg_g, fruit_veg_edited) values (null, true)
  on conflict (user_id) do update
    set fruit_veg_g = excluded.fruit_veg_g, fruit_veg_edited = excluded.fruit_veg_edited;

do $$
declare r public.user_targets;
begin
  select * into strict r from public.user_targets;
  if r.user_id <> '00000000-0000-0000-0000-0000000000b1' then
    raise exception 'row was not owned by the caller: %', r.user_id;
  end if;
  if r.protein_g <> 120 or r.calories_kcal is not null
     or r.fruit_veg_g is not null or not r.fruit_veg_edited then
    raise exception 'round trip returned the wrong values: %', to_json(r);
  end if;
end $$;

-- A new row starts with fruit/veg unedited (so the core default applies).
do $$
begin
  if (select column_default from information_schema.columns
      where table_schema = 'public' and table_name = 'user_targets'
        and column_name = 'fruit_veg_edited') is distinct from 'false' then
    raise exception 'fruit_veg_edited must default to false';
  end if;
end $$;

-- Cannot write a row for someone else.
do $$
begin
  begin
    insert into public.user_targets (user_id, protein_g)
    values ('00000000-0000-0000-0000-0000000000b2', 1);
    raise exception 'inserted a row for another user';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.user_targets set user_id = '00000000-0000-0000-0000-0000000000b2';
    raise exception 'moved a row to another user';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Cannot update or delete someone else's row (RLS hides it from the statement).
do $$
declare n int;
begin
  update public.user_targets set protein_g = 1
    where user_id = '00000000-0000-0000-0000-0000000000b2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'updated % rows of another user', n; end if;

  delete from public.user_targets
    where user_id = '00000000-0000-0000-0000-0000000000b2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'deleted % rows of another user', n; end if;
end $$;

-- Targets must be whole numbers greater than 0 (or null).
do $$
declare col text;
begin
  foreach col in array array['calories_kcal', 'protein_g', 'fruit_veg_g'] loop
    begin
      execute format('update public.user_targets set %I = 0', col);
      raise exception '% accepted 0', col;
    exception when check_violation then null;
    end;
    begin
      execute format('update public.user_targets set %I = -5', col);
      raise exception '% accepted -5', col;
    exception when check_violation then null;
    end;
  end loop;
  -- The database only checks > 0 (the sanity caps live in packages/core), so a
  -- very large whole number is fine.
  update public.user_targets set calories_kcal = 9007199254740991;
end $$;

-- The owner can delete their own row.
do $$
declare n int;
begin
  delete from public.user_targets;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'owner deleted % rows, expected 1', n; end if;
end $$;
reset role;

-- The other user's row survived all of that.
do $$
begin
  if not exists (
    select 1 from public.user_targets
    where user_id = '00000000-0000-0000-0000-0000000000b2' and protein_g = 90
  ) then
    raise exception 'another user''s row was changed';
  end if;
end $$;

-- The server never touches this table, so service_role must have no grant on
-- it (hosted Supabase gives none; local does unless the migration revokes it).
set local role service_role;
do $$
begin
  begin
    perform 1 from public.user_targets;
    raise exception 'service_role select was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.user_targets (user_id, protein_g)
    values ('00000000-0000-0000-0000-0000000000b1', 1);
    raise exception 'service_role insert was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- anon has no access at all.
set local role anon;
do $$
begin
  begin
    perform 1 from public.user_targets;
    raise exception 'anon select was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.user_targets (user_id, protein_g)
    values ('00000000-0000-0000-0000-0000000000b1', 1);
    raise exception 'anon insert was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
SQL

echo "user_targets check passed."
