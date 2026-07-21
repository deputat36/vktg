-- Navigator v2 synthetic foreign-key parent mutation benchmark v1.
-- Isolated PostgreSQL 17 only. No production schema, data, credentials or DDL.
-- Timing is captured as diagnostic evidence and is never asserted as production performance.

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

create or replace function harness.explain_analyze_json(p_sql text)
returns jsonb
language plpgsql
as $function$
declare
  v_plan jsonb;
begin
  execute 'explain (analyze true, buffers true, wal true, format json) ' || p_sql into v_plan;
  return v_plan;
end;
$function$;

create or replace function harness.xact_index_scans(p_index_name text)
returns bigint
language sql
stable
as $function$
  select coalesce((
    select idx_scan
    from pg_stat_xact_user_indexes
    where schemaname = 'harness'
      and indexrelname = p_index_name
  ), 0)::bigint;
$function$;

create table harness.nav_deals_v2 (
  id bigint primary key,
  marker text not null default 'synthetic'
);

create table harness.nav_deal_answers_v2 (
  id bigserial primary key,
  deal_id bigint not null,
  question_key text not null,
  answer_value text,
  constraint nav_deal_answers_v2_deal_id_fkey
    foreign key (deal_id)
    references harness.nav_deals_v2(id)
    on delete cascade,
  constraint nav_deal_answers_v2_deal_id_question_key_key
    unique (deal_id, question_key)
);

create index nav_deal_answers_v2_deal_idx
  on harness.nav_deal_answers_v2 (deal_id);

insert into harness.nav_deals_v2 (id)
select g from generate_series(1, 5002) as series(g);

insert into harness.nav_deal_answers_v2 (deal_id, question_key, answer_value)
select
  deal_id,
  format('question_%s', question_no),
  format('synthetic_%s_%s', deal_id, question_no)
from generate_series(1, 5000) as deals(deal_id)
cross join generate_series(1, 20) as questions(question_no);

analyze harness.nav_deals_v2;
analyze harness.nav_deal_answers_v2;

create table harness.index_size_evidence (
  evidence_id text primary key,
  relation_bytes bigint not null,
  note text not null
);

insert into harness.index_size_evidence (evidence_id, relation_bytes, note)
values
  (
    'single_deal_id_index_before_drop',
    pg_relation_size('harness.nav_deal_answers_v2_deal_idx'::regclass),
    'Synthetic size only; not a production storage estimate.'
  ),
  (
    'composite_unique_index',
    pg_relation_size('harness.nav_deal_answers_v2_deal_id_question_key_key'::regclass),
    'Composite unique index retained in both benchmark modes.'
  );

create table harness.mutation_evidence (
  evidence_order integer primary key,
  case_id text not null unique,
  comparison_mode text not null,
  operation text not null,
  plan jsonb,
  success boolean not null,
  foreign_key_blocked boolean not null,
  single_index_present boolean not null,
  single_scan_before bigint not null,
  single_scan_after bigint not null,
  single_scan_delta bigint not null,
  composite_scan_before bigint not null,
  composite_scan_after bigint not null,
  composite_scan_delta bigint not null,
  deal_count_before bigint not null,
  deal_count_after bigint not null,
  answer_count_before bigint not null,
  answer_count_after bigint not null,
  affected_children bigint not null,
  elapsed_ms numeric,
  sqlstate text,
  note text not null
);

create or replace function harness.run_explained_mutation(
  p_order integer,
  p_case_id text,
  p_mode text,
  p_operation text,
  p_sql text,
  p_note text
)
returns void
language plpgsql
as $function$
declare
  v_plan jsonb;
  v_single_before bigint;
  v_single_after bigint;
  v_composite_before bigint;
  v_composite_after bigint;
  v_deals_before bigint;
  v_deals_after bigint;
  v_answers_before bigint;
  v_answers_after bigint;
begin
  v_single_before := harness.xact_index_scans('nav_deal_answers_v2_deal_idx');
  v_composite_before := harness.xact_index_scans('nav_deal_answers_v2_deal_id_question_key_key');
  select count(*) into v_deals_before from harness.nav_deals_v2;
  select count(*) into v_answers_before from harness.nav_deal_answers_v2;

  v_plan := harness.explain_analyze_json(p_sql);

  v_single_after := harness.xact_index_scans('nav_deal_answers_v2_deal_idx');
  v_composite_after := harness.xact_index_scans('nav_deal_answers_v2_deal_id_question_key_key');
  select count(*) into v_deals_after from harness.nav_deals_v2;
  select count(*) into v_answers_after from harness.nav_deal_answers_v2;

  insert into harness.mutation_evidence (
    evidence_order, case_id, comparison_mode, operation, plan,
    success, foreign_key_blocked, single_index_present,
    single_scan_before, single_scan_after, single_scan_delta,
    composite_scan_before, composite_scan_after, composite_scan_delta,
    deal_count_before, deal_count_after, answer_count_before, answer_count_after,
    affected_children, elapsed_ms, sqlstate, note
  ) values (
    p_order, p_case_id, p_mode, p_operation, v_plan,
    true, false, to_regclass('harness.nav_deal_answers_v2_deal_idx') is not null,
    v_single_before, v_single_after, v_single_after - v_single_before,
    v_composite_before, v_composite_after, v_composite_after - v_composite_before,
    v_deals_before, v_deals_after, v_answers_before, v_answers_after,
    v_answers_before - v_answers_after,
    nullif(v_plan #>> '{0,Execution Time}', '')::numeric,
    null,
    p_note
  );
end;
$function$;

create or replace function harness.run_blocked_parent_update(
  p_order integer,
  p_case_id text,
  p_mode text,
  p_old_id bigint,
  p_new_id bigint,
  p_note text
)
returns void
language plpgsql
as $function$
declare
  v_started timestamptz := clock_timestamp();
  v_blocked boolean := false;
  v_state text := null;
  v_single_before bigint;
  v_single_after bigint;
  v_composite_before bigint;
  v_composite_after bigint;
  v_deals_before bigint;
  v_deals_after bigint;
  v_answers_before bigint;
  v_answers_after bigint;
begin
  v_single_before := harness.xact_index_scans('nav_deal_answers_v2_deal_idx');
  v_composite_before := harness.xact_index_scans('nav_deal_answers_v2_deal_id_question_key_key');
  select count(*) into v_deals_before from harness.nav_deals_v2;
  select count(*) into v_answers_before from harness.nav_deal_answers_v2;

  begin
    update harness.nav_deals_v2 set id = p_new_id where id = p_old_id;
  exception
    when foreign_key_violation then
      v_blocked := true;
      get stacked diagnostics v_state = returned_sqlstate;
  end;

  v_single_after := harness.xact_index_scans('nav_deal_answers_v2_deal_idx');
  v_composite_after := harness.xact_index_scans('nav_deal_answers_v2_deal_id_question_key_key');
  select count(*) into v_deals_after from harness.nav_deals_v2;
  select count(*) into v_answers_after from harness.nav_deal_answers_v2;

  insert into harness.mutation_evidence (
    evidence_order, case_id, comparison_mode, operation, plan,
    success, foreign_key_blocked, single_index_present,
    single_scan_before, single_scan_after, single_scan_delta,
    composite_scan_before, composite_scan_after, composite_scan_delta,
    deal_count_before, deal_count_after, answer_count_before, answer_count_after,
    affected_children, elapsed_ms, sqlstate, note
  ) values (
    p_order, p_case_id, p_mode, 'parent_update_referenced', null,
    not v_blocked, v_blocked, to_regclass('harness.nav_deal_answers_v2_deal_idx') is not null,
    v_single_before, v_single_after, greatest(v_single_after - v_single_before, 0),
    v_composite_before, v_composite_after, greatest(v_composite_after - v_composite_before, 0),
    v_deals_before, v_deals_after, v_answers_before, v_answers_after,
    0,
    extract(epoch from (clock_timestamp() - v_started)) * 1000,
    v_state,
    p_note
  );
end;
$function$;

-- Mode A: both the single-column and composite unique indexes exist.
select harness.run_explained_mutation(
  1,
  'delete_cascade_with_both_indexes',
  'single_and_composite_indexes',
  'parent_delete_cascade',
  'delete from harness.nav_deals_v2 where id = 4000',
  'Referenced parent delete with ON DELETE CASCADE while both child indexes exist.'
);

select harness.run_explained_mutation(
  2,
  'update_unreferenced_with_both_indexes',
  'single_and_composite_indexes',
  'parent_update_unreferenced',
  'update harness.nav_deals_v2 set id = 6001 where id = 5001',
  'Parent key update with no child rows while both child indexes exist.'
);

select harness.run_blocked_parent_update(
  3,
  'update_referenced_blocked_with_both_indexes',
  'single_and_composite_indexes',
  4001,
  7001,
  'ON UPDATE NO ACTION must reject a referenced parent key change.'
);

select harness.assert_true(
  (select affected_children = 20 from harness.mutation_evidence where case_id = 'delete_cascade_with_both_indexes'),
  'both-index cascade delete did not remove exactly 20 answer rows'
);
select harness.assert_true(
  (select single_scan_delta + composite_scan_delta > 0 from harness.mutation_evidence where case_id = 'delete_cascade_with_both_indexes'),
  'both-index cascade delete did not attribute a child index scan'
);
select harness.assert_true(
  (select success and not foreign_key_blocked from harness.mutation_evidence where case_id = 'update_unreferenced_with_both_indexes'),
  'both-index unreferenced parent update failed'
);
select harness.assert_true(
  (select foreign_key_blocked and sqlstate = '23503' from harness.mutation_evidence where case_id = 'update_referenced_blocked_with_both_indexes'),
  'both-index referenced parent update was not blocked by the FK'
);

-- Remove only the synthetic single-column index. The composite unique index remains.
drop index harness.nav_deal_answers_v2_deal_idx;
analyze harness.nav_deal_answers_v2;

select harness.assert_true(
  to_regclass('harness.nav_deal_answers_v2_deal_idx') is null,
  'synthetic single-column index survived removal'
);
select harness.assert_true(
  to_regclass('harness.nav_deal_answers_v2_deal_id_question_key_key') is not null,
  'composite unique index is missing before composite-only cases'
);

create table harness.plan_evidence (
  evidence_id text primary key,
  plan jsonb not null,
  composite_index_observed boolean not null,
  note text not null
);

set local enable_seqscan = off;

insert into harness.plan_evidence (evidence_id, plan, composite_index_observed, note)
select
  'composite_only_child_lookup',
  plan,
  plan::text like '%nav_deal_answers_v2_deal_id_question_key_key%',
  'Structural child lookup by deal_id after synthetic removal of the single-column index.'
from (
  select harness.explain_analyze_json(
    'select 1 from harness.nav_deal_answers_v2 where deal_id = 4500 limit 1'
  ) as plan
) captured;

set local enable_seqscan = on;

select harness.assert_true(
  (select composite_index_observed from harness.plan_evidence where evidence_id = 'composite_only_child_lookup'),
  'composite unique index did not serve the deal_id leading-prefix lookup'
);

-- Mode B: only the composite unique index remains.
select harness.run_explained_mutation(
  4,
  'delete_cascade_composite_only',
  'composite_unique_index_only',
  'parent_delete_cascade',
  'delete from harness.nav_deals_v2 where id = 4500',
  'Referenced parent delete with ON DELETE CASCADE after single-column index removal.'
);

select harness.run_explained_mutation(
  5,
  'update_unreferenced_composite_only',
  'composite_unique_index_only',
  'parent_update_unreferenced',
  'update harness.nav_deals_v2 set id = 6002 where id = 5002',
  'Parent key update with no child rows after single-column index removal.'
);

select harness.run_blocked_parent_update(
  6,
  'update_referenced_blocked_composite_only',
  'composite_unique_index_only',
  4501,
  7501,
  'ON UPDATE NO ACTION remains enforced with only the composite unique index.'
);

select harness.assert_true(
  (select affected_children = 20 from harness.mutation_evidence where case_id = 'delete_cascade_composite_only'),
  'composite-only cascade delete did not remove exactly 20 answer rows'
);
select harness.assert_true(
  (select not single_index_present from harness.mutation_evidence where case_id = 'delete_cascade_composite_only'),
  'composite-only cascade evidence still reports the single-column index'
);
select harness.assert_true(
  (select composite_scan_delta > 0 from harness.mutation_evidence where case_id = 'delete_cascade_composite_only'),
  'composite-only cascade delete did not attribute a composite index scan'
);
select harness.assert_true(
  (select success and not foreign_key_blocked from harness.mutation_evidence where case_id = 'update_unreferenced_composite_only'),
  'composite-only unreferenced parent update failed'
);
select harness.assert_true(
  (select composite_scan_delta > 0 from harness.mutation_evidence where case_id = 'update_unreferenced_composite_only'),
  'composite-only unreferenced parent update did not attribute a composite index scan'
);
select harness.assert_true(
  (select foreign_key_blocked and sqlstate = '23503' from harness.mutation_evidence where case_id = 'update_referenced_blocked_composite_only'),
  'composite-only referenced parent update was not blocked by the FK'
);

-- Result and contract equivalence assertions.
select harness.assert_true(
  (select count(*) from harness.nav_deals_v2) = 5000,
  'final synthetic deal count differs after two deletes and two key updates'
);
select harness.assert_true(
  (select count(*) from harness.nav_deal_answers_v2) = 99960,
  'final synthetic answer count differs after two 20-row cascades'
);
select harness.assert_true(
  not exists (select 1 from harness.nav_deal_answers_v2 where deal_id in (4000, 4500)),
  'cascaded child rows survived parent deletion'
);
select harness.assert_true(
  exists (select 1 from harness.nav_deals_v2 where id = 6001)
    and exists (select 1 from harness.nav_deals_v2 where id = 6002),
  'unreferenced parent updates did not persist inside the synthetic transaction'
);
select harness.assert_true(
  exists (select 1 from harness.nav_deals_v2 where id = 4001)
    and not exists (select 1 from harness.nav_deals_v2 where id = 7001)
    and exists (select 1 from harness.nav_deals_v2 where id = 4501)
    and not exists (select 1 from harness.nav_deals_v2 where id = 7501),
  'referenced parent update rejection changed parent keys'
);
select harness.assert_true(
  (select confdeltype = 'c' and confupdtype = 'a' and convalidated and not condeferrable
   from pg_constraint
   where conrelid = 'harness.nav_deal_answers_v2'::regclass
     and conname = 'nav_deal_answers_v2_deal_id_fkey'),
  'synthetic FK contract differs from production read-only capture'
);
select harness.assert_true(
  (select count(*) = 6 from harness.mutation_evidence),
  'mutation evidence case count drifted'
);
select harness.assert_true(
  (select count(*) = 2 from harness.mutation_evidence where comparison_mode = 'composite_unique_index_only' and operation <> 'parent_update_referenced'),
  'composite-only successful mutation case count drifted'
);

select jsonb_pretty(jsonb_build_object(
  'schema_version', 1,
  'status', 'repository_only_synthetic_fk_parent_mutation_evidence_not_ddl_approval',
  'postgres_version', current_setting('server_version'),
  'production_schema_used', false,
  'production_data_copied', false,
  'production_ddl_authorized', false,
  'latency_superiority_asserted', false,
  'fk_contract', (
    select jsonb_build_object(
      'delete_action', confdeltype,
      'update_action', confupdtype,
      'validated', convalidated,
      'deferrable', condeferrable
    )
    from pg_constraint
    where conrelid = 'harness.nav_deal_answers_v2'::regclass
      and conname = 'nav_deal_answers_v2_deal_id_fkey'
  ),
  'index_sizes', (select jsonb_agg(to_jsonb(s) order by evidence_id) from harness.index_size_evidence s),
  'structural_plan', (select jsonb_agg(to_jsonb(p) order by evidence_id) from harness.plan_evidence p),
  'mutations', (select jsonb_agg(to_jsonb(e) order by evidence_order) from harness.mutation_evidence e),
  'final_counts_inside_transaction', jsonb_build_object(
    'deals', (select count(*) from harness.nav_deals_v2),
    'answers', (select count(*) from harness.nav_deal_answers_v2)
  ),
  'decision', 'review_possible_redundancy_only',
  'active_stop', 'production_fk_parent_mutation_benchmark_missing'
)) as synthetic_fk_parent_mutation_evidence;

rollback;

do $post_rollback$
begin
  if to_regnamespace('harness') is not null then
    raise exception 'synthetic FK parent mutation harness schema survived rollback';
  end if;
end;
$post_rollback$;

select 'Navigator v2 synthetic FK parent mutation benchmark passed with full rollback' as result;
