\set ON_ERROR_STOP on

do $assertions$
declare
  v_signature text;
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
    raise exception 'bounded columns remain after consolidated rollback';
  end if;

  if to_regclass('public.nav_deal_task_mutation_events_v2') is not null then
    raise exception 'bounded mutation event table remains after consolidated rollback';
  end if;

  foreach v_signature in array array[
    'public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid)',
    'public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid,uuid)',
    'public.nav_v2_start_bounded_task(uuid,uuid)',
    'public.nav_v2_start_bounded_task(uuid,uuid,uuid)',
    'public.nav_v2_complete_bounded_task(uuid,uuid,uuid)',
    'public.nav_v2_complete_bounded_task(uuid,uuid,uuid,uuid)',
    'public.nav_v2_set_bounded_task_active_outcome(uuid,text,text,date,uuid)',
    'public.nav_v2_set_bounded_task_active_outcome(uuid,text,text,date,uuid,uuid)',
    'public.nav_v2_propose_bounded_task_terminal_outcome(uuid,text,text,uuid,uuid)',
    'public.nav_v2_propose_bounded_task_terminal_outcome(uuid,text,text,uuid,uuid,uuid)',
    'public.nav_v2_decide_bounded_task_terminal_outcome(uuid,text,uuid)',
    'public.nav_v2_decide_bounded_task_terminal_outcome(uuid,text,uuid,uuid)',
    'nav_v2_private.nav_v2_task_contract_catalog()',
    'nav_v2_private.nav_v2_require_verified_actor(uuid)',
    'nav_v2_private.nav_v2_assert_actor_replay(uuid,text,uuid)',
    'nav_v2_private.nav_v2_actor_claim_restore(text)'
  ] loop
    if to_regprocedure(v_signature) is not null then
      raise exception 'bounded function remains after consolidated rollback: %', v_signature;
    end if;
  end loop;

  if to_regprocedure('public.nav_v2_get_deal_card_lite(uuid)') is null then
    raise exception 'explicit lite DTO baseline is missing after consolidated rollback';
  end if;

  if not exists (
    select 1
    from public.nav_deal_tasks_v2
    where id='20000000-0000-4000-8000-000000000001'
      and task_type='operational_task'
      and source='legacy_synthetic'
  ) then
    raise exception 'legacy task did not survive consolidated rollback';
  end if;

  if exists (
    select 1
    from public.nav_deal_tasks_v2
    where id <> '20000000-0000-4000-8000-000000000001'
      and source='bounded_contract_v1'
  ) then
    raise exception 'bounded synthetic task rows remain after consolidated rollback';
  end if;
end;
$assertions$;

select 'Navigator v2 consolidated bounded candidate rollback assertions passed' as result;
