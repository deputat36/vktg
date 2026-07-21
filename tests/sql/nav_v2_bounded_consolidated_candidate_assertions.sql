\set ON_ERROR_STOP on

do $assertions$
declare
  v_signature text;
  v_payload jsonb;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='nav_deal_tasks_v2'
      and column_name='task_contract_version'
  ) then
    raise exception 'consolidated bounded contract column is missing';
  end if;

  if to_regclass('public.nav_deal_task_mutation_events_v2') is null then
    raise exception 'consolidated bounded mutation event table is missing';
  end if;

  foreach v_signature in array array[
    'public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid,uuid)',
    'public.nav_v2_start_bounded_task(uuid,uuid,uuid)',
    'public.nav_v2_complete_bounded_task(uuid,uuid,uuid,uuid)',
    'public.nav_v2_set_bounded_task_active_outcome(uuid,text,text,date,uuid,uuid)',
    'public.nav_v2_propose_bounded_task_terminal_outcome(uuid,text,text,uuid,uuid,uuid)',
    'public.nav_v2_decide_bounded_task_terminal_outcome(uuid,text,uuid,uuid)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'actor-aware overload is missing: %', v_signature;
    end if;
    if has_function_privilege('authenticated', v_signature, 'EXECUTE')
       or has_function_privilege('anon', v_signature, 'EXECUTE')
       or has_function_privilege('public', v_signature, 'EXECUTE') then
      raise exception 'actor-aware overload escaped service-role-only boundary: %', v_signature;
    end if;
    if not has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'service_role EXECUTE is missing: %', v_signature;
    end if;
  end loop;

  if to_regprocedure('public.nav_v2_get_deal_card_lite(uuid)') is null then
    raise exception 'bounded lite DTO function is missing';
  end if;

  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
  v_payload := public.nav_v2_get_deal_card_lite('10000000-0000-4000-8000-000000000001');
  if coalesce((v_payload->>'dto_version')::integer,0) <> 2
     or coalesce((v_payload->>'task_contract_aware')::boolean,false) is not true then
    raise exception 'consolidated bounded DTO contract marker mismatch: %', v_payload;
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_payload->'tasks') item
    where item->>'id'='20000000-0000-4000-8000-000000000001'
      and coalesce((item->>'legacy_status_path')::boolean,false) is true
      and coalesce((item->>'is_bounded')::boolean,true) is false
  ) then
    raise exception 'legacy task compatibility row is missing from consolidated DTO';
  end if;
end;
$assertions$;

select 'Navigator v2 consolidated bounded candidate integration assertions passed' as result;
