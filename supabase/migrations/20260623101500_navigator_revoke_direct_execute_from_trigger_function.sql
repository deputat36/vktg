revoke all on function public.nav_set_deal_created_by() from public;
revoke all on function public.nav_set_deal_created_by() from anon;
revoke all on function public.nav_set_deal_created_by() from authenticated;
grant execute on function public.nav_set_deal_created_by() to service_role;
