-- Deleting a logged food item (HEA-11). The browser deletes with the user's own
-- JWT, so row level security is the guard: own rows only. Deleting an entry's
-- last item removes the entry. Deleting leaves food_cache and ai_runs alone.

create policy food_entries_delete_own on public.food_entries
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy food_items_delete_own on public.food_items
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- authenticated only; anon and service_role stay without delete.
grant delete on public.food_entries to authenticated;
grant delete on public.food_items to authenticated;

-- Security invoker, so the caller's row level security applies to the entry delete.
create function public.delete_empty_food_entry() returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.food_entries e
  where e.id = old.entry_id
    and not exists (select 1 from public.food_items i where i.entry_id = e.id);
  return null;
end;
$$;

create trigger food_items_delete_empty_entry
  after delete on public.food_items
  for each row execute function public.delete_empty_food_entry();
