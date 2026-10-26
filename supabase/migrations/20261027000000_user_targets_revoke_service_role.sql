-- The server never reads or writes user_targets. Hosted Supabase gives
-- service_role no grant on new tables but local does, so take it back here to
-- make local behave like hosted (AGENTS.md → Grants). A no-op on hosted.
revoke all on public.user_targets from service_role;
