-- Final assertions after DTO rollback, mutation rollback and base contract rollback.

\set ON_ERROR_STOP on

do $$
declare
  v_payload jsonb;
  v_column text;
  v_baseline_count bigint;
  v_current_count bigint;
  v_baseline_triggers bigint;
  v_current_triggers bigint;
begin
  if to_regclass('public.nav_deal_task_mutation_events_v2') is not null then
    raise exception 'bounded mutation event table remains after complete rollback';
  end if;

  foreach v_column in array array[
    'task_contract_version',
    'completion_criterion_code',
    'evidence_kind',
    'evidence_reference_id',
    'evidence_confirmed_at',
    'gate_scope',
    'outcome_code',
    'outcome_state',
    'outcome_reason_code',
    'outcome_review_date',
    'outcome_replacement_task_id',
    'subject_kind',
    'subject_reference_id',
    'outcome_proposed_by',
    'outcome_proposed_at',
    'outcome_decided_by',
    'outcome_decided_at'
  ] loop
    if exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'nav_deal_tasks_v2'
        and c.column_name = v_column
    ) then
      raise exception 'bounded column % remains after complete rollback', v_column;
    end if;
  end loop;

  if to_regprocedure('nav_v2_private.nav_v2_task_contract_catalog()') is not null
     or to_regprocedure('nav_v2_private.nav_v2_suggest_bounded_task_contract(text,public.nav_v2_user_role)') is not null then
    raise exception 'bounded catalog functions remain after complete rollback';
  end if;

  if to_regprocedure('public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid)') is not null
     or to_regprocedure('public.nav_v2_start_bounded_task(uuid,uuid)') is not null
     or to_regprocedure('public.nav_v2_complete_bounded_task(uuid,uuid,uuid)') is not null
     or to_regprocedure('public.nav_v2_set_bounded_task_active_outcome(uuid,text,text,date,uuid)') is not null
     or to_regprocedure('public.nav_v2_propose_bounded_task_terminal_outcome(uuid,text,text,uuid,uuid)') is not null
     or to_regprocedure('public.nav_v2_decide_bounded_task_terminal_outcome(uuid,text,uuid)') is not null then
    raise exception 'governed bounded RPC remains after complete rollback';
  end if;

  if to_regprocedure('public.nav_v2_add_task(uuid,text,text,public.nav_v2_user_role,public.nav_v2_task_priority,text)') is null
     or to_regprocedure('public.nav_v2_update_task_status(uuid,public.nav_v2_task_status)') is null then
    raise exception 'legacy task RPC was not restored';
  end if;
  if not has_function_privilege(
       'authenticated',
       'public.nav_v2_add_task(uuid,text,text,public.nav_v2_user_role,public.nav_v2_task_priority,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.nav_v2_update_task_status(uuid,public.nav_v2_task_status)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.nav_v2_add_task(uuid,text,text,public.nav_v2_user_role,public.nav_v2_task_priority,text)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'service_role',
       'public.nav_v2_update_task_status(uuid,public.nav_v2_task_status)',
       'EXECUTE'
     ) then
    raise exception 'legacy synthetic baseline grants were not restored';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.nav_deal_tasks_v2'::regclass
      and c.conname = 'nav_deal_tasks_v2_task_type_check'
      and c.convalidated is true
  ) then
    raise exception 'legacy task type constraint was not restored as validated';
  end if;
  if exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.nav_deal_tasks_v2'::regclass
      and c.conname like 'nav_deal_tasks_v2_%'
      and c.conname in (
        'nav_deal_tasks_v2_bounded_task_type_check',
        'nav_deal_tasks_v2_contract_version_check',
        'nav_deal_tasks_v2_completion_code_check',
        'nav_deal_tasks_v2_evidence_kind_check',
        'nav_deal_tasks_v2_gate_scope_check',
        'nav_deal_tasks_v2_outcome_code_check',
        'nav_deal_tasks_v2_outcome_state_check',
        'nav_deal_tasks_v2_outcome_pair_check',
        'nav_deal_tasks_v2_replacement_check',
        'nav_deal_tasks_v2_active_outcome_review_check',
        'nav_deal_tasks_v2_done_evidence_check',
        'nav_deal_tasks_v2_contract_completeness_check',
        'nav_deal_tasks_v2_subject_kind_check',
        'nav_deal_tasks_v2_subject_required_check',
        'nav_deal_tasks_v2_terminal_status_check',
        'nav_deal_tasks_v2_completed_outcome_status_check'
      )
  ) then
    raise exception 'bounded constraint remains after complete rollback';
  end if;

  select legacy_task_count, task_trigger_count
  into v_baseline_count, v_baseline_triggers
  from nav_v2_deployment_test.baseline_counts;
  select count(*) into v_current_count from public.nav_deal_tasks_v2;
  if v_current_count <> v_baseline_count then
    raise exception 'task row count was not restored: baseline %, current %', v_baseline_count, v_current_count;
  end if;

  if exists (
    select 1
    from nav_v2_deployment_test.legacy_task_snapshot s
    left join public.nav_deal_tasks_v2 t on t.id = s.id
    where t.id is null
       or row(
         t.deal_id,t.title,t.description,t.assigned_to,t.assigned_role,t.status,t.priority,
         t.due_date,t.source,t.completed_by,t.completed_at,t.created_by,t.created_at,
         t.updated_at,t.task_type,t.sla_days
       ) is distinct from row(
         s.deal_id,s.title,s.description,s.assigned_to,s.assigned_role,s.status,s.priority,
         s.due_date,s.source,s.completed_by,s.completed_at,s.created_by,s.created_at,
         s.updated_at,s.task_type,s.sla_days
       )
  ) then
    raise exception 'legacy task row changed after complete rollback';
  end if;

  select count(*) into v_current_triggers
  from pg_trigger t
  where t.tgrelid = 'public.nav_deal_tasks_v2'::regclass
    and not t.tgisinternal;
  if v_current_triggers <> v_baseline_triggers then
    raise exception 'task trigger count was not restored';
  end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
  v_payload := public.nav_v2_get_deal_card_lite('10000000-0000-4000-8000-000000000001');
  if (v_payload->>'dto_version')::integer <> 1
     or v_payload ? 'task_contract_aware' then
    raise exception 'lite DTO v1 was not restored after complete rollback';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_payload->'tasks') item
    where item ? 'task_contract_version'
       or item ? 'can_start'
       or item ? 'can_complete'
       or item ? 'can_decide_terminal_outcome'
  ) then
    raise exception 'bounded task DTO fields remain after complete rollback';
  end if;
end;
$$;

drop schema nav_v2_deployment_test cascade;

do $$
begin
  if to_regnamespace('nav_v2_deployment_test') is not null then
    raise exception 'deployment test snapshot schema remains after cleanup';
  end if;
end;
$$;

select 'PostgreSQL bounded task complete deployment rollback assertions passed' as result;
