-- Free-text food logging. The browser saves an entry and its items
-- with the user's own JWT through save_food_entry, so row level security is
-- the guard. The server owns food_cache and never touches saved food.

-- service_role: none public.food_entries (the server never reads or writes it)
create table public.food_entries (
  -- The id the server issued with the preview; ai_runs.entry_id points here.
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null,
  -- The device's local calendar day when Done was pressed.
  local_date date not null,
  logged_at timestamptz not null default now()
);

create index food_entries_user_date_idx on public.food_entries (user_id, local_date);

-- service_role: none public.food_items (the server never reads or writes it)
create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.food_entries (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  position integer not null check (position >= 0),
  name text not null,
  canonical_name text not null,
  -- Unrounded; display rounds.
  grams double precision not null check (grams > 0),
  kcal double precision not null check (kcal >= 0),
  protein_g double precision not null check (protein_g >= 0),
  fruit_veg_g double precision not null check (fruit_veg_g >= 0),
  kcal_per_100g double precision not null check (kcal_per_100g >= 0),
  protein_per_100g double precision not null check (protein_per_100g >= 0),
  estimated boolean not null,
  portion_estimated boolean not null,
  fdc_id integer,
  unique (entry_id, position)
);

create index food_items_user_idx on public.food_items (user_id);

alter table public.food_entries enable row level security;
alter table public.food_items enable row level security;

create policy food_entries_select_own on public.food_entries
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy food_entries_insert_own on public.food_entries
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy food_items_select_own on public.food_items
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy food_items_insert_own on public.food_items
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.food_entries e
      where e.id = entry_id and e.user_id = (select auth.uid())
    )
  );

-- Local Supabase grants new tables to every role by default, so take that
-- back before granting only what is needed. No update or delete: saved food
-- cannot be edited or deleted yet; a later migration grants it when it can.
revoke all on public.food_entries from anon, authenticated, service_role;
revoke all on public.food_items from anon, authenticated, service_role;
grant select, insert on public.food_entries to authenticated;
grant select, insert on public.food_items to authenticated;

-- Done: the entry and all its items in one transaction. Security invoker, so
-- the caller's row level security applies. A repeated call with the same
-- entry id changes nothing, so Done saves only once.
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
     portion_estimated, fdc_id)
  select p_entry_id, (i.ord - 1)::integer, i.item->>'name', i.item->>'canonical_name',
    (i.item->>'grams')::double precision, (i.item->>'kcal')::double precision,
    (i.item->>'protein_g')::double precision, (i.item->>'fruit_veg_g')::double precision,
    (i.item->>'kcal_per_100g')::double precision,
    (i.item->>'protein_per_100g')::double precision,
    (i.item->>'estimated')::boolean, (i.item->>'portion_estimated')::boolean,
    (i.item->>'fdc_id')::integer
  from jsonb_array_elements(p_items) with ordinality as i(item, ord);
end;
$$;

revoke all on function public.save_food_entry(uuid, text, date, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_food_entry(uuid, text, date, jsonb) to authenticated;

-- USDA picks and AI estimates per canonical name, shared by every entry (the
-- data is not personal). Only the server reads and adds rows; nothing removes
-- them, so undoing an entry leaves its lookups cached.
-- authenticated: none public.food_cache (only the server reads or writes it)
create table public.food_cache (
  canonical_key text primary key,
  source text not null check (source in ('usda', 'estimate')),
  fdc_id integer,
  description text,
  kcal_per_100g double precision not null check (kcal_per_100g >= 0),
  protein_per_100g double precision not null check (protein_per_100g >= 0),
  created_at timestamptz not null default now(),
  check ((source = 'usda') = (fdc_id is not null))
);

-- RLS on with no policies: signed-in users get nothing; service_role bypasses RLS.
alter table public.food_cache enable row level security;

revoke all on public.food_cache from anon, authenticated, service_role;
grant select, insert on public.food_cache to service_role;

-- Traces each AI call to the entry it was made for. No foreign key: the
-- entry exists only once Done is pressed, and undone or failed entries keep
-- their rows.
alter table public.ai_runs add column entry_id uuid;
create index ai_runs_entry_idx on public.ai_runs (entry_id) where entry_id is not null;
