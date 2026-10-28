#!/usr/bin/env bash
# Proves the food logging access rules (food_entries, food_items, food_cache,
# save_food_entry and ai_runs.entry_id) against a migrated local Supabase
# database. Everything runs in one transaction that is rolled back.
set -euo pipefail

# shellcheck source=lib/psql.sh
source "$(dirname "$0")/lib/psql.sh"

psql_run <<'SQL'
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000c2');

-- The other user's entry exists from the start.
insert into public.food_entries (id, user_id, text, local_date)
values ('00000000-0000-0000-0000-00000000e002',
        '00000000-0000-0000-0000-0000000000c2', 'their toast', '2026-10-27');
insert into public.food_items
  (entry_id, user_id, position, name, canonical_name, grams, kcal, protein_g,
   fruit_veg_g, kcal_per_100g, protein_per_100g, estimated, portion_estimated, fdc_id)
values ('00000000-0000-0000-0000-00000000e002',
        '00000000-0000-0000-0000-0000000000c2', 0, 'toast', 'bread, toasted',
        30, 80, 3, 0, 266, 10, false, true, 1);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

-- A signed-in user sees no one else's entries or items.
do $$
begin
  if (select count(*) from public.food_entries) <> 0 then
    raise exception 'authenticated user saw another user''s entries';
  end if;
  if (select count(*) from public.food_items) <> 0 then
    raise exception 'authenticated user saw another user''s items';
  end if;
end $$;

-- Done: one call saves the entry and all its items, owned by the caller, with
-- unrounded values kept.
select public.save_food_entry(
  '00000000-0000-0000-0000-00000000e001',
  '2 eggs and 150 g blueberries',
  '2026-10-28',
  '[{"name":"2 eggs","canonical_name":"egg, whole, raw","grams":100,"kcal":47.619,
     "protein_g":4.18248,"fruit_veg_g":0,"kcal_per_100g":143,"protein_per_100g":12.56,
     "estimated":false,"portion_estimated":true,"fdc_id":171287},
    {"name":"150 g blueberries","canonical_name":"blueberries, raw","grams":150,"kcal":85.5,
     "protein_g":1.11,"fruit_veg_g":150,"kcal_per_100g":57,"protein_per_100g":0.74,
     "estimated":true,"portion_estimated":false,"fdc_id":null}]'::jsonb
);

do $$
declare e public.food_entries; n int;
begin
  select * into strict e from public.food_entries;
  if e.id <> '00000000-0000-0000-0000-00000000e001'
     or e.user_id <> '00000000-0000-0000-0000-0000000000c1'
     or e.text <> '2 eggs and 150 g blueberries'
     or e.local_date <> '2026-10-28' then
    raise exception 'entry saved wrong: %', to_json(e);
  end if;

  select count(*) into n from public.food_items
    where entry_id = e.id and user_id = e.user_id;
  if n <> 2 then raise exception 'expected 2 items on the entry, found %', n; end if;

  if not exists (
    select 1 from public.food_items
    where name = '2 eggs' and position = 0 and kcal = 47.619 and protein_g = 4.18248
      and portion_estimated and not estimated and fdc_id = 171287
  ) then
    raise exception 'the eggs item lost its values';
  end if;
  if not exists (
    select 1 from public.food_items
    where name = '150 g blueberries' and position = 1 and fruit_veg_g = 150
      and estimated and fdc_id is null
  ) then
    raise exception 'the blueberries item lost its values';
  end if;
end $$;

-- Done saves only once: the same entry id again changes nothing.
select public.save_food_entry(
  '00000000-0000-0000-0000-00000000e001',
  '2 eggs and 150 g blueberries',
  '2026-10-28',
  '[{"name":"dup","canonical_name":"dup","grams":1,"kcal":1,"protein_g":1,
     "fruit_veg_g":0,"kcal_per_100g":1,"protein_per_100g":1,"estimated":false,
     "portion_estimated":false,"fdc_id":null}]'::jsonb
);

do $$
begin
  if (select count(*) from public.food_entries) <> 1 then
    raise exception 'a repeated save created a second entry';
  end if;
  if (select count(*) from public.food_items) <> 2 then
    raise exception 'a repeated save added items';
  end if;
end $$;

-- An entry with no items is not saved.
do $$
begin
  begin
    perform public.save_food_entry(
      '00000000-0000-0000-0000-00000000e003', 'nothing', '2026-10-28', '[]'::jsonb);
    raise exception 'saved an entry with no items';
  exception when others then
    if sqlerrm like 'saved an entry%' then raise; end if;
  end;
  if exists (select 1 from public.food_entries
             where id = '00000000-0000-0000-0000-00000000e003') then
    raise exception 'an empty entry was left behind';
  end if;
end $$;

-- A bad item rolls back the whole entry (one transaction).
do $$
begin
  begin
    perform public.save_food_entry(
      '00000000-0000-0000-0000-00000000e004', 'half', '2026-10-28',
      '[{"name":"ok","canonical_name":"ok","grams":10,"kcal":1,"protein_g":1,
         "fruit_veg_g":0,"kcal_per_100g":10,"protein_per_100g":10,
         "estimated":false,"portion_estimated":false,"fdc_id":null},
        {"name":"bad","canonical_name":"bad","grams":-1,"kcal":1,"protein_g":1,
         "fruit_veg_g":0,"kcal_per_100g":10,"protein_per_100g":10,
         "estimated":false,"portion_estimated":false,"fdc_id":null}]'::jsonb);
    raise exception 'saved an item with negative grams';
  exception when check_violation then null;
  end;
  if exists (select 1 from public.food_entries
             where id = '00000000-0000-0000-0000-00000000e004') then
    raise exception 'a failed save left its entry behind';
  end if;
end $$;

-- Cannot write into someone else's entry, or as someone else.
do $$
begin
  begin
    insert into public.food_items
      (entry_id, position, name, canonical_name, grams, kcal, protein_g,
       fruit_veg_g, kcal_per_100g, protein_per_100g, estimated, portion_estimated)
    values ('00000000-0000-0000-0000-00000000e002', 9, 'x', 'x', 1, 1, 1, 0, 1, 1,
            false, false);
    raise exception 'added an item to another user''s entry';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.food_entries (id, user_id, text, local_date)
    values ('00000000-0000-0000-0000-00000000e005',
            '00000000-0000-0000-0000-0000000000c2', 'forged', '2026-10-28');
    raise exception 'created an entry for another user';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Saved food cannot be edited or deleted yet: no update or delete grant.
do $$
declare t text;
begin
  foreach t in array array['food_entries', 'food_items'] loop
    begin
      execute format('update public.%I set user_id = user_id', t);
      raise exception 'authenticated update on % was allowed', t;
    exception when insufficient_privilege then null;
    end;
    begin
      execute format('delete from public.%I', t);
      raise exception 'authenticated delete on % was allowed', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

-- The food cache belongs to the server alone.
do $$
begin
  begin
    perform 1 from public.food_cache;
    raise exception 'authenticated select on food_cache was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.food_cache (canonical_key, source, kcal_per_100g, protein_per_100g)
    values ('forged', 'estimate', 1, 1);
    raise exception 'authenticated insert on food_cache was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The other user's entry survived all of that.
do $$
begin
  if (select count(*) from public.food_items
      where entry_id = '00000000-0000-0000-0000-00000000e002') <> 1 then
    raise exception 'another user''s entry was changed';
  end if;
end $$;

-- The server reads and adds cache rows, and nothing else: an entry's lookups
-- stay cached whatever happens to the entry. It never touches saved food.
set local role service_role;
insert into public.food_cache
  (canonical_key, source, fdc_id, description, kcal_per_100g, protein_per_100g)
values ('blueberries, raw', 'usda', 171711, 'Blueberries, raw', 57, 0.74);
insert into public.food_cache (canonical_key, source, kcal_per_100g, protein_per_100g)
values ('blueberries, raw', 'estimate', 1, 1)
on conflict (canonical_key) do nothing;

do $$
begin
  if not exists (select 1 from public.food_cache
                 where canonical_key = 'blueberries, raw' and source = 'usda') then
    raise exception 'service_role could not read back its cache row, or it was overwritten';
  end if;
  begin
    update public.food_cache set kcal_per_100g = 0;
    raise exception 'service_role update on food_cache was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.food_cache;
    raise exception 'service_role delete on food_cache was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.food_entries;
    raise exception 'service_role select on food_entries was allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.food_items;
    raise exception 'service_role select on food_items was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A cache row is a USDA pick (with its FDC id) or an estimate (without one).
do $$
begin
  begin
    insert into public.food_cache (canonical_key, source, kcal_per_100g, protein_per_100g)
    values ('no id', 'usda', 1, 1);
    raise exception 'a usda cache row without an fdc_id was allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.food_cache (canonical_key, source, kcal_per_100g, protein_per_100g)
    values ('bad source', 'guess', 1, 1);
    raise exception 'an unknown cache source was allowed';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- anon has no access at all.
set local role anon;
do $$
declare t text;
begin
  foreach t in array array['food_entries', 'food_items', 'food_cache'] loop
    begin
      execute format('select 1 from public.%I', t);
      raise exception 'anon select on % was allowed', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
reset role;

do $$
declare sig text := 'public.save_food_entry(uuid, text, date, jsonb)';
begin
  if has_function_privilege('anon', sig, 'execute') then
    raise exception 'anon can execute save_food_entry';
  end if;
  if not has_function_privilege('authenticated', sig, 'execute') then
    raise exception 'authenticated cannot execute save_food_entry';
  end if;
  -- Security invoker, so row level security applies to the caller.
  if (select prosecdef from pg_proc where oid = sig::regprocedure) then
    raise exception 'save_food_entry must not be security definer';
  end if;
end $$;

-- ai_runs rows can be traced to the entry they were made for.
insert into public.ai_runs
  (user_id, entry_id, function_name, status, requested_model, effort,
   prompt_version, schema_version, attempts, input, started_at, finished_at)
values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000e001',
        'parseFood', 'success', 'm', 'low', 'p', '1', 1, '{}', now(), now()),
       ('00000000-0000-0000-0000-0000000000c1', null,
        'demo', 'success', 'm', 'low', 'p', '1', 1, '{}', now(), now());

do $$
begin
  if not exists (
    select 1 from public.ai_runs r
    join public.food_entries e on e.id = r.entry_id
    where r.function_name = 'parseFood'
  ) then
    raise exception 'ai_runs.entry_id does not join to the saved entry';
  end if;
end $$;

rollback;
SQL

echo "food check passed."
