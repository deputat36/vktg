revoke all on function public.nav_v2_update_deal_parties(uuid, text, text, text, text, text) from public;
revoke all on function public.nav_v2_update_deal_parties(uuid, text, text, text, text, text) from anon;
grant execute on function public.nav_v2_update_deal_parties(uuid, text, text, text, text, text) to authenticated, service_role;
