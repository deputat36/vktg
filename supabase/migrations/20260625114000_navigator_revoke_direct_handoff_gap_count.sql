revoke all on function public.nav_v2_handoff_gap_count(uuid) from public;
revoke all on function public.nav_v2_handoff_gap_count(uuid) from anon;
revoke all on function public.nav_v2_handoff_gap_count(uuid) from authenticated;
grant execute on function public.nav_v2_handoff_gap_count(uuid) to service_role;
