-- Brand- and restaurant-aware food lookup: every saved item records the brand
-- it was looked up under and where its values came from. Additive, so the
-- code on main keeps working until this change deploys: save_food_entry
-- derives the source from estimated when a payload has none.

-- food_items: brand (null for a generic item) and source (usda, branded or
-- estimated). Existing rows: estimated stays estimated, the rest were USDA.
alter table public.food_items add column brand text;
alter table public.food_items add column source text;

update public.food_items
set source = case when estimated then 'estimated' else 'usda' end;

alter table public.food_items alter column source set not null;
alter table public.food_items
  add constraint food_items_source_check check (source in ('usda', 'branded', 'estimated'));

-- food_cache: the brand a row was looked up under, the label serving size (in
-- grams) a branded pick converts "2 servings" with, and a third source.
alter table public.food_cache add column brand text;
alter table public.food_cache add column serving_size_g double precision;

-- Replace the checks that name the source (their generated names are not
-- worth relying on). The per-100 g checks do not mention it and stay.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.food_cache'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%source%'
  loop
    execute format('alter table public.food_cache drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.food_cache
  add constraint food_cache_source_check check (source in ('usda', 'branded', 'estimate')),
  -- A USDA or branded row names its FDC food; an estimate has none.
  add constraint food_cache_fdc_id_check check ((source in ('usda', 'branded')) = (fdc_id is not null)),
  add constraint food_cache_branded_brand_check check (source <> 'branded' or brand is not null),
  add constraint food_cache_serving_size_check check (serving_size_g is null or serving_size_g > 0);

-- Done: as before, plus each item's brand and source. A payload without a
-- source (code from before this change) gets one from estimated.
create or replace function public.save_food_entry(
  p_entry_id uuid,
  p_text text,
  p_local_date date,
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'an entry needs at least one item' using errcode = '22023';
  end if;

  insert into public.food_entries (id, text, local_date)
  values (p_entry_id, p_text, p_local_date)
  on conflict (id) do nothing;
  if not found then return; end if;

  insert into public.food_items
    (entry_id, position, name, canonical_name, grams, kcal, protein_g,
     fruit_veg_g, kcal_per_100g, protein_per_100g, estimated,
     portion_estimated, fdc_id, brand, source)
  select p_entry_id, (i.ord - 1)::integer, i.item->>'name', i.item->>'canonical_name',
    (i.item->>'grams')::double precision, (i.item->>'kcal')::double precision,
    (i.item->>'protein_g')::double precision, (i.item->>'fruit_veg_g')::double precision,
    (i.item->>'kcal_per_100g')::double precision,
    (i.item->>'protein_per_100g')::double precision,
    (i.item->>'estimated')::boolean, (i.item->>'portion_estimated')::boolean,
    (i.item->>'fdc_id')::integer,
    i.item->>'brand',
    coalesce(
      i.item->>'source',
      case when (i.item->>'estimated')::boolean then 'estimated' else 'usda' end
    )
  from jsonb_array_elements(p_items) with ordinality as i(item, ord);
end;
$$;

revoke all on function public.save_food_entry(uuid, text, date, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_food_entry(uuid, text, date, jsonb) to authenticated;
