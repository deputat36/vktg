-- Navigator v2 synthetic FK parent-mutation index attribution harness v1.
-- Companion evidence for the canonical FK mutation harness.
-- Runs only in an isolated PostgreSQL 17 CI database with generated data.
-- It does not prove production performance or authorize production DDL.

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

create or replace function harness.explain_json(p_sql text)
returns jsonb
language plpgsql
as $function$
declare
  v_plan jsonb;
begin
  execute 'explain (format json, costs true, verbose false) ' || p_sql into v_plan;
  return v_plan;
end;
$function$;

create or replace function harness.index_scans(p_index_name text)
returns bigint
language sql
stable
as $function$
  select coalesce((
    select idx_scan
    from pg_stat_user_indexes
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
    on update no action
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
    'Synthetic size only; never extrapolated to production storage.'
  ),
  (
    'composite_unique_index',
    pg_relation_size('harness.nav_deal_answers_v2_deal_id_question_key_key'::regclass),
    'Composite unique index retained in both comparison modes.'
  );

create table harness.plan_evidence (
  evidence_id text primary key,
  plan jsonb not null,
  composite_index_observed boolean not null,
  note text not null
);

create table harness.attribution_evidence (
  evidence_order integer primary key,
  case_id text not null unique,
  comparison_mode text not null,
  operation text not null,
  success boolean not null,
  foreign_key_blocked boolean not null,
  sqlstate text,
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
  note text not null
);

create or replace function harness.refresh_stats_snapshot()
returns void
language plpgsql
as $function$
begin
  perform pg_stat_force_next_flush();
  perform pg_stat_clear_snapshot();
end;
$function$;

create or replace function harness.capture_successful_mutation(
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
  v_single_before bigint;
  v_single_after bigint;
  v_composite_before bigint;
  v_composite_after bigint;
  v_deals_before bigint;
  v_deals_after bigint;
  v_answers_before bigint;
  v_answers_after bigint;
begin
  perform pg_stat_clear_snapshot();
  v_single_before := harness.index_scans('nav_deal_answers_v2_deal_idx');
  v_composite_before := harness.index_scans('nav_deal_answers_v2_deal_id_question_key_key');
  select count(*) into v_deals_before from harness.nav_deals_v2;
  select count(*) into v_answers_before from harness.nav_deal_answers_v2;

  execute p_sql;
  perform harness.refresh_stats_snapshot();

  v_single_after := harness.index_scans('nav_deal_answers_v2_deal_idx');
  v_composite_after := harness.index_scans('nav_deal_answers_v2_deal_id_question_key_key');
  select count(*) into v_deals_after from harness.nav_deals_v2;
  select count(*) into v_answers_after from harness.nav_deal_answers_v2;

  insert into harness.attribution_evidence (
    evidence_order, case_id, comparison_mode, operation,
    success, foreign_key_blocked, sqlstate, single_index_present,
    single_scan_before, single_scan_after, single_scan_delta,
    composite_scan_before, composite_scan_after, composite_scan_delta,
    deal_count_before, deal_count_after, answer_count_before, answer_count_after,
    affected_children, note
  ) values (
    p_order, p_case_id, p_mode, p_operation,
    true, false, null, to_regclass('harness.nav_deal_answers_v2_deal_idx') is not null,
    v_single_before, v_single_after, greatest(v_single_after - v_single_before, 0),
    v_composite_before, v_composite_after, greatest(v_composite_after - v_composite_before, 0),
    v_deals_before, v_deals_after, v_answers_before, v_answers_after,
    greatest(v_answers_before - v_answers_after, 0), p_note
  );
end;
$function$;

create or replace function harness.capture_blocked_parent_update(
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
  perform pg_stat_clear_snapshot();
  v_single_before := harness.index_scans('nav_deal_answers_v2_deal_idx');
  v_composite_before := harness.index_scans('nav_deal_answers_v2_deal_id_question_key_key');
  select count(*) into v_deals_before from harness.nav_deals_v2;
  select count(*) into v_answers_before from harness.nav_deal_answers_v2;

  begin
    update harness.nav_deals_v2 set id = p_new_id where id = p_old_id;
  exception
    when foreign_key_violation then
      v_blocked := true;
      get stacked diagnostics v_state = returned_sqlstate;
  end;
  perform harness.refresh_stats_snapshot();

  v_single_after := harness.index_scans('nav_deal_answers_v2_deal_idx');
  v_composite_after := harness.index_scans('nav_deal_answers_v2_deal_id_question_key_key');
  select count(*) into v_deals_after from harness.nav_deals_v2;
  select count(*) into v_answers_after from harness.nav_deal_answers_v2;

  insert into harness.attribution_evidence (
    evidence_order, case_id, comparison_mode, operation,
    success, foreign_key_blocked, sqlstate, single_index_present,
    single_scan_before, single_scan_after, single_scan_delta,
    composite_scan_before, composite_scan_after, composite_scan_delta,
    deal_count_before, deal_count_after, answer_count_before, answer_count_after,
    affected_children, note
  ) values (
    p_order, p_case_id, p_mode, 'parent_update_referenced',
    not v_blocked, v_blocked, v_state, to_regclass('harness.nav_deal_answers_v2_deal_idx') is not null,
    v_single_before, v_single_after, greatest(v_single_after - v_single_before, 0),
    v_composite_before, v_composite_after, greatest(v_composite_after - v_composite_before, 0),
    v_deals_before, v_deals_after, v_answers_before, v_answers_after,
    0, p_note
  );
end;
$function$;

-- Mode A: both child indexes exist.
select harness.capture_successful_mutation(
  1,
  'delete_cascade_with_both_indexes',
  'single_and_composite_indexes',
  'parent_delete_cascade',
  'delete from harness.nav_deals_v2 where id = 4000',
  'Actual ON DELETE CASCADE while both child indexes exist.'
);

select harness.capture_successful_mutation(
  2,
  'update_unreferenced_with_both_indexes',
  'single_and_composite_indexes',
  'parent_update_unreferenced',
  'update harness.nav_deals_v2 set id = 6001 where id = 5001',
  'Actual ON UPDATE NO ACTION child lookup for a parent without child rows.'
);

select harness.capture_blocked_parent_update(
  3,
  'update_referenced_blocked_with_both_indexes',
  'single_and_composite_indexes',
  4001,
  7001,
  'Referenced parent key update must fail with SQLSTATE 23503.'
);

select harness.assert_true(
  (select affected_children = 20 from harness.attribution_evidence where case_id = 'delete_cascade_with_both_indexes'),
  'both-index cascade delete did not remove exactly 20 child rows'
);
select harness.assert_true(
  (select single_scan_delta + composite_scan_delta > 0 from harness.attribution_evidence where case_id = 'delete_cascade_with_both_indexes'),
  'both-index cascade delete did not attribute any child index scan'
);
select harness.assert_true(
  (select success and single_scan_delta + composite_scan_delta > 0 from harness.attribution_evidence where case_id = 'update_unreferenced_with_both_indexes'),
  'both-index unreferenced update did not attribute any child index scan'
);
select harness.assert_true(
  (select foreign_key_blocked and sqlstate = '23503' from harness.attribution_evidence where case_id = 'update_referenced_blocked_with_both_indexes'),
  'both-index referenced parent update was not rejected by the foreign key'
);

-- Mode B: remove only the synthetic single-column index.
drop index harness.nav_deal_answers_v2_deal_idx;
analyze harness.nav_deal_answers_v2;

select harness.assert_true(
  to_regclass('harness.nav_deal_answers_v2_deal_idx') is null,
  'synthetic single-column index survived removal'
);
select harness.assert_true(
  to_regclass('harness.nav_deal_answers_v2_deal_id_question_key_key') is not null,
  'composite unique index is absent before composite-only cases'
);

set local enable_seqscan = off;

insert into harness.plan_evidence (evidence_id, plan, composite_index_observed, note)
select
  'composite_only_child_lookup',
  plan,
  plan::text like '%nav_deal_answers_v2_deal_id_question_key_key%',
  'Structural deal_id lookup after synthetic single-column index removal.'
from (
  select harness.explain_json(
    'select 1 from harness.nav_deal_answers_v2 where deal_id = 4500 limit 1'
  ) as plan
) captured;

set local enable_seqscan = on;

select harness.assert_true(
  (select composite_index_observed from harness.plan_evidence where evidence_id = 'composite_only_child_lookup'),
  'composite unique index did not serve the structural deal_id lookup'
);

select harness.capture_successful_mutation(
  4,
  'delete_cascade_composite_only',
  'composite_unique_index_only',
  'parent_delete_cascade',
  'delete from harness.nav_deals_v2 where id = 4500',
  'Actual ON DELETE CASCADE with only the composite unique child index.'
);

select harness.capture_successful_mutation(
  5,
  'update_unreferenced_composite_only',
  'composite_unique_index_only',
  'parent_update_unreferenced',
  'update harness.nav_deals_v2 set id = 6002 where id = 5002',
  'Actual ON UPDATE NO ACTION child lookup with only the composite unique index.'
);

select harness.capture_blocked_parent_update(
  6,
  'update_referenced_blocked_composite_only',
  'composite_unique_index_only',
  4501,
  7501,
  'Referenced parent update remains rejected without the single-column index.'
);

select harness.assert_true(
  (select affected_children = 20 from harness.attribution_evidence where case_id = 'delete_cascade_composite_only'),
  'composite-only cascade delete did not remove exactly 20 child rows'
);
select harness.assert_true(
  (select not single_index_present and composite_scan_delta > 0 from harness.attribution_evidence where case_id = 'delete_cascade_composite_only'),
  'composite-only cascade delete did not attribute a composite index scan'
);
select harness.assert_true(
  (select success and not single_index_present and composite_scan_delta > 0 from harness.attribution_evidence where case_id = 'update_unreferenced_composite_only'),
  'composite-only unreferenced update did not attribute a composite index scan'
);
select harness.assert_true(
  (select foreign_key_blocked and sqlstate = '23503' and not single_index_present from harness.attribution_evidence where case_id = 'update_referenced_blocked_composite_only'),
  'composite-only referenced parent update was not rejected by the foreign key'
);

select harness.assert_true(
  (select count(*) from harness.nav_deals_v2) = 5000,
  'final synthetic parent count differs after two deletes and two successful updates'
);
select harness.assert_true(
  (select count(*) from harness.nav_deal_answers_v2) = 99960,
  'final synthetic child count differs after two 20-row cascades'
);
select harness.assert_true(
  not exists (select 1 from harness.nav_deal_answers_v2 where deal_id in (4000, 4500)),
  'cascaded child rows survived parent deletion'
);
select harness.assert_true(
  exists (select 1 from harness.nav_deals_v2 where id = 6001)
    and exists (select 1 from harness.nav_deals_v2 where id = 6002),
  'unreferenced parent key updates did not persist inside the synthetic transaction'
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
  'synthetic FK contract differs from the read-only production capture'
);
select harness.assert_true(
  (select count(*) = 6 from harness.attribution_evidence),
  'attribution evidence case count drifted'
);
select harness.assert_true(
  (select bool_and(relation_bytes > 0) from harness.index_size_evidence),
  'synthetic index size capture returned an empty relation'
);

select jsonb_pretty(jsonb_build_object(
  'schema_version', 1,
  'status', 'repository_only_synthetic_fk_parent_mutation_attribution_not_ddl_approval',
  'postgres_version', current_setting('server_version'),
  'production_schema_used', false,
  'production_data_copied', false,
  'production_ddl_authorized', false,
  'index_drop_authorized', false,
  'statistics_source', 'pg_stat_user_indexes',
  'statistics_snapshot_reset_between_reads', true,
  'statistics_flush_requested_after_mutation', true,
  'latency_superiority_asserted', false,
  'index_sizes', (select jsonb_agg(to_jsonb(s) order by evidence_id) from harness.index_size_evidence s),
  'structural_plan', (select jsonb_agg(to_jsonb(p) order by evidence_id) from harness.plan_evidence p),
  'attribution', (select jsonb_agg(to_jsonb(e) order by evidence_order) from harness.attribution_evidence e),
  'final_counts_inside_transaction', jsonb_build_object(
    'deals', (select count(*) from harness.nav_deals_v2),
    'answers', (select count(*) from harness.nav_deal_answers_v2)
  ),
  'canonical_decision', 'synthetic_fk_parent_mutation_gap_closed_production_drop_not_ready',
  'candidate_decision', 'review_possible_redundancy_only'
)) as synthetic_fk_parent_mutation_attribution;

rollback;

do $post_rollback$
begin
  if to_regnamespace('harness') is not null then
    raise exception 'synthetic FK parent-mutation attribution schema survived rollback';
  end if;
end;
$post_rollback$;

select 'Navigator v2 synthetic FK parent-mutation attribution harness passed with full rollback' as result;
