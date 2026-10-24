-- The server writes ai_runs with the service-role key. Hosted Supabase does not
-- grant new tables to service_role, so without this every insert fails with
-- "permission denied for table ai_runs" (local Supabase grants by default,
-- which hid it). Give the server what it needs and nothing else; retention
-- deletes run inside purge_ai_runs() as the function owner.
revoke all on public.ai_runs from service_role;
grant select, insert on public.ai_runs to service_role;
