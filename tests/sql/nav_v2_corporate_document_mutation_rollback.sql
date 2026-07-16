\set ON_ERROR_STOP on

revoke execute on function public.nav_v2_initialize_corporate_documents(uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.nav_v2_update_corporate_document(uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.nav_v2_propose_corporate_document_outcome(uuid, text, text, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.nav_v2_decide_corporate_document_outcome(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;

drop function if exists public.nav_v2_decide_corporate_document_outcome(uuid, text, text, uuid);
drop function if exists public.nav_v2_propose_corporate_document_outcome(uuid, text, text, uuid, uuid);
drop function if exists public.nav_v2_update_corporate_document(uuid, jsonb, uuid);
drop function if exists public.nav_v2_initialize_corporate_documents(uuid, jsonb, uuid);
drop function if exists nav_v2_private.nav_v2_can_mutate_corporate_document(uuid, uuid);
drop function if exists nav_v2_private.nav_v2_corporate_status_transition_allowed(text, text);
drop function if exists nav_v2_private.nav_v2_corporate_replay(uuid, text);
drop function if exists nav_v2_private.nav_v2_corporate_document_json(uuid);
drop function if exists nav_v2_private.nav_v2_corporate_text_findings(text);
drop table if exists public.nav_deal_corporate_document_events_v2;

do $$
begin
  if to_regclass('public.nav_deal_corporate_document_events_v2') is not null then
    raise exception 'corporate mutation event table survived rollback';
  end if;
  if to_regprocedure('public.nav_v2_initialize_corporate_documents(uuid,jsonb,uuid)') is not null then
    raise exception 'corporate initialize RPC survived rollback';
  end if;
  if to_regprocedure('public.nav_v2_decide_corporate_document_outcome(uuid,text,text,uuid)') is not null then
    raise exception 'corporate decide RPC survived rollback';
  end if;
  if to_regclass('public.nav_deal_corporate_documents_v2') is null then
    raise exception 'base corporate document table was removed by mutation rollback';
  end if;
  if (select count(*) from public.nav_deal_documents_v2) <> 0
     or (select count(*) from public.nav_deal_tasks_v2) <> 0
     or (select count(*) from public.nav_deal_risks_v2) <> 0 then
    raise exception 'rollback altered protected marker tables';
  end if;
end
$$;

select 'PostgreSQL corporate document mutation rollback passed' as result;
