create schema if not exists nav_v2_private authorization postgres;

revoke all on schema nav_v2_private from public;
revoke all on schema nav_v2_private from anon;
revoke all on schema nav_v2_private from authenticated;
grant usage on schema nav_v2_private to service_role;

alter function public.nav_v2_guard_active_spn_manager() set schema nav_v2_private;

revoke execute on function nav_v2_private.nav_v2_guard_active_spn_manager() from public;
revoke execute on function nav_v2_private.nav_v2_guard_active_spn_manager() from anon;
revoke execute on function nav_v2_private.nav_v2_guard_active_spn_manager() from authenticated;
grant execute on function nav_v2_private.nav_v2_guard_active_spn_manager() to service_role;
