-- One row per failed browser data call (HEA-35), so a failure like a lost save
-- response can be diagnosed. Written by the browser with the user's own JWT.
-- It holds diagnostic fields only: never the entry text or other food data.
-- service_role: none public.client_errors (written and read by users only)
create table public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  operation text not null check (
    operation in (
      'save', 'parse', 'load_entries', 'load_targets', 'save_targets', 'delete_item'
    )
  ),
  error_message text not null check (char_length(error_message) <= 1000),
  error_code text,
  -- Null when there was no response.
  http_status integer,
  online boolean not null,
  app_version text not null,
  created_at timestamptz not null default now()
);

create index client_errors_user_created_idx on public.client_errors (user_id, created_at desc);
create index client_errors_created_idx on public.client_errors (created_at);

alter table public.client_errors enable row level security;

create policy client_errors_select_own on public.client_errors
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy client_errors_insert_own on public.client_errors
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Owner read and insert only. Local Supabase grants new tables to anon,
-- authenticated and service_role by default, so take that back first; nothing
-- on the server touches this table.
revoke all on public.client_errors from anon, authenticated, service_role;
grant select, insert on public.client_errors to authenticated;

-- 90-day retention, like ai_runs.
create or replace function public.purge_client_errors()
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  delete from public.client_errors where created_at < now() - interval '90 days';
$$;

revoke all on function public.purge_client_errors() from public, anon, authenticated, service_role;

select cron.schedule('purge-client-errors', '23 3 * * *', 'select public.purge_client_errors()');
