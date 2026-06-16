-- Navigator v2: remove PUBLIC execute grant and explicitly keep authenticated/service_role access.
-- Applied in Supabase on 2026-06-16.

revoke execute on function public.nav_v2_can_change_task_status(uuid, uuid) from public;
grant execute on function public.nav_v2_can_change_task_status(uuid, uuid) to authenticated;
grant execute on function public.nav_v2_can_change_task_status(uuid, uuid) to service_role;
