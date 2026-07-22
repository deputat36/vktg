\set ON_ERROR_STOP on

begin transaction read only;

with database_stats as (
  select
    d.oid as database_oid,
    d.datname,
    s.stats_reset,
    s.xact_commit,
    s.xact_rollback,
    s.blks_read,
    s.blks_hit,
    s.tup_returned,
    s.tup_fetched,
    s.tup_inserted,
    s.tup_updated,
    s.tup_deleted,
    s.temp_files,
    s.temp_bytes,
    s.deadlocks
  from pg_database d
  join pg_stat_database s on s.datid = d.oid
  where d.datname = current_database()
),
table_stats as (
  select
    c.oid as table_oid,
    n.nspname as schema_name,
    c.relname as table_name,
    s.seq_scan,
    s.seq_tup_read,
    s.idx_scan,
    s.idx_tup_fetch,
    s.n_tup_ins,
    s.n_tup_upd,
    s.n_tup_del,
    s.n_tup_hot_upd,
    s.n_live_tup,
    s.n_dead_tup,
    s.last_vacuum,
    s.last_autovacuum,
    s.last_analyze,
    s.last_autoanalyze,
    pg_relation_size(c.oid) as heap_bytes,
    pg_total_relation_size(c.oid) as total_bytes
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_all_tables s on s.relid = c.oid
  where n.nspname = 'public'
    and c.relname = 'nav_deal_answers_v2'
),
index_stats as (
  select jsonb_agg(
    jsonb_build_object(
      'index_oid', ic.oid,
      'index_name', ic.relname,
      'definition', pg_get_indexdef(ic.oid),
      'is_unique', i.indisunique,
      'is_valid', i.indisvalid,
      'is_ready', i.indisready,
      'idx_scan', coalesce(s.idx_scan, 0),
      'idx_tup_read', coalesce(s.idx_tup_read, 0),
      'idx_tup_fetch', coalesce(s.idx_tup_fetch, 0),
      'size_bytes', pg_relation_size(ic.oid)
    ) order by ic.relname
  ) as value
  from pg_index i
  join pg_class tc on tc.oid = i.indrelid
  join pg_namespace n on n.oid = tc.relnamespace
  join pg_class ic on ic.oid = i.indexrelid
  left join pg_stat_all_indexes s on s.indexrelid = ic.oid
  where n.nspname = 'public'
    and tc.relname = 'nav_deal_answers_v2'
    and ic.relname in (
      'nav_deal_answers_v2_deal_idx',
      'nav_deal_answers_v2_deal_id_question_key_key'
    )
),
wal_stats as (
  select
    wal_records,
    wal_fpi,
    wal_bytes,
    wal_buffers_full,
    wal_write,
    wal_sync,
    stats_reset
  from pg_stat_wal
),
extension_state as (
  select jsonb_build_object(
    'pg_stat_statements_installed', exists(
      select 1
      from pg_extension
      where extname = 'pg_stat_statements'
    ),
    'pg_stat_statements_version', (
      select extversion
      from pg_extension
      where extname = 'pg_stat_statements'
    ),
    'query_text_or_user_data_captured', false
  ) as value
)
select jsonb_build_object(
  'captured_at', clock_timestamp(),
  'capture_mode', 'aggregate_catalog_statistics_only_read_only_transaction',
  'transaction_read_only', current_setting('transaction_read_only')::boolean,
  'server_version_num', current_setting('server_version_num')::integer,
  'postmaster_started_at', pg_postmaster_start_time(),
  'track_counts', current_setting('track_counts')::boolean,
  'track_io_timing', current_setting('track_io_timing')::boolean,
  'database', (select to_jsonb(database_stats) from database_stats),
  'wal', (select to_jsonb(wal_stats) from wal_stats),
  'table', (select to_jsonb(table_stats) from table_stats),
  'indexes', (select value from index_stats),
  'extensions', (select value from extension_state),
  'business_rows_returned', false,
  'pii_returned', false,
  'data_mutated', false,
  'ddl_executed', false,
  'statistics_reset_performed', false
) as observation_capture;

rollback;
