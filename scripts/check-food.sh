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
   fruit_veg_g, kcal_per_100g, protein_per_100g, estimated, portion_estimated, fdc_id,
   source, parsed_grams)
values ('00000000-0000-0000-0000-00000000e002',
        '00000000-0000-0000-0000-0000000000c2', 0, 'toast', 'bread, toasted',
        30, 80, 3, 0, 266, 10, false, false, 1, 'usda', 25);

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
      and source = 'usda' and brand is null
  ) then
    raise exception 'the eggs item lost its values';
  end if;
  if not exists (
    select 1 from public.food_items
    where name = '150 g blueberries' and position = 1 and fruit_veg_g = 150
      and estimated and fdc_id is null and source = 'estimated' and brand is null
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
       fruit_veg_g, kcal_per_100g, protein_per_100g, estimated, portion_estimated, source)
    values ('00000000-0000-0000-0000-00000000e002', 9, 'x', 'x', 1, 1, 1, 0, 1, 1,
            false, false, 'usda');
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

-- Saved food cannot be edited: no update grant. Delete is covered at the end.
do $$
declare t text;
begin
  foreach t in array array['food_entries', 'food_items'] loop
    begin
      execute format('update public.%I set user_id = user_id', t);
      raise exception 'authenticated update on % was allowed', t;
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

-- A branded pick and a brand-aware estimate keep their brand and source. (The
-- eggs and blueberries above were saved by a payload with no source:
-- save_food_entry derives it from estimated, so older clients keep saving.)
select public.save_food_entry(
  '00000000-0000-0000-0000-00000000e006', 'chobani and chipotle rice', '2026-10-28',
  '[{"name":"Chobani plain greek yogurt","canonical_name":"plain greek yogurt","grams":170,
     "kcal":100.3,"protein_g":17.51,"fruit_veg_g":0,"kcal_per_100g":59,"protein_per_100g":10.3,
     "estimated":false,"portion_estimated":false,"fdc_id":2755837,
     "brand":"Chobani","source":"branded"},
    {"name":"Chipotle white rice","canonical_name":"white rice","grams":140,
     "kcal":210,"protein_g":7,"fruit_veg_g":0,"kcal_per_100g":150,"protein_per_100g":5,
     "estimated":true,"portion_estimated":true,"fdc_id":null,
     "brand":"Chipotle","source":"estimated"}]'::jsonb
);

do $$
begin
  if not exists (
    select 1 from public.food_items
    where entry_id = '00000000-0000-0000-0000-00000000e006'
      and brand = 'Chobani' and source = 'branded' and fdc_id = 2755837 and not estimated
  ) then
    raise exception 'the branded item lost its brand or source';
  end if;
  if not exists (
    select 1 from public.food_items
    where entry_id = '00000000-0000-0000-0000-00000000e006'
      and brand = 'Chipotle' and source = 'estimated' and fdc_id is null and estimated
  ) then
    raise exception 'the restaurant estimate lost its brand or source';
  end if;
end $$;

-- source is one of usda, branded or estimated, and is required.
do $$
begin
  begin
    insert into public.food_items
      (entry_id, position, name, canonical_name, grams, kcal, protein_g,
       fruit_veg_g, kcal_per_100g, protein_per_100g, estimated, portion_estimated, source)
    values ('00000000-0000-0000-0000-00000000e006', 9, 'x', 'x', 1, 1, 1, 0, 1, 1,
            false, false, 'guess');
    raise exception 'an unknown food_items source was allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.food_items
      (entry_id, position, name, canonical_name, grams, kcal, protein_g,
       fruit_veg_g, kcal_per_100g, protein_per_100g, estimated, portion_estimated)
    values ('00000000-0000-0000-0000-00000000e006', 9, 'x', 'x', 1, 1, 1, 0, 1, 1,
            false, false);
    raise exception 'a food_items row without a source was allowed';
  exception when not_null_violation then null;
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

-- A branded pick keeps its FDC id, brand and label serving size; an estimate
-- may carry the brand or restaurant it was made for. fdc_id is set exactly for
-- usda and branded rows.
insert into public.food_cache
  (canonical_key, source, fdc_id, description, brand, serving_size_g, kcal_per_100g, protein_per_100g)
values ('brand:chobani|plain greek yogurt', 'branded', 2755837, 'Chobani Plain Non- Fat Greek Yogurt',
        'Chobani', 170, 59, 10.3);
insert into public.food_cache (canonical_key, source, brand, kcal_per_100g, protein_per_100g)
values ('brand:chipotle|white rice', 'estimate', 'Chipotle', 150, 5);

do $$
begin
  if not exists (select 1 from public.food_cache
                 where canonical_key = 'brand:chobani|plain greek yogurt'
                   and source = 'branded' and brand = 'Chobani' and serving_size_g = 170) then
    raise exception 'a branded cache row lost its brand or serving size';
  end if;
  begin
    insert into public.food_cache (canonical_key, source, kcal_per_100g, protein_per_100g)
    values ('branded no id', 'branded', 1, 1);
    raise exception 'a branded cache row without an fdc_id was allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.food_cache (canonical_key, source, fdc_id, kcal_per_100g, protein_per_100g)
    values ('estimate with id', 'estimate', 5, 1, 1);
    raise exception 'an estimate cache row with an fdc_id was allowed';
  exception when check_violation then null;
  end;
  -- A household serving is an amount and a unit together, and the amount is positive.
  insert into public.food_cache
    (canonical_key, source, fdc_id, description, brand, serving_size_g, household_amount, household_unit, kcal_per_100g, protein_per_100g)
  values ('brand:rana|lobster ravioli', 'branded', 2607633, 'MAINE LOBSTER RAVIOLI', 'Rana', 103, 1, 'cup', 220, 9);
  if not exists (select 1 from public.food_cache
                 where canonical_key = 'brand:rana|lobster ravioli'
                   and serving_size_g = 103 and household_amount = 1 and household_unit = 'cup') then
    raise exception 'a branded cache row lost its household serving';
  end if;
  begin
    insert into public.food_cache (canonical_key, source, fdc_id, brand, household_amount, kcal_per_100g, protein_per_100g)
    values ('amount without unit', 'branded', 1, 'Acme', 1, 1, 1);
    raise exception 'a household amount without a unit was allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.food_cache (canonical_key, source, fdc_id, brand, household_amount, household_unit, kcal_per_100g, protein_per_100g)
    values ('zero amount', 'branded', 1, 'Acme', 0, 'cup', 1, 1);
    raise exception 'a household amount of zero was allowed';
  exception when check_violation then null;
  end;
  begin
    insert into public.food_cache (canonical_key, source, kcal_per_100g, protein_per_100g)
    values ('wrong word', 'estimated', 1, 1);
    raise exception 'food_cache accepted the food_items spelling of the estimate source';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- Edited grams (HEA-43): an edited item keeps the parse's grams in parsed_grams
-- and is saved with portion_estimated false; an unedited item, and a payload
-- from before this column, leave parsed_grams null.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select public.save_food_entry(
  '00000000-0000-0000-0000-00000000e007', 'edited eggs', '2026-11-09',
  '[{"name":"2 eggs","canonical_name":"egg, whole, raw","grams":200,"kcal":286,
     "protein_g":25.12,"fruit_veg_g":0,"kcal_per_100g":143,"protein_per_100g":12.56,
     "estimated":false,"portion_estimated":false,"fdc_id":171287,"source":"usda",
     "parsed_grams":113.4},
    {"name":"blueberries","canonical_name":"blueberries, raw","grams":150,"kcal":85.5,
     "protein_g":1.11,"fruit_veg_g":150,"kcal_per_100g":57,"protein_per_100g":0.74,
     "estimated":false,"portion_estimated":true,"fdc_id":171711,"source":"usda",
     "parsed_grams":null},
    {"name":"toast","canonical_name":"bread","grams":30,"kcal":80,
     "protein_g":3,"fruit_veg_g":0,"kcal_per_100g":266,"protein_per_100g":10,
     "estimated":false,"portion_estimated":true,"fdc_id":1}]'::jsonb
);

do $$
begin
  if not exists (select 1 from public.food_items
                 where entry_id = '00000000-0000-0000-0000-00000000e007'
                   and position = 0 and grams = 200 and parsed_grams = 113.4
                   and not portion_estimated) then
    raise exception 'an edited item lost its grams or parsed_grams';
  end if;
  if (select count(*) from public.food_items
      where entry_id = '00000000-0000-0000-0000-00000000e007'
        and position in (1, 2) and parsed_grams is null and portion_estimated) <> 2 then
    raise exception 'an unedited item got a parsed_grams or lost portion_estimated';
  end if;
  -- Own rows only: the other user's parsed_grams (25) is never visible.
  if exists (select 1 from public.food_items where parsed_grams = 25) then
    raise exception 'authenticated user saw another user''s parsed_grams';
  end if;
  begin
    perform public.save_food_entry(
      '00000000-0000-0000-0000-00000000e008', 'bad', '2026-11-09',
      '[{"name":"x","canonical_name":"x","grams":10,"kcal":1,"protein_g":1,
         "fruit_veg_g":0,"kcal_per_100g":10,"protein_per_100g":10,
         "estimated":false,"portion_estimated":false,"fdc_id":null,
         "parsed_grams":0}]'::jsonb);
    raise exception 'saved a parsed_grams of zero';
  exception when check_violation then null;
  end;
  begin
    update public.food_items set parsed_grams = 1;
    raise exception 'authenticated update of parsed_grams was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Origin (HEA-51): every item records `parsed` (from a parse) or `reused` (a
-- copy of a logged item); a payload without one is `parsed`; nothing else is accepted.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select public.save_food_entry(
  '00000000-0000-0000-0000-00000000e009', 'Chobani Plain greek yogurt', '2026-11-13',
  '[{"name":"Chobani plain greek yogurt","canonical_name":"plain greek yogurt","grams":170,
     "kcal":100,"protein_g":17,"fruit_veg_g":0,"kcal_per_100g":59,"protein_per_100g":10,
     "estimated":true,"portion_estimated":false,"fdc_id":null,"brand":"Chobani",
     "source":"estimated","parsed_grams":null,"origin":"reused"},
    {"name":"toast","canonical_name":"bread","grams":30,"kcal":80,
     "protein_g":3,"fruit_veg_g":0,"kcal_per_100g":266,"protein_per_100g":10,
     "estimated":false,"portion_estimated":true,"fdc_id":1,"origin":"parsed"}]'::jsonb
);

do $$
begin
  if not exists (select 1 from public.food_items
                 where entry_id = '00000000-0000-0000-0000-00000000e009'
                   and position = 0 and origin = 'reused' and parsed_grams is null) then
    raise exception 'a copy did not keep origin reused';
  end if;
  if not exists (select 1 from public.food_items
                 where entry_id = '00000000-0000-0000-0000-00000000e009'
                   and position = 1 and origin = 'parsed') then
    raise exception 'a parsed item did not keep origin parsed';
  end if;
  -- A payload without an origin, and the rows saved before the column, are parsed.
  if exists (select 1 from public.food_items
             where entry_id = '00000000-0000-0000-0000-00000000e007'
               and origin <> 'parsed') then
    raise exception 'an item saved without an origin was not parsed';
  end if;
  begin
    perform public.save_food_entry(
      '00000000-0000-0000-0000-00000000e010', 'bad', '2026-11-13',
      '[{"name":"x","canonical_name":"x","grams":10,"kcal":1,"protein_g":1,
         "fruit_veg_g":0,"kcal_per_100g":10,"protein_per_100g":10,
         "estimated":false,"portion_estimated":false,"fdc_id":null,
         "origin":"typed"}]'::jsonb);
    raise exception 'saved an origin other than parsed or reused';
  exception when check_violation then null;
  end;
  begin
    update public.food_items set origin = 'reused';
    raise exception 'authenticated update of origin was allowed';
  exception when insufficient_privilege then null;
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

-- Delete (HEA-11): an owner deletes their own items; the entry goes with its
-- last item; another user's rows are untouched; food_cache and ai_runs stay.
reset role;
create temp table ai_runs_before as select count(*) as n from public.ai_runs;
grant select on ai_runs_before to authenticated;
insert into public.food_cache (canonical_key, source, kcal_per_100g, protein_per_100g)
values ('delete-check', 'estimate', 1, 1);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select public.save_food_entry(
  '00000000-0000-0000-0000-00000000e0d1', 'two', '2026-10-28',
  '[{"name":"a","canonical_name":"a","grams":1,"kcal":1,"protein_g":1,"fruit_veg_g":0,
     "kcal_per_100g":1,"protein_per_100g":1,"estimated":false,"portion_estimated":false,"fdc_id":null},
    {"name":"b","canonical_name":"b","grams":1,"kcal":1,"protein_g":1,"fruit_veg_g":0,
     "kcal_per_100g":1,"protein_per_100g":1,"estimated":false,"portion_estimated":false,"fdc_id":null}]'::jsonb);

-- Another user's item: deleting removes nothing.
delete from public.food_items where entry_id = '00000000-0000-0000-0000-00000000e002';
delete from public.food_entries where id = '00000000-0000-0000-0000-00000000e002';

do $$
begin
  delete from public.food_items
   where entry_id = '00000000-0000-0000-0000-00000000e0d1' and position = 0;
  if (select count(*) from public.food_items
       where entry_id = '00000000-0000-0000-0000-00000000e0d1') <> 1 then
    raise exception 'owner delete did not remove exactly one item';
  end if;
  if not exists (select 1 from public.food_entries
                 where id = '00000000-0000-0000-0000-00000000e0d1') then
    raise exception 'the entry went while it still had an item';
  end if;
  delete from public.food_items
   where entry_id = '00000000-0000-0000-0000-00000000e0d1' and position = 1;
  if exists (select 1 from public.food_entries
             where id = '00000000-0000-0000-0000-00000000e0d1') then
    raise exception 'an emptied entry was left behind';
  end if;
  if (select count(*) from public.food_entries
       where id = '00000000-0000-0000-0000-00000000e001') <> 1 then
    raise exception 'an unrelated entry went';
  end if;
end $$;

reset role;
do $$
begin
  if not exists (select 1 from public.food_items
                 where entry_id = '00000000-0000-0000-0000-00000000e002')
     or not exists (select 1 from public.food_entries
                    where id = '00000000-0000-0000-0000-00000000e002') then
    raise exception 'a user deleted another user''s food';
  end if;
  if not exists (select 1 from public.food_cache where canonical_key = 'delete-check') then
    raise exception 'deleting touched food_cache';
  end if;
  if (select count(*) from public.ai_runs) <> (select n from ai_runs_before) then
    raise exception 'deleting touched ai_runs';
  end if;
end $$;

-- anon and service_role cannot delete.
do $$
declare t text; r text;
begin
  foreach r in array array['anon', 'service_role'] loop
    foreach t in array array['food_entries', 'food_items'] loop
      if has_table_privilege(r, 'public.' || t, 'delete') then
        raise exception '% can delete from %', r, t;
      end if;
    end loop;
  end loop;
end $$;

rollback;
SQL

echo "food check passed."
