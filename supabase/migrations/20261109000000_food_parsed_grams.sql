-- Edit an item's grams in the preview (HEA-43). An item the user edited keeps
-- the grams the parse gave in parsed_grams (and is saved with portion_estimated
-- false); an unedited item leaves it null. Additive, so the code on main keeps
-- working until this change deploys: a payload without parsed_grams stays valid.
-- Table-level grants and the per-user policies already cover the new column.

alter table public.food_items add column parsed_grams double precision;
alter table public.food_items
  add constraint food_items_parsed_grams_check check (parsed_grams is null or parsed_grams > 0);

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
     portion_estimated, fdc_id, brand, source, parsed_grams)
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
    ),
    (i.item->>'parsed_grams')::double precision
  from jsonb_array_elements(p_items) with ordinality as i(item, ord);
end;
$$;

revoke all on function public.save_food_entry(uuid, text, date, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_food_entry(uuid, text, date, jsonb) to authenticated;
