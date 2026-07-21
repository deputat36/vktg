-- Navigator v2 Performance Advisor read-only preflight v1.
-- Aggregate-only index, foreign-key and RLS evidence. No PII, DDL, DML or production mutation.
-- idx_scan = 0 is observation only and never authorizes index removal.

\set ON_ERROR_STOP on

begin transaction read only;

with scope_tables as (
  select
    c.oid,
    c.relname,
    c.relrowsecurity,
    c.reltuples::bigint as estimated_rows
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and (c.relname = 'nav_user_profiles' or c.relname ~ '^nav_.*_v2$')
),
fk_keys as (
  select con.conrelid, con.conname, con.conkey
  from pg_constraint con
  join scope_tables t on t.oid = con.conrelid
  where con.contype = 'f'
),
index_inventory as (
  select
    t.relname as table_name,
    i.relname as index_name,
    coalesce(s.idx_scan, 0)::bigint as idx_scan,
    pg_relation_size(i.oid)::bigint as index_bytes,
    t.estimated_rows,
    x.indisprimary as is_primary,
    x.indisunique as is_unique,
    exists (
      select 1
      from pg_constraint con
      where con.conindid = i.oid
    ) as constraint_backed,
    exists (
      select 1
      from fk_keys fk
      where fk.conrelid = t.oid
        and (x.indkey::smallint[])[0:cardinality(fk.conkey)-1] = fk.conkey
    ) as supports_foreign_key,
    pg_get_indexdef(i.oid) as definition
  from scope_tables t
  join pg_index x on x.indrelid = t.oid
  join pg_class i on i.oid = x.indexrelid
  left join pg_stat_user_indexes s on s.indexrelid = i.oid
),
zero_scan as (
  select
    table_name,
    index_name,
    index_bytes,
    estimated_rows,
    is_unique,
    supports_foreign_key,
    definition
  from index_inventory
  where idx_scan = 0
    and not is_primary
    and not constraint_backed
),
foreign_keys as (
  select
    t.relname as table_name,
    fk.conname as constraint_name,
    exists (
      select 1
      from pg_index ix
      where ix.indrelid = t.oid
        and ix.indisvalid
        and (ix.indkey::smallint[])[0:cardinality(fk.conkey)-1] = fk.conkey
    ) as covering_index_present
  from scope_tables t
  join fk_keys fk on fk.conrelid = t.oid
),
policy_summary as (
  select
    count(*)::int as policy_count,
    count(*) filter (
      where coalesce(qual, '') ~* '\(\s*SELECT\s+auth\.[a-z_]+\(\)'
         or coalesce(with_check, '') ~* '\(\s*SELECT\s+auth\.[a-z_]+\(\)'
    )::int as select_wrapped_auth_count,
    count(*) filter (
      where (coalesce(qual, '') ~* 'auth\.[a-z_]+\(' or coalesce(with_check, '') ~* 'auth\.[a-z_]+\(')
        and not (
          coalesce(qual, '') ~* '\(\s*SELECT\s+auth\.[a-z_]+\(\)'
          or coalesce(with_check, '') ~* '\(\s*SELECT\s+auth\.[a-z_]+\(\)'
        )
    )::int as direct_auth_call_count
  from pg_policies
  where schemaname = 'public'
    and (tablename = 'nav_user_profiles' or tablename ~ '^nav_.*_v2$')
)
select jsonb_build_object(
  'captured_at', clock_timestamp(),
  'project_ref_expected', 'ofewxuqfjhamgerwzull',
  'transaction_read_only', current_setting('transaction_read_only')::boolean,
  'aggregate_only', true,
  'idx_scan_zero_is_drop_approval', false,
  'database_stats_reset', (select stats_reset from pg_stat_database where datname = current_database()),
  'zero_scan_indexes', coalesce((select jsonb_agg(to_jsonb(zero_scan) order by table_name, index_name) from zero_scan), '[]'::jsonb),
  'summary', jsonb_build_object(
    'table_count', (select count(*) from scope_tables),
    'tables_without_rls', (select count(*) from scope_tables where not relrowsecurity),
    'index_count', (select count(*) from index_inventory),
    'zero_scan_count', (select count(*) from zero_scan),
    'zero_scan_fk_support_count', (select count(*) from zero_scan where supports_foreign_key),
    'zero_scan_non_fk_count', (select count(*) from zero_scan where not supports_foreign_key),
    'zero_scan_total_bytes', (select coalesce(sum(index_bytes), 0) from zero_scan),
    'foreign_key_count', (select count(*) from foreign_keys),
    'foreign_keys_without_covering_index', (select count(*) from foreign_keys where not covering_index_present),
    'policy_count', (select policy_count from policy_summary),
    'select_wrapped_auth_count', (select select_wrapped_auth_count from policy_summary),
    'direct_auth_call_count', (select direct_auth_call_count from policy_summary),
    'data_mutated', false,
    'ddl_executed', false
  )
) as navigator_v2_performance_readonly_preflight;

rollback;
