\set ON_ERROR_STOP on

do $assertions$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='nav_deal_tasks_v2'
      and column_name in (
        'task_contract_version','completion_criterion_code','evidence_kind','evidence_reference_id',
        'evidence_confirmed_at','gate_scope','outcome_code','outcome_state','outcome_reason_code',
        'outcome_review_date','outcome_replacement_task_id'
      )
  ) then
    raise exception 'bounded task columns remain after core rehearsal rollback';
  end if;

  if to_regclass('public.nav_deal_task_mutation_events_v2') is not null then
    raise exception 'bounded mutation event table remains after core rehearsal rollback';
  end if;

  if to_regprocedure('nav_v2_private.nav_v2_task_contract_catalog()') is not null
     or to_regprocedure('public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid)') is not null
     or to_regprocedure('public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid,uuid)') is not null
     or to_regprocedure('public.nav_v2_start_bounded_task(uuid,uuid)') is not null
     or to_regprocedure('public.nav_v2_start_bounded_task(uuid,uuid,uuid)') is not null
     or to_regprocedure('nav_v2_private.nav_v2_require_verified_actor(uuid)') is not null then
    raise exception 'bounded core functions remain after rehearsal rollback';
  end if;

  if not exists (
    select 1 from public.nav_deal_tasks_v2
    where id='20000000-0000-4000-8000-000000000001'
      and task_type='operational_task'
      and source='legacy_synthetic'
  ) then
    raise exception 'legacy task did not survive bounded core rollback';
  end if;
end;
$assertions$;

select 'Navigator v2 bounded core rehearsal rollback assertions passed' as result;
