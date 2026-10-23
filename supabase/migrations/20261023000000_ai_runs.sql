-- One row per AI function invocation (not per retry attempt). Written only by
-- the server with the service-role key; a signed-in user may read their own.
create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  function_name text not null,
  status text not null check (
    status in ('success', 'api_error', 'validation_error', 'refusal', 'truncated')
  ),
  -- The model that answered; null when no answer came back. It can differ from
  -- requested_model if a refusal falls back to another model.
  model text,
  requested_model text not null,
  effort text not null,
  prompt_version text not null,
  schema_version text not null,
  attempts integer not null check (attempts >= 1),
  input_tokens integer,
  output_tokens integer,
  cache_read_tokens integer,
  cache_write_tokens integer,
  cost_usd numeric(14, 8),
  stop_reason text,
  -- Set only when stop_reason is 'refusal'.
  stop_details jsonb,
  input jsonb not null,
  output jsonb,
  validation_errors jsonb,
  error_message text,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index ai_runs_user_created_idx on public.ai_runs (user_id, created_at desc);
create index ai_runs_created_idx on public.ai_runs (created_at);

alter table public.ai_runs enable row level security;

create policy ai_runs_select_own on public.ai_runs
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Read-only for signed-in users; inserts come from the server (service role).
-- Local Supabase grants new tables to anon and authenticated by default, so
-- take that back before granting only what is needed.
revoke all on public.ai_runs from anon, authenticated;
grant select on public.ai_runs to authenticated;

-- 90-day retention.
create or replace function public.purge_ai_runs()
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  delete from public.ai_runs where created_at < now() - interval '90 days';
$$;

revoke all on function public.purge_ai_runs() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('purge-ai-runs', '17 3 * * *', 'select public.purge_ai_runs()');
