-- Navigator v2: close public access to a helper RPC that should not be callable by anonymous users.
-- Applied in Supabase on 2026-06-16.

revoke execute on function public.nav_v2_can_change_task_status(uuid, uuid) from anon;
