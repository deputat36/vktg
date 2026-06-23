revoke all on function public.nav_v2_touch_updated_at() from public;
revoke all on function public.nav_v2_touch_updated_at() from anon;
revoke all on function public.nav_v2_touch_updated_at() from authenticated;
grant execute on function public.nav_v2_touch_updated_at() to service_role;
