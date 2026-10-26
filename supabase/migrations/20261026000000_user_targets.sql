-- Daily targets, one row per user. The browser reads and writes it with the
-- user's own JWT, so row level security is the only guard.
-- service_role: none public.user_targets (the server never reads or writes it)
create table public.user_targets (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Null means unset. Whole numbers greater than 0; bigint so there is no
  -- practical upper limit.
  calories_kcal bigint check (calories_kcal > 0),
  protein_g bigint check (protein_g > 0),
  -- fruit_veg_g only counts once fruit_veg_edited is true. Until then the user
  -- follows the current default from packages/core, and the default is never
  -- stored. After an edit, null means the user cleared it and it stays unset.
  fruit_veg_g bigint check (fruit_veg_g > 0),
  fruit_veg_edited boolean not null default false
);

alter table public.user_targets enable row level security;

create policy user_targets_select_own on public.user_targets
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_targets_insert_own on public.user_targets
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy user_targets_update_own on public.user_targets
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy user_targets_delete_own on public.user_targets
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Local Supabase grants new tables to anon and authenticated by default, so
-- take that back before granting only what is needed.
revoke all on public.user_targets from anon, authenticated;
grant select, insert, update, delete on public.user_targets to authenticated;
