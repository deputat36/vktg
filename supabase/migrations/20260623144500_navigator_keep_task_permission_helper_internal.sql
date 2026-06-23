revoke all on function public.nav_v2_can_change_task_status(uuid, uuid) from public, anon, authenticated;
grant execute on function public.nav_v2_can_change_task_status(uuid, uuid) to service_role;
