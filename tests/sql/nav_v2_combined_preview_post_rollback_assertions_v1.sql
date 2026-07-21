\set ON_ERROR_STOP on

do $assertions$
declare
  v_sync_md5 text;
  v_trigger_fn_md5 text;
  v_trigger_md5 text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'nav_deal_tasks_v2'
      and column_name in (
        'task_contract_version', 'completion_criterion_code', 'evidence_kind',
        'evidence_reference_id', 'evidence_confirmed_at', 'gate_scope',
        'outcome_code', 'outcome_state', 'outcome_reason_code',
        'outcome_review_date', 'outcome_replacement_task_id'
      )
  ) then
    raise exception 'bounded task columns remain after combined rollback';
  end if;

  if to_regclass('public.nav_deal_task_mutation_events_v2') is not null then
    raise exception 'bounded mutation event table remains after combined rollback';
  end if;
  if to_regclass('nav_v2_private.nav_v2_intake_save_requests_v1') is not null then
    raise exception 'governed intake ledger remains after combined rollback';
  end if;

  if to_regprocedure('public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid,uuid)') is not null
     or to_regprocedure('public.nav_v2_start_bounded_task(uuid,uuid,uuid)') is not null
     or to_regprocedure('nav_v2_private.nav_v2_task_contract_catalog()') is not null then
    raise exception 'bounded functions remain after combined rollback';
  end if;

  if to_regprocedure('nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb)') is not null
     or to_regprocedure('nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(jsonb,uuid,jsonb)') is not null
     or to_regprocedure('nav_v2_private.nav_v2_map_governed_intake_to_production_v1(jsonb)') is not null then
    raise exception 'intake functions remain after combined rollback';
  end if;

  if to_regprocedure('public.nav_v2_get_deal_card_lite(uuid)') is null then
    raise exception 'explicit lite DTO baseline is missing after combined rollback';
  end if;

  if not exists (
    select 1
    from public.nav_deal_tasks_v2
    where id = '20000000-0000-4000-8000-000000000001'
      and source = 'legacy_combined_synthetic'
      and task_contract_version is null
  ) then
    raise exception 'combined legacy task did not survive rollback';
  end if;

  v_sync_md5 := md5(pg_get_functiondef('public.nav_v2_sync_deal_quality_tasks(uuid)'::regprocedure));
  v_trigger_fn_md5 := md5(pg_get_functiondef('public.nav_v2_deal_quality_tasks_trigger()'::regprocedure));
  v_trigger_md5 := md5(pg_get_triggerdef((
    select oid
    from pg_trigger
    where tgname = 'nav_deals_v2_quality_tasks_aiu'
      and not tgisinternal
  ), true));

  if v_sync_md5 <> (select definition_md5 from harness.quality_snapshot where object_name='sync') then
    raise exception 'quality sync snapshot was not restored after combined rollback';
  end if;
  if v_trigger_fn_md5 <> (select definition_md5 from harness.quality_snapshot where object_name='trigger_function') then
    raise exception 'quality trigger function snapshot was not restored after combined rollback';
  end if;
  if v_trigger_md5 <> (select definition_md5 from harness.quality_snapshot where object_name='trigger') then
    raise exception 'quality trigger snapshot was not restored after combined rollback';
  end if;

  if to_regprocedure('nav_v2_private.nav_v2_quality_sync_task_v1(uuid,boolean,text,text,text,uuid,nav_v2_user_role,nav_v2_task_priority,text,integer)') is not null then
    raise exception 'privacy-aligned quality helper remains after combined rollback';
  end if;
end;
$assertions$;

select 'Navigator v2 combined preview post-rollback assertions passed' as result;
