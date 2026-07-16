\set ON_ERROR_STOP on
\i supabase/prototypes/nav_v2_get_deal_card_lite_explicit_dto.sql

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $$
declare
  v_payload jsonb := public.nav_v2_get_deal_card_lite('10000000-0000-4000-8000-000000000001');
  v_task jsonb;
begin
  if (v_payload->>'dto_version')::int <> 1
     or v_payload ? 'task_contract_aware' then
    raise exception 'base lite DTO was not restored';
  end if;

  select item into v_task
  from jsonb_array_elements(v_payload->'tasks') item
  where item->>'id'=(select id::text from lite_ids where name='legal_task');

  if v_task ? 'task_contract_version'
     or v_task ? 'can_start'
     or v_task ? 'can_complete'
     or v_task ? 'can_decide_terminal_outcome' then
    raise exception 'contract-aware task fields remain after rollback';
  end if;

  if to_regprocedure('nav_v2_private.nav_v2_task_contract_catalog()') is null
     or to_regprocedure('public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid)') is null then
    raise exception 'bounded task contract/mutations were removed by DTO rollback';
  end if;
end;
$$;

select 'PostgreSQL contract-aware lite DTO rollback passed' as result;
