-- Navigator v2 production-scale FK benchmark read-only preflight v1.
-- Aggregate/catalog/statistics only. No business rows, PII, DML or DDL.
-- This is a template for a future explicitly authorized benchmark decision.

\set ON_ERROR_STOP on

begin transaction read only;

with target_tables as (
  select
    c.oid,
    n.nspname as schema_name,
    c.relname,
    c.reltuples::bigint as estimated_rows,
    pg_relation_size(c.oid) as heap_bytes,
    pg_total_relation_size(c.oid) as total_bytes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('nav_deals_v2', 'nav_deal_answers_v2')
), target_indexes as (
  select
    s.indexrelname,
    s.idx_scan,
    s.idx_tup_read,
    s.idx_tup_fetch,
    pg_relation_size(s.indexrelid) as size_bytes,
    i.indexdef
  from pg_stat_user_indexes s
  join pg_indexes i
    on i.schemaname = s.schemaname
   and i.tablename = s.relname
   and i.indexname = s.indexrelname
  where s.schemaname = 'public'
    and s.relname = 'nav_deal_answers_v2'
    and s.indexrelname in (
      'nav_deal_answers_v2_deal_idx',
      'nav_deal_answers_v2_deal_id_question_key_key'
    )
), table_stats as (
  select
    relname,
    seq_scan,
    idx_scan,
    n_tup_ins,
    n_tup_upd,
    n_tup_del,
    n_live_tup,
    n_dead_tup,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
  from pg_stat_user_tables
  where schemaname = 'public'
    and relname in ('nav_deals_v2', 'nav_deal_answers_v2')
), fk_contract as (
  select
    con.conname,
    pg_get_constraintdef(con.oid, true) as definition,
    con.confupdtype,
    con.confdeltype,
    con.convalidated,
    con.condeferrable,
    con.condeferred
  from pg_constraint con
  where con.conrelid = 'public.nav_deal_answers_v2'::regclass
    and con.conname = 'nav_deal_answers_v2_deal_id_fkey'
), database_stats as (
  select stats_reset
  from pg_stat_database
  where datname = current_database()
), settings as (
  select jsonb_object_agg(name, setting order by name) as values
  from pg_settings
  where name in (
    'server_version',
    'max_connections',
    'shared_buffers',
    'effective_cache_size',
    'work_mem',
    'maintenance_work_mem',
    'wal_level',
    'max_wal_size',
    'checkpoint_timeout',
    'random_page_cost',
    'effective_io_concurrency',
    'deadlock_timeout',
    'lock_timeout',
    'statement_timeout'
  )
)
select jsonb_pretty(jsonb_build_object(
  'schema_version', 1,
  'status', 'readonly_preflight_only_benchmark_execution_not_authorized',
  'captured_at', clock_timestamp(),
  'database', current_database(),
  'server_version', current_setting('server_version'),
  'tables', (
    select jsonb_agg(
      jsonb_build_object(
        'name', t.schema_name || '.' || t.relname,
        'estimated_rows', t.estimated_rows,
        'heap_bytes', t.heap_bytes,
        'total_bytes', t.total_bytes,
        'statistics', to_jsonb(s) - 'relname'
      ) order by t.relname
    )
    from target_tables t
    left join table_stats s using (relname)
  ),
  'indexes', (
    select jsonb_agg(to_jsonb(i) order by indexrelname)
    from target_indexes i
  ),
  'foreign_key', (
    select to_jsonb(f)
    from fk_contract f
  ),
  'database_stats_reset', (select stats_reset from database_stats),
  'settings', (select values from settings),
  'exact_business_row_counts_returned', false,
  'business_rows_returned', false,
  'pii_returned', false,
  'data_mutated', false,
  'ddl_executed', false,
  'benchmark_executed', false
)) as benchmark_readonly_preflight;

rollback;
