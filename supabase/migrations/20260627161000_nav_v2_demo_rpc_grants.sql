-- Keep admin demo controls callable from the browser while preserving
-- owner/admin authorization inside each SECURITY DEFINER function.

revoke execute on function public.nav_v2_seed_demo_data() from public, anon;
revoke execute on function public.nav_v2_clear_demo_data() from public, anon;

grant execute on function public.nav_v2_seed_demo_data() to authenticated;
grant execute on function public.nav_v2_clear_demo_data() to authenticated;
