-- Navigator v2 Advisor read-only preflight v1.
-- Aggregate-only evidence. No PII, DDL, DML, grants, Auth mutation, branch creation or Edge deployment.
-- This query proves current scope only and is not execution approval.

\set ON_ERROR_STOP on

begin transaction read only;

with advisor_scope as (
  select
    count(*)::int as observed_count,
    coalesce(jsonb_agg(p.proname order by p.proname), '[]'::jsonb) as functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like 'nav_v2\_%' escape '\'
    and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
),
migration_boundary as (
  select
    max(version) as latest_remote_version,
    max(version) filter (where name ~ '^(nav_v2_|navigator_)') as latest_navigator_version,
    (array_agg(name order by version desc))[1] as latest_remote_name,
    (array_agg(name order by version desc) filter (where name ~ '^(nav_v2_|navigator_)'))[1] as latest_navigator_name
  from supabase_migrations.schema_migrations
),
candidate_objects as (
  select jsonb_build_object(
    'task_contract_version_column', exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'nav_deal_tasks_v2'
        and column_name = 'task_contract_version'
    ),
    'mutation_events_table', to_regclass('public.nav_deal_task_mutation_events_v2') is not null,
    'bounded_create_rpc', to_regprocedure('public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid,uuid)') is not null,
    'intake_ledger', to_regclass('nav_v2_private.nav_v2_intake_save_requests_v1') is not null,
    'intake_mapper', to_regprocedure('nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb)') is not null
  ) as value
),
technical_identities as (
  select jsonb_build_object(
    'auth_users', (select count(*)::int from auth.users where lower(coalesce(email, '')) like 'nav-e2e%'),
    'profiles', (select count(*)::int from public.nav_user_profiles where lower(coalesce(full_name, '')) like '[nav e2e]%')
  ) as value
)
select jsonb_build_object(
  'captured_at', clock_timestamp(),
  'project_ref_expected', 'ofewxuqfjhamgerwzull',
  'advisor_lint_name', 'authenticated_security_definer_function_executable',
  'advisor_lint_code', '0029',
  'transaction_read_only', current_setting('transaction_read_only')::boolean,
  'aggregate_only', true,
  'data_mutated', false,
  'ddl_executed', false,
  'advisor_scope', (select to_jsonb(advisor_scope) from advisor_scope),
  'migration_boundary', (select to_jsonb(migration_boundary) from migration_boundary),
  'candidate_objects', (select value from candidate_objects),
  'technical_identities', (select value from technical_identities)
) as navigator_v2_advisor_readonly_preflight;

rollback;
