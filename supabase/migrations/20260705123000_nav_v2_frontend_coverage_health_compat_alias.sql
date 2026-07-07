-- Navigator v2 frontend coverage health compatibility alias.
--
-- Context:
-- Some old diagnostics may still call nav_v2_get_frontend_coverage_health().
-- The current canonical RPC is nav_v2_get_frontend_rpc_coverage_health().
-- Keep this wrapper so stale diagnostic links fail gracefully without duplicating logic.

create or replace function public.nav_v2_get_frontend_coverage_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.nav_v2_get_frontend_rpc_coverage_health();
end;
$$;

revoke all on function public.nav_v2_get_frontend_coverage_health() from public;
revoke all on function public.nav_v2_get_frontend_coverage_health() from anon;
grant execute on function public.nav_v2_get_frontend_coverage_health() to authenticated;
grant execute on function public.nav_v2_get_frontend_coverage_health() to service_role;

comment on function public.nav_v2_get_frontend_coverage_health() is
  'Compatibility wrapper for stale Navigator v2 diagnostics. Canonical RPC: nav_v2_get_frontend_rpc_coverage_health.';
