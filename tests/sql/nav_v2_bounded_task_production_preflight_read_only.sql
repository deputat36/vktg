-- Read-only structural preflight for the future bounded-task migration.
-- This file contains no DDL, DML, grant changes or function calls with side effects.
-- The workflow must execute it inside BEGIN TRANSACTION READ ONLY ... ROLLBACK.

\set ON_ERROR_STOP on

select 1 / case
  when current_setting('server_version_num')::integer / 10000 = 17 then 1
  else 0
end as assert_postgres_major_17;

with actual as (
  select array_agg(column_name::text order by ordinal_position) as names
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'nav_deal_tasks_v2'
)
select 1 / case
  when names = array[
    'id','deal_id','title','description','assigned_to','assigned_role','status','priority',
    'due_date','source','completed_by','completed_at','created_by','created_at','updated_at',
    'task_type','sla_days'
  ]::text[] then 1
  else 0
end as assert_exact_legacy_task_columns
from actual;

with actual as (
  select array_agg(conname::text order by conname) as names
  from pg_constraint
  where conrelid = 'public.nav_deal_tasks_v2'::regclass
)
select 1 / case
  when names = array[
    'nav_deal_tasks_v2_assigned_to_fkey',
    'nav_deal_tasks_v2_completed_by_fkey',
    'nav_deal_tasks_v2_created_by_fkey',
    'nav_deal_tasks_v2_deal_id_fkey',
    'nav_deal_tasks_v2_pkey',
    'nav_deal_tasks_v2_sla_days_check',
    'nav_deal_tasks_v2_task_type_check'
  ]::text[] then 1
  else 0
end as assert_exact_legacy_task_constraints
from actual;

select 1 / case
  when to_regprocedure('public.nav_v2_add_task(uuid,text,text,public.nav_v2_user_role,public.nav_v2_task_priority,text)') is not null
   and to_regprocedure('public.nav_v2_update_task_status(uuid,public.nav_v2_task_status)') is not null
   and to_regprocedure('public.nav_v2_get_deal_card_lite(uuid)') is not null
  then 1 else 0
end as assert_legacy_rpc_signatures_exist;

select 1 / case
  when has_function_privilege(
         'authenticated',
         'public.nav_v2_add_task(uuid,text,text,public.nav_v2_user_role,public.nav_v2_task_priority,text)',
         'EXECUTE'
       )
   and has_function_privilege(
         'authenticated',
         'public.nav_v2_update_task_status(uuid,public.nav_v2_task_status)',
         'EXECUTE'
       )
  then 1 else 0
end as assert_attested_legacy_authenticated_grants;

select 1 / case
  when not exists (
         select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'nav_deal_tasks_v2'
           and column_name in (
             'task_contract_version','completion_criterion_code','evidence_kind',
             'evidence_reference_id','evidence_confirmed_at','gate_scope','outcome_code',
             'outcome_state','outcome_reason_code','outcome_review_date',
             'outcome_replacement_task_id','subject_kind','subject_reference_id',
             'outcome_proposed_by','outcome_proposed_at','outcome_decided_by','outcome_decided_at'
           )
       )
   and to_regclass('public.nav_deal_task_mutation_events_v2') is null
   and to_regprocedure('public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid)') is null
   and to_regprocedure('public.nav_v2_start_bounded_task(uuid,uuid)') is null
   and to_regprocedure('public.nav_v2_complete_bounded_task(uuid,uuid,uuid)') is null
   and to_regprocedure('public.nav_v2_set_bounded_task_active_outcome(uuid,text,text,date,uuid)') is null
   and to_regprocedure('public.nav_v2_propose_bounded_task_terminal_outcome(uuid,text,text,uuid,uuid)') is null
   and to_regprocedure('public.nav_v2_decide_bounded_task_terminal_outcome(uuid,text,uuid)') is null
   and to_regprocedure('public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid,uuid)') is null
   and to_regprocedure('public.nav_v2_start_bounded_task(uuid,uuid,uuid)') is null
   and to_regprocedure('public.nav_v2_complete_bounded_task(uuid,uuid,uuid,uuid)') is null
   and to_regprocedure('public.nav_v2_set_bounded_task_active_outcome(uuid,text,text,date,uuid,uuid)') is null
   and to_regprocedure('public.nav_v2_propose_bounded_task_terminal_outcome(uuid,text,text,uuid,uuid,uuid)') is null
   and to_regprocedure('public.nav_v2_decide_bounded_task_terminal_outcome(uuid,text,uuid,uuid)') is null
   and to_regprocedure('nav_v2_private.nav_v2_require_verified_actor(uuid)') is null
   and to_regprocedure('nav_v2_private.nav_v2_assert_actor_replay(uuid,text,uuid)') is null
   and to_regprocedure('nav_v2_private.nav_v2_actor_claim_restore(text)') is null
  then 1 else 0
end as assert_no_partial_bounded_deployment;

select
  current_setting('server_version') as postgres_version,
  (select count(*) from public.nav_deal_tasks_v2) as informational_task_count,
  (select count(*) from public.nav_deals_v2) as informational_deal_count,
  false as counts_are_strict_gate,
  true as structural_drift_is_stop;

select 'Navigator v2 bounded migration read-only preflight passed' as result;
