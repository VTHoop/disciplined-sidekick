-- Names are distinct from the ones Supabase installs for its "automatically
-- enable RLS" project option (ensure_rls / rls_auto_enable), so both coexist.
-- RLS is enabled by default on new public tables. This only turns RLS on;
-- each table still needs its own policies (and explicit grants).
create or replace function public.enforce_rls_on_new_tables()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  cmd record;
begin
  for cmd in
    select * from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
      and schema_name = 'public'
  loop
    execute format('alter table if exists %s enable row level security', cmd.object_identity);
  end loop;
end;
$$;

revoke all on function public.enforce_rls_on_new_tables() from public, anon, authenticated;

create event trigger enforce_rls_on_new_tables
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.enforce_rls_on_new_tables();
