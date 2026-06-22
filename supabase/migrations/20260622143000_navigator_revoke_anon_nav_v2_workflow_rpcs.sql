-- Навигатор сделок v2: закрываем публичный вызов рабочих RPC.
-- Эти функции должны вызываться только после входа пользователя в систему.

revoke execute on function public.nav_v2_get_lawyer_queue(integer) from public;
revoke execute on function public.nav_v2_get_lawyer_queue(integer) from anon;
grant execute on function public.nav_v2_get_lawyer_queue(integer) to authenticated;
grant execute on function public.nav_v2_get_lawyer_queue(integer) to service_role;

revoke execute on function public.nav_v2_return_spn_rework(uuid, text) from public;
revoke execute on function public.nav_v2_return_spn_rework(uuid, text) from anon;
grant execute on function public.nav_v2_return_spn_rework(uuid, text) to authenticated;
grant execute on function public.nav_v2_return_spn_rework(uuid, text) to service_role;

revoke execute on function public.nav_v2_submit_spn_rework(uuid, text) from public;
revoke execute on function public.nav_v2_submit_spn_rework(uuid, text) from anon;
grant execute on function public.nav_v2_submit_spn_rework(uuid, text) to authenticated;
grant execute on function public.nav_v2_submit_spn_rework(uuid, text) to service_role;
