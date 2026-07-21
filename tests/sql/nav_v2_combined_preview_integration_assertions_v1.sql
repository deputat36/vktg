\set ON_ERROR_STOP on

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);

do $assertions$
declare
  v_intake jsonb;
  v_dto jsonb;
  v_dto_text text;
  v_quality_before integer;
  v_quality_after integer;
begin
  if to_regprocedure('public.nav_v2_sync_deal_quality_tasks(uuid)') is null then
    raise exception 'privacy-aligned quality runtime is missing in combined lifecycle';
  end if;
  if to_regprocedure('nav_v2_private.nav_v2_task_contract_catalog()') is null then
    raise exception 'bounded contract catalog is missing in combined lifecycle';
  end if;
  if to_regprocedure('nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb)') is null then
    raise exception 'intake adapter is missing in combined lifecycle';
  end if;
  if to_regclass('nav_v2_private.nav_v2_intake_save_requests_v1') is null then
    raise exception 'governed intake ledger is missing in combined lifecycle';
  end if;
  if jsonb_array_length(nav_v2_private.nav_v2_intake_catalog_v1()->'rules') <> 25 then
    raise exception 'combined intake catalog does not contain 25 rules';
  end if;

  select count(*) into v_quality_before
  from public.nav_deal_tasks_v2
  where source like 'auto_quality_%';

  v_intake := nav_v2_private.nav_v2_prepare_intake_save_v1(
    jsonb_set(harness.base_intake(), '{deal,intake_action}', '"self"'::jsonb, true)
  );

  if coalesce((v_intake->>'allowed')::boolean, false) is not true
     or coalesce((v_intake->>'writes_performed')::boolean, true) is not false
     or jsonb_array_length(v_intake #> '{work_plan,task_candidates}') <> 0 then
    raise exception 'combined simple intake contract mismatch: %', v_intake;
  end if;

  select count(*) into v_quality_after
  from public.nav_deal_tasks_v2
  where source like 'auto_quality_%';
  if v_quality_after <> v_quality_before then
    raise exception 'pure intake adapter changed quality task rows';
  end if;

  v_dto := public.nav_v2_get_deal_card_lite('10000000-0000-4000-8000-000000000001');
  v_dto_text := v_dto::text;
  if (v_dto->>'dto_version')::integer <> 2
     or coalesce((v_dto->>'task_contract_aware')::boolean, false) is not true then
    raise exception 'combined DTO lost bounded contract fields';
  end if;
  if v_dto_text like '%combined.seller.spn@example.test%'
     or v_dto_text like '%client_name%'
     or v_dto_text like '%seller_phone%'
     or v_dto_text like '%buyer_phone%'
     or v_dto #>> '{deal,address}' like '%кв.%'
     or v_dto #>> '{deal,address}' like '%99%' then
    raise exception 'combined DTO exposed direct identifier or unit-level address';
  end if;

  if has_table_privilege('authenticated', 'nav_v2_private.nav_v2_intake_save_requests_v1', 'SELECT')
     or has_table_privilege('anon', 'nav_v2_private.nav_v2_intake_save_requests_v1', 'SELECT') then
    raise exception 'combined governed intake ledger is readable by browser roles';
  end if;
  if not has_table_privilege('service_role', 'nav_v2_private.nav_v2_intake_save_requests_v1', 'SELECT') then
    raise exception 'combined governed intake ledger lacks service-role access';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid,uuid)',
       'EXECUTE'
     ) then
    raise exception 'combined actor-aware bounded RPC is executable by authenticated';
  end if;
  if not has_function_privilege(
       'service_role',
       'public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid,uuid)',
       'EXECUTE'
     ) then
    raise exception 'combined actor-aware bounded RPC lacks service-role execute';
  end if;
end;
$assertions$;

select set_config('request.jwt.claim.sub', '', false);
select 'Navigator v2 combined quality/bounded/intake integration assertions passed' as result;
