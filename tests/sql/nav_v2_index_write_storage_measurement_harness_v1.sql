-- Navigator v2 synthetic write-amplification and storage measurement harness v1.
-- Isolated PostgreSQL 17 only. It never reads or changes production schema/data.
-- CI WAL, buffer, size and timing values are diagnostic and are not production estimates.

\set ON_ERROR_STOP on

begin;

create schema harness;

create or replace function harness.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception 'Assertion failed: %', p_message;
  end if;
end;
$function$;

create or replace function harness.explain_write_json(p_sql text)
returns jsonb
language plpgsql
as $function$
declare
  v_plan jsonb;
begin
  execute 'explain (analyze true, buffers true, wal true, timing false, summary true, format json) ' || p_sql
    into v_plan;
  return v_plan;
end;
$function$;

create or replace function harness.sum_json_metric(p_plan jsonb, p_path jsonpath)
returns numeric
language sql
immutable
as $function$
  select coalesce(sum((metric #>> '{}')::numeric), 0)
  from jsonb_path_query(p_plan, p_path) as metrics(metric);
$function$;

create table harness.parent_deals (
  id bigint primary key
);

insert into harness.parent_deals (id)
select g
from generate_series(1, 6000) as series(g);

create table harness.answers_both (
  id bigserial primary key,
  deal_id bigint not null,
  question_key text not null,
  answer_value text not null,
  constraint answers_both_deal_fkey
    foreign key (deal_id)
    references harness.parent_deals(id)
    on update no action
    on delete cascade,
  constraint answers_both_deal_question_key_key
    unique (deal_id, question_key)
);

create index answers_both_deal_idx
  on harness.answers_both (deal_id);

create table harness.answers_composite_only (
  id bigserial primary key,
  deal_id bigint not null,
  question_key text not null,
  answer_value text not null,
  constraint answers_composite_deal_fkey
    foreign key (deal_id)
    references harness.parent_deals(id)
    on update no action
    on delete cascade,
  constraint answers_composite_deal_question_key_key
    unique (deal_id, question_key)
);

create table harness.write_evidence (
  case_order integer primary key,
  case_id text not null unique,
  comparison_mode text not null,
  operation text not null,
  plan jsonb not null,
  wal_records numeric not null,
  wal_fpi numeric not null,
  wal_bytes numeric not null,
  shared_hit_blocks numeric not null,
  shared_read_blocks numeric not null,
  shared_dirtied_blocks numeric not null,
  shared_written_blocks numeric not null,
  execution_time_ms numeric,
  row_count_after bigint not null,
  note text not null
);

create table harness.storage_evidence (
  stage_order integer primary key,
  stage_id text not null unique,
  comparison_mode text not null,
  stage text not null,
  heap_bytes bigint not null,
  total_relation_bytes bigint not null,
  single_index_bytes bigint not null,
  composite_index_bytes bigint not null,
  total_candidate_index_bytes bigint not null,
  note text not null
);

create or replace function harness.capture_write(
  p_order integer,
  p_case_id text,
  p_mode text,
  p_operation text,
  p_table regclass,
  p_sql text,
  p_note text
)
returns void
language plpgsql
as $function$
declare
  v_plan jsonb;
  v_row_count bigint;
begin
  v_plan := harness.explain_write_json(p_sql);
  execute format('select count(*) from %s', p_table) into v_row_count;

  insert into harness.write_evidence (
    case_order,
    case_id,
    comparison_mode,
    operation,
    plan,
    wal_records,
    wal_fpi,
    wal_bytes,
    shared_hit_blocks,
    shared_read_blocks,
    shared_dirtied_blocks,
    shared_written_blocks,
    execution_time_ms,
    row_count_after,
    note
  ) values (
    p_order,
    p_case_id,
    p_mode,
    p_operation,
    v_plan,
    harness.sum_json_metric(v_plan, '$.**."WAL Records"'::jsonpath),
    harness.sum_json_metric(v_plan, '$.**."WAL FPI"'::jsonpath),
    harness.sum_json_metric(v_plan, '$.**."WAL Bytes"'::jsonpath),
    harness.sum_json_metric(v_plan, '$.**."Shared Hit Blocks"'::jsonpath),
    harness.sum_json_metric(v_plan, '$.**."Shared Read Blocks"'::jsonpath),
    harness.sum_json_metric(v_plan, '$.**."Shared Dirtied Blocks"'::jsonpath),
    harness.sum_json_metric(v_plan, '$.**."Shared Written Blocks"'::jsonpath),
    nullif(v_plan #>> '{0,Execution Time}', '')::numeric,
    v_row_count,
    p_note
  );
end;
$function$;

create or replace function harness.capture_storage(
  p_order integer,
  p_stage_id text,
  p_mode text,
  p_stage text,
  p_table regclass,
  p_single_index_name text,
  p_composite_index_name text,
  p_note text
)
returns void
language plpgsql
as $function$
declare
  v_single regclass;
  v_composite regclass;
  v_single_bytes bigint := 0;
  v_composite_bytes bigint := 0;
begin
  v_single := case when p_single_index_name is null then null else to_regclass(p_single_index_name) end;
  v_composite := to_regclass(p_composite_index_name);

  if v_single is not null then
    v_single_bytes := pg_relation_size(v_single);
  end if;

  if v_composite is not null then
    v_composite_bytes := pg_relation_size(v_composite);
  end if;

  insert into harness.storage_evidence (
    stage_order,
    stage_id,
    comparison_mode,
    stage,
    heap_bytes,
    total_relation_bytes,
    single_index_bytes,
    composite_index_bytes,
    total_candidate_index_bytes,
    note
  ) values (
    p_order,
    p_stage_id,
    p_mode,
    p_stage,
    pg_relation_size(p_table),
    pg_total_relation_size(p_table),
    v_single_bytes,
    v_composite_bytes,
    v_single_bytes + v_composite_bytes,
    p_note
  );
end;
$function$;

-- Insert 100,000 identical synthetic answers into each comparison mode.
select harness.capture_write(
  1,
  'insert_100k_both_indexes',
  'single_and_composite_indexes',
  'insert',
  'harness.answers_both'::regclass,
  $sql$
    insert into harness.answers_both (deal_id, question_key, answer_value)
    select
      deal_id,
      format('question_%s', question_no),
      repeat('x', 64)
    from generate_series(1, 5000) as deals(deal_id)
    cross join generate_series(1, 20) as questions(question_no)
  $sql$,
  'Logged INSERT with the single-column and composite unique indexes.'
);

select harness.capture_write(
  2,
  'insert_100k_composite_only',
  'composite_unique_index_only',
  'insert',
  'harness.answers_composite_only'::regclass,
  $sql$
    insert into harness.answers_composite_only (deal_id, question_key, answer_value)
    select
      deal_id,
      format('question_%s', question_no),
      repeat('x', 64)
    from generate_series(1, 5000) as deals(deal_id)
    cross join generate_series(1, 20) as questions(question_no)
  $sql$,
  'Logged INSERT with only the composite unique deal_id-leading index.'
);

analyze harness.answers_both;
analyze harness.answers_composite_only;

select harness.capture_storage(
  1,
  'after_insert_both_indexes',
  'single_and_composite_indexes',
  'after_insert',
  'harness.answers_both'::regclass,
  'harness.answers_both_deal_idx',
  'harness.answers_both_deal_question_key_key',
  'Synthetic relation sizes after 100,000 inserts.'
);

select harness.capture_storage(
  2,
  'after_insert_composite_only',
  'composite_unique_index_only',
  'after_insert',
  'harness.answers_composite_only'::regclass,
  null,
  'harness.answers_composite_deal_question_key_key',
  'Synthetic relation sizes after 100,000 inserts.'
);

-- Update 10,000 rows through the indexed deal_id column in each mode.
select harness.capture_write(
  3,
  'update_10k_deal_id_both_indexes',
  'single_and_composite_indexes',
  'indexed_update',
  'harness.answers_both'::regclass,
  'update harness.answers_both set deal_id = deal_id + 5500 where deal_id between 1 and 500',
  'Indexed deal_id UPDATE maintains both candidate indexes and checks the FK.'
);

select harness.capture_write(
  4,
  'update_10k_deal_id_composite_only',
  'composite_unique_index_only',
  'indexed_update',
  'harness.answers_composite_only'::regclass,
  'update harness.answers_composite_only set deal_id = deal_id + 5500 where deal_id between 1 and 500',
  'Indexed deal_id UPDATE maintains only the composite unique candidate and checks the FK.'
);

select harness.capture_storage(
  3,
  'after_update_both_indexes',
  'single_and_composite_indexes',
  'after_indexed_update',
  'harness.answers_both'::regclass,
  'harness.answers_both_deal_idx',
  'harness.answers_both_deal_question_key_key',
  'Synthetic relation sizes after updating 10,000 indexed deal_id values.'
);

select harness.capture_storage(
  4,
  'after_update_composite_only',
  'composite_unique_index_only',
  'after_indexed_update',
  'harness.answers_composite_only'::regclass,
  null,
  'harness.answers_composite_deal_question_key_key',
  'Synthetic relation sizes after updating 10,000 indexed deal_id values.'
);

-- Delete the same 10,000 updated rows from each mode.
select harness.capture_write(
  5,
  'delete_10k_both_indexes',
  'single_and_composite_indexes',
  'delete',
  'harness.answers_both'::regclass,
  'delete from harness.answers_both where deal_id between 5501 and 6000',
  'DELETE maintains the single-column and composite unique indexes.'
);

select harness.capture_write(
  6,
  'delete_10k_composite_only',
  'composite_unique_index_only',
  'delete',
  'harness.answers_composite_only'::regclass,
  'delete from harness.answers_composite_only where deal_id between 5501 and 6000',
  'DELETE maintains only the composite unique candidate index.'
);

select harness.capture_storage(
  5,
  'final_both_indexes',
  'single_and_composite_indexes',
  'after_delete',
  'harness.answers_both'::regclass,
  'harness.answers_both_deal_idx',
  'harness.answers_both_deal_question_key_key',
  'Final synthetic relation sizes before rollback.'
);

select harness.capture_storage(
  6,
  'final_composite_only',
  'composite_unique_index_only',
  'after_delete',
  'harness.answers_composite_only'::regclass,
  null,
  'harness.answers_composite_deal_question_key_key',
  'Final synthetic relation sizes before rollback.'
);

-- Fail closed on workload shape and result equivalence, not on performance ratios.
select harness.assert_true(
  (select count(*) = 6 from harness.write_evidence),
  'write evidence case count drifted'
);
select harness.assert_true(
  (select count(*) = 6 from harness.storage_evidence),
  'storage evidence stage count drifted'
);
select harness.assert_true(
  (select bool_and(wal_records > 0 and wal_bytes > 0) from harness.write_evidence),
  'one or more logged writes did not expose WAL evidence'
);
select harness.assert_true(
  (select row_count_after = 100000 from harness.write_evidence where case_id = 'insert_100k_both_indexes')
  and (select row_count_after = 100000 from harness.write_evidence where case_id = 'insert_100k_composite_only'),
  'insert row counts differ from the 100,000-row contract'
);
select harness.assert_true(
  (select row_count_after = 100000 from harness.write_evidence where case_id = 'update_10k_deal_id_both_indexes')
  and (select row_count_after = 100000 from harness.write_evidence where case_id = 'update_10k_deal_id_composite_only'),
  'indexed update changed table cardinality'
);
select harness.assert_true(
  (select row_count_after = 90000 from harness.write_evidence where case_id = 'delete_10k_both_indexes')
  and (select row_count_after = 90000 from harness.write_evidence where case_id = 'delete_10k_composite_only'),
  'delete row counts differ from the 90,000-row final contract'
);
select harness.assert_true(
  (select total_candidate_index_bytes from harness.storage_evidence where stage_id = 'after_insert_both_indexes')
    > (select total_candidate_index_bytes from harness.storage_evidence where stage_id = 'after_insert_composite_only'),
  'extra single-column index did not increase synthetic candidate index storage after insert'
);
select harness.assert_true(
  (select single_index_bytes > 0 from harness.storage_evidence where stage_id = 'final_both_indexes')
  and (select single_index_bytes = 0 from harness.storage_evidence where stage_id = 'final_composite_only'),
  'single-index presence does not match comparison modes'
);
select harness.assert_true(
  (select md5(string_agg(md5(deal_id::text || ':' || question_key || ':' || answer_value), '' order by deal_id, question_key)) from harness.answers_both)
    =
  (select md5(string_agg(md5(deal_id::text || ':' || question_key || ':' || answer_value), '' order by deal_id, question_key)) from harness.answers_composite_only),
  'final synthetic result hashes differ between index modes'
);
select harness.assert_true(
  not exists (select 1 from harness.answers_both where deal_id between 1 and 500 or deal_id between 5501 and 6000)
  and not exists (select 1 from harness.answers_composite_only where deal_id between 1 and 500 or deal_id between 5501 and 6000),
  'updated/deleted deal_id ranges survived unexpectedly'
);

select jsonb_pretty(jsonb_build_object(
  'schema_version', 1,
  'status', 'repository_only_synthetic_write_storage_measurement_not_ddl_approval',
  'postgres_version', current_setting('server_version'),
  'production_schema_used', false,
  'production_data_copied', false,
  'production_ddl_authorized', false,
  'comparison_modes', jsonb_build_array('single_and_composite_indexes', 'composite_unique_index_only'),
  'workload', jsonb_build_object(
    'insert_rows_per_mode', 100000,
    'indexed_update_rows_per_mode', 10000,
    'delete_rows_per_mode', 10000,
    'final_rows_per_mode', 90000
  ),
  'write_evidence', (select jsonb_agg(to_jsonb(w) order by case_order) from harness.write_evidence w),
  'storage_evidence', (select jsonb_agg(to_jsonb(s) order by stage_order) from harness.storage_evidence s),
  'policy', jsonb_build_object(
    'latency_superiority_asserted', false,
    'production_write_savings_proven', false,
    'production_storage_savings_proven', false,
    'automatic_ddl_decision', false
  ),
  'decision', 'synthetic_write_storage_measurement_completed_production_drop_not_ready'
)) as synthetic_write_storage_evidence;

rollback;

do $post_rollback$
begin
  if to_regnamespace('harness') is not null then
    raise exception 'synthetic write/storage harness schema survived rollback';
  end if;
end;
$post_rollback$;

select 'Navigator v2 synthetic index write/storage measurement passed with full rollback' as result;
