-- Assertions after mutation rollback followed by bounded base contract rollback.
-- The mutation harness intentionally exercises the legacy status RPC, so this file
-- verifies row identity/type rather than rolling back that legitimate legacy action.

\set ON_ERROR_STOP on

do $$
declare
  v_column text;
begin
  if to_regclass('public.nav_deal_task_mutation_events_v2') is not null then
    raise exception 'mutation event table remains after base rollback';
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
      select 1 from information_schema.columns
      where table_schema='public'
        and table_name='nav_deal_tasks_v2'
        and column_name=v_column
    ) then
      raise exception 'bounded column % remains after base rollback', v_column;
    end if;
  end loop;

  if to_regprocedure('nav_v2_private.nav_v2_task_contract_catalog()') is not null
     or to_regprocedure('nav_v2_private.nav_v2_suggest_bounded_task_contract(text,public.nav_v2_user_role)') is not null then
    raise exception 'bounded catalog remains after base rollback';
  end if;

  if to_regprocedure('public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid)') is not null
     or to_regprocedure('public.nav_v2_start_bounded_task(uuid,uuid)') is not null
     or to_regprocedure('public.nav_v2_complete_bounded_task(uuid,uuid,uuid)') is not null
     or to_regprocedure('public.nav_v2_set_bounded_task_active_outcome(uuid,text,text,date,uuid)') is not null
     or to_regprocedure('public.nav_v2_propose_bounded_task_terminal_outcome(uuid,text,text,uuid,uuid)') is not null
     or to_regprocedure('public.nav_v2_decide_bounded_task_terminal_outcome(uuid,text,uuid)') is not null then
    raise exception 'governed RPC remains after base rollback';
  end if;

  if not exists (
    select 1 from public.nav_deal_tasks_v2
    where id='20000000-0000-4000-8000-000000000001'
      and title='Legacy task must remain untouched'
      and task_type='operational_task'
      and status='in_progress'
  ) then
    raise exception 'legacy task identity/type or intentional status exercise was not preserved by complete rollback';
  end if;
  if (select count(*) from public.nav_deal_tasks_v2) <> 1 then
    raise exception 'synthetic bounded rows remain after complete rollback';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.nav_deal_tasks_v2'::regclass
      and conname='nav_deal_tasks_v2_task_type_check'
      and convalidated is true
  ) then
    raise exception 'legacy task type constraint was not restored';
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
     ) then
    raise exception 'legacy authenticated grants were not restored';
  end if;
end;
$$;

select 'PostgreSQL bounded task base rollback assertions passed' as result;
