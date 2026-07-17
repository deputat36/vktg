-- Complete rollback of the repository-only bounded task base contract.
-- Run only after nav_v2_bounded_task_mutation_rollback.sql has removed mutation overlay objects.

\set ON_ERROR_STOP on

drop function if exists nav_v2_private.nav_v2_suggest_bounded_task_contract(
  text,
  public.nav_v2_user_role
);
drop function if exists nav_v2_private.nav_v2_task_contract_catalog();

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_bounded_task_type_check,
  drop constraint if exists nav_deal_tasks_v2_contract_version_check,
  drop constraint if exists nav_deal_tasks_v2_completion_code_check,
  drop constraint if exists nav_deal_tasks_v2_evidence_kind_check,
  drop constraint if exists nav_deal_tasks_v2_gate_scope_check,
  drop constraint if exists nav_deal_tasks_v2_outcome_code_check,
  drop constraint if exists nav_deal_tasks_v2_outcome_state_check,
  drop constraint if exists nav_deal_tasks_v2_outcome_pair_check,
  drop constraint if exists nav_deal_tasks_v2_replacement_check,
  drop constraint if exists nav_deal_tasks_v2_active_outcome_review_check,
  drop constraint if exists nav_deal_tasks_v2_done_evidence_check,
  drop constraint if exists nav_deal_tasks_v2_contract_completeness_check;

alter table public.nav_deal_tasks_v2
  drop column if exists outcome_replacement_task_id,
  drop column if exists outcome_review_date,
  drop column if exists outcome_reason_code,
  drop column if exists outcome_state,
  drop column if exists outcome_code,
  drop column if exists gate_scope,
  drop column if exists evidence_confirmed_at,
  drop column if exists evidence_reference_id,
  drop column if exists evidence_kind,
  drop column if exists completion_criterion_code,
  drop column if exists task_contract_version;

select 'PostgreSQL bounded task base rollback completed' as result;
