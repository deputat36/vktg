\set ON_ERROR_STOP on

revoke execute on function public.nav_v2_create_consultation(jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.nav_v2_get_consultation_queue(integer) from public, anon, authenticated, service_role;
revoke execute on function public.nav_v2_get_consultation(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.nav_v2_decide_consultation(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke execute on function public.nav_v2_add_consultation_clarification(uuid, text) from public, anon, authenticated, service_role;
revoke execute on function public.nav_v2_close_consultation(uuid, text, text) from public, anon, authenticated, service_role;

drop function if exists public.nav_v2_decide_consultation(uuid, text, text);
drop function if exists public.nav_v2_decide_consultation(uuid, text, text, text);
drop function if exists public.nav_v2_close_consultation(uuid, text, text);
drop function if exists public.nav_v2_add_consultation_clarification(uuid, text);
drop function if exists public.nav_v2_get_consultation(uuid);
drop function if exists public.nav_v2_get_consultation_queue(integer);
drop function if exists public.nav_v2_create_consultation(jsonb);

drop function if exists nav_v2_private.nav_v2_consultation_conversion_draft(uuid);
drop function if exists nav_v2_private.nav_v2_can_decide_consultation(uuid, uuid);
drop function if exists nav_v2_private.nav_v2_can_view_consultation(uuid, uuid);
drop function if exists nav_v2_private.nav_v2_consultation_text_findings(text);

drop table if exists public.nav_consultation_messages_v2;
drop table if exists public.nav_consultations_v2;

do $rollback$
begin
  perform harness.assert_true(to_regclass('public.nav_consultations_v2') is null, 'consultations table survived rollback');
  perform harness.assert_true(to_regclass('public.nav_consultation_messages_v2') is null, 'messages table survived rollback');
  perform harness.assert_true(to_regprocedure('public.nav_v2_create_consultation(jsonb)') is null, 'create RPC survived rollback');
  perform harness.assert_true(to_regprocedure('public.nav_v2_decide_consultation(uuid,text,text,text)') is null, 'decide RPC survived rollback');
  perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_can_view_consultation(uuid,uuid)') is null, 'private access helper survived rollback');
  perform harness.assert_true((select count(*) from public.nav_deals_v2) = 0, 'rollback altered marker deals');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2) = 0, 'rollback altered marker tasks');
  perform harness.assert_true((select count(*) from public.nav_deal_documents_v2) = 0, 'rollback altered marker documents');
  perform harness.assert_true((select count(*) from public.nav_deal_risks_v2) = 0, 'rollback altered marker risks');
end;
$rollback$;

select 'Navigator v2 PostgreSQL consultation harness rollback passed' as result;
