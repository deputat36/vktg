-- Navigator v2 preview read-only preflight v1.
-- Aggregate-only evidence. No DDL, DML, Auth mutation, grants, branch creation or Edge deployment.
-- This snapshot query is not execution approval and must be rerun immediately before any gated cloud action.

\set ON_ERROR_STOP on

begin transaction read only;

with migration_bounds as (
  select
    max(version) as latest_remote_migration,
    max(version) filter (where name ~* '^(nav|navigator)') as latest_navigator_migration
  from supabase_migrations.schema_migrations
),
candidate_columns as (
  select count(*)::int as present_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'nav_deal_tasks_v2'
    and column_name in (
      'task_contract_version',
      'completion_criterion_code',
      'evidence_kind',
      'evidence_reference_id',
      'gate_scope',
      'outcome_code',
      'outcome_state'
    )
),
technical_auth_users as (
  select count(*)::int as count_value
  from auth.users
  where lower(coalesce(email, '')) like 'nav-e2e%'
),
technical_profiles as (
  select count(*)::int as count_value
  from public.nav_user_profiles
  where lower(coalesce(full_name, '')) like '[nav e2e]%'
),
task_statuses as (
  select jsonb_object_agg(status::text, count_value order by status::text) as counts
  from (
    select status, count(*)::int as count_value
    from public.nav_deal_tasks_v2
    group by status
  ) grouped_statuses
)
select jsonb_build_object(
  'project_ref_expected', 'ofewxuqfjhamgerwzull',
  'postgres_version', current_setting('server_version'),
  'latest_remote_migration', migration_bounds.latest_remote_migration,
  'latest_navigator_migration', migration_bounds.latest_navigator_migration,
  'expected_latest_navigator_migration', '20260716063401',
  'navigator_boundary_matches', migration_bounds.latest_navigator_migration = '20260716063401',
  'task_candidate_columns_present', candidate_columns.present_count,
  'mutation_event_table_present', to_regclass('public.nav_deal_task_mutation_events_v2') is not null,
  'intake_ledger_present', to_regclass('nav_v2_private.nav_v2_intake_save_requests_v1') is not null,
  'actor_create_rpc_present', to_regprocedure('public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid,uuid)') is not null,
  'actor_start_rpc_present', to_regprocedure('public.nav_v2_start_bounded_task(uuid,uuid,uuid)') is not null,
  'technical_auth_users', technical_auth_users.count_value,
  'technical_profiles', technical_profiles.count_value,
  'task_status_counts', task_statuses.counts,
  'aggregate_only', true,
  'data_mutated', false
) as navigator_preview_readonly_preflight
from migration_bounds
cross join candidate_columns
cross join technical_auth_users
cross join technical_profiles
cross join task_statuses;

rollback;
