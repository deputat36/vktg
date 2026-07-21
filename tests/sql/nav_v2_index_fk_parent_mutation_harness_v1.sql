-- Navigator v2 synthetic foreign-key parent mutation harness v1.
-- Runs only in an isolated PostgreSQL 17 CI database with generated data.
-- It compares actual parent DELETE/UPDATE behavior with both answer indexes
-- and with only the composite (deal_id, question_key) prefix index.
-- It is repository evidence, not production performance or DDL approval.

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

create or replace function harness.explain_analyze_json(p_sql text)
returns jsonb
language plpgsql
as $function$
declare
  v_plan jsonb;
begin
  execute 'explain (analyze, format json, costs true, timing false, summary true) ' || p_sql into v_plan;
  return v_plan;
end;
$function$;

create table harness.plan_evidence (
  evidence_order integer primary key,
  evidence_id text not null unique,
  plan jsonb not null,
  index_expected text not null,
  index_observed boolean not null,
  note text not null
);

create table harness.mutation_evidence (
  evidence_order integer primary key,
  evidence_id text not null unique,
  index_mode text not null,
  mutation_kind text not null,
  plan jsonb not null,
  execution_time_ms numeric not null,
  trigger_count integer not null,
  old_parent_exists boolean not null,
  new_parent_exists boolean,
  child_rows_old bigint not null,
  child_rows_new bigint,
  note text not null
);

create table harness.result_equivalence (
  check_id text primary key,
  both_hash text not null,
  prefix_hash text not null,
  equivalent boolean not null
);

-- Mode A mirrors production index overlap: a single-column deal_id index plus
-- the unique composite (deal_id, question_key) index.
create table harness.nav_deals_both (
  id bigint primary key
);

create table harness.nav_deal_answers_both (
  id bigserial primary key,
  deal_id bigint not null,
  question_key text not null,
  answer_value text,
  constraint nav_deal_answers_both_deal_question_key_key unique (deal_id, question_key),
  constraint nav_deal_answers_both_deal_id_fkey
    foreign key (deal_id)
    references harness.nav_deals_both(id)
    on update no action
    on delete cascade
);

create index nav_deal_answers_both_deal_idx
  on harness.nav_deal_answers_both (deal_id);

-- Mode B keeps only the composite unique index whose leading column is deal_id.
create table harness.nav_deals_prefix (
  id bigint primary key
);

create table harness.nav_deal_answers_prefix (
  id bigserial primary key,
  deal_id bigint not null,
  question_key text not null,
  answer_value text,
  constraint nav_deal_answers_prefix_deal_question_key_key unique (deal_id, question_key),
  constraint nav_deal_answers_prefix_deal_id_fkey
    foreign key (deal_id)
    references harness.nav_deals_prefix(id)
    on update no action
    on delete cascade
);

insert into harness.nav_deals_both (id)
select g from generate_series(1, 5000) as series(g)
union all
select 6000;

insert into harness.nav_deals_prefix (id)
select g from generate_series(1, 5000) as series(g)
union all
select 6000;

insert into harness.nav_deal_answers_both (deal_id, question_key, answer_value)
select
  deal_id,
  format('question_%s', question_no),
  format('synthetic_%s_%s', deal_id, question_no)
from generate_series(1, 5000) as deals(deal_id)
cross join generate_series(1, 20) as questions(question_no);

insert into harness.nav_deal_answers_prefix (deal_id, question_key, answer_value)
select
  deal_id,
  format('question_%s', question_no),
  format('synthetic_%s_%s', deal_id, question_no)
from generate_series(1, 5000) as deals(deal_id)
cross join generate_series(1, 20) as questions(question_no);

analyze harness.nav_deals_both;
analyze harness.nav_deal_answers_both;
analyze harness.nav_deals_prefix;
analyze harness.nav_deal_answers_prefix;

select harness.assert_true(
  (select count(*) from harness.nav_deals_both) = 5001
  and (select count(*) from harness.nav_deals_prefix) = 5001,
  'synthetic parent cardinality drifted before mutation benchmark'
);

select harness.assert_true(
  (select count(*) from harness.nav_deal_answers_both) = 100000
  and (select count(*) from harness.nav_deal_answers_prefix) = 100000,
  'synthetic child cardinality drifted before mutation benchmark'
);

-- Prove the prefix-only child lookup is structurally served by the composite index.
set local enable_seqscan = off;

insert into harness.plan_evidence (
  evidence_order, evidence_id, plan, index_expected, index_observed, note
)
select
  1,
  'prefix_only_fk_child_lookup',
  plan,
  'nav_deal_answers_prefix_deal_question_key_key',
  plan::text like '%nav_deal_answers_prefix_deal_question_key_key%',
  'Structural child lookup used by parent FK checks when no single-column deal_id index exists.'
from (
  select harness.explain_json(
    $query$select 1
      from harness.nav_deal_answers_prefix
      where deal_id = 4000
      limit 1$query$
  ) as plan
) captured;

select harness.assert_true(
  (select index_observed from harness.plan_evidence where evidence_id = 'prefix_only_fk_child_lookup'),
  'composite prefix index did not support the FK child lookup'
);

set local enable_seqscan = on;

-- Actual ON DELETE CASCADE benchmark with both indexes.
with captured as (
  select harness.explain_analyze_json(
    $sql$delete from harness.nav_deals_both where id = 4000$sql$
  ) as plan
)
insert into harness.mutation_evidence (
  evidence_order,
  evidence_id,
  index_mode,
  mutation_kind,
  plan,
  execution_time_ms,
  trigger_count,
  old_parent_exists,
  new_parent_exists,
  child_rows_old,
  child_rows_new,
  note
)
select
  1,
  'delete_cascade_both_indexes',
  'both_indexes',
  'delete_cascade',
  plan,
  coalesce((plan->0->>'Execution Time')::numeric, 0),
  jsonb_array_length(coalesce(plan->0->'Triggers', '[]'::jsonb)),
  exists(select 1 from harness.nav_deals_both where id = 4000),
  null,
  (select count(*) from harness.nav_deal_answers_both where deal_id = 4000),
  null,
  'Actual parent DELETE executed ON DELETE CASCADE against 100000 synthetic child rows.'
from captured;

-- Actual ON UPDATE NO ACTION benchmark on a parent with no child rows.
with captured as (
  select harness.explain_analyze_json(
    $sql$update harness.nav_deals_both set id = 6001 where id = 6000$sql$
  ) as plan
)
insert into harness.mutation_evidence (
  evidence_order,
  evidence_id,
  index_mode,
  mutation_kind,
  plan,
  execution_time_ms,
  trigger_count,
  old_parent_exists,
  new_parent_exists,
  child_rows_old,
  child_rows_new,
  note
)
select
  2,
  'update_no_action_both_indexes',
  'both_indexes',
  'update_no_action',
  plan,
  coalesce((plan->0->>'Execution Time')::numeric, 0),
  jsonb_array_length(coalesce(plan->0->'Triggers', '[]'::jsonb)),
  exists(select 1 from harness.nav_deals_both where id = 6000),
  exists(select 1 from harness.nav_deals_both where id = 6001),
  (select count(*) from harness.nav_deal_answers_both where deal_id = 6000),
  (select count(*) from harness.nav_deal_answers_both where deal_id = 6001),
  'Actual parent key UPDATE executed the NO ACTION child-reference check with no matching children.'
from captured;

-- Actual ON DELETE CASCADE benchmark with only the composite prefix index.
with captured as (
  select harness.explain_analyze_json(
    $sql$delete from harness.nav_deals_prefix where id = 4000$sql$
  ) as plan
)
insert into harness.mutation_evidence (
  evidence_order,
  evidence_id,
  index_mode,
  mutation_kind,
  plan,
  execution_time_ms,
  trigger_count,
  old_parent_exists,
  new_parent_exists,
  child_rows_old,
  child_rows_new,
  note
)
select
  3,
  'delete_cascade_prefix_only',
  'composite_prefix_only',
  'delete_cascade',
  plan,
  coalesce((plan->0->>'Execution Time')::numeric, 0),
  jsonb_array_length(coalesce(plan->0->'Triggers', '[]'::jsonb)),
  exists(select 1 from harness.nav_deals_prefix where id = 4000),
  null,
  (select count(*) from harness.nav_deal_answers_prefix where deal_id = 4000),
  null,
  'Actual parent DELETE executed ON DELETE CASCADE without a single-column child index.'
from captured;

-- Actual ON UPDATE NO ACTION benchmark with only the composite prefix index.
with captured as (
  select harness.explain_analyze_json(
    $sql$update harness.nav_deals_prefix set id = 6001 where id = 6000$sql$
  ) as plan
)
insert into harness.mutation_evidence (
  evidence_order,
  evidence_id,
  index_mode,
  mutation_kind,
  plan,
  execution_time_ms,
  trigger_count,
  old_parent_exists,
  new_parent_exists,
  child_rows_old,
  child_rows_new,
  note
)
select
  4,
  'update_no_action_prefix_only',
  'composite_prefix_only',
  'update_no_action',
  plan,
  coalesce((plan->0->>'Execution Time')::numeric, 0),
  jsonb_array_length(coalesce(plan->0->'Triggers', '[]'::jsonb)),
  exists(select 1 from harness.nav_deals_prefix where id = 6000),
  exists(select 1 from harness.nav_deals_prefix where id = 6001),
  (select count(*) from harness.nav_deal_answers_prefix where deal_id = 6000),
  (select count(*) from harness.nav_deal_answers_prefix where deal_id = 6001),
  'Actual parent key UPDATE executed the NO ACTION child-reference check with only composite prefix coverage.'
from captured;

-- The mutation semantics must be identical in both index modes.
select harness.assert_true(
  not (select old_parent_exists from harness.mutation_evidence where evidence_id = 'delete_cascade_both_indexes')
  and (select child_rows_old from harness.mutation_evidence where evidence_id = 'delete_cascade_both_indexes') = 0,
  'delete cascade semantics failed with both indexes'
);

select harness.assert_true(
  not (select old_parent_exists from harness.mutation_evidence where evidence_id = 'delete_cascade_prefix_only')
  and (select child_rows_old from harness.mutation_evidence where evidence_id = 'delete_cascade_prefix_only') = 0,
  'delete cascade semantics failed with composite prefix only'
);

select harness.assert_true(
  not (select old_parent_exists from harness.mutation_evidence where evidence_id = 'update_no_action_both_indexes')
  and (select new_parent_exists from harness.mutation_evidence where evidence_id = 'update_no_action_both_indexes')
  and (select child_rows_old from harness.mutation_evidence where evidence_id = 'update_no_action_both_indexes') = 0
  and (select child_rows_new from harness.mutation_evidence where evidence_id = 'update_no_action_both_indexes') = 0,
  'update no-action semantics failed with both indexes'
);

select harness.assert_true(
  not (select old_parent_exists from harness.mutation_evidence where evidence_id = 'update_no_action_prefix_only')
  and (select new_parent_exists from harness.mutation_evidence where evidence_id = 'update_no_action_prefix_only')
  and (select child_rows_old from harness.mutation_evidence where evidence_id = 'update_no_action_prefix_only') = 0
  and (select child_rows_new from harness.mutation_evidence where evidence_id = 'update_no_action_prefix_only') = 0,
  'update no-action semantics failed with composite prefix only'
);

select harness.assert_true(
  (select count(*) from harness.mutation_evidence) = 4,
  'expected four actual parent mutation evidence rows'
);

select harness.assert_true(
  not exists (
    select 1
    from harness.mutation_evidence
    where execution_time_ms < 0 or trigger_count < 1
  ),
  'actual mutation plan lacks execution or trigger evidence'
);

select harness.assert_true(
  (select count(*) from harness.nav_deals_both) = 5000
  and (select count(*) from harness.nav_deals_prefix) = 5000,
  'post-mutation parent cardinality mismatch'
);

select harness.assert_true(
  (select count(*) from harness.nav_deal_answers_both) = 99980
  and (select count(*) from harness.nav_deal_answers_prefix) = 99980,
  'post-delete child cardinality mismatch'
);

insert into harness.result_equivalence (check_id, both_hash, prefix_hash, equivalent)
select
  'unaffected_deal_3000',
  both_hash,
  prefix_hash,
  both_hash = prefix_hash
from (
  select
    (select md5(string_agg(question_key || '=' || answer_value, '|' order by question_key))
       from harness.nav_deal_answers_both
       where deal_id = 3000) as both_hash,
    (select md5(string_agg(question_key || '=' || answer_value, '|' order by question_key))
       from harness.nav_deal_answers_prefix
       where deal_id = 3000) as prefix_hash
) hashes;

select harness.assert_true(
  (select equivalent from harness.result_equivalence where check_id = 'unaffected_deal_3000'),
  'unaffected answer results differ between index modes'
);

select jsonb_pretty(jsonb_build_object(
  'schema_version', 1,
  'status', 'repository_only_synthetic_fk_parent_mutation_evidence',
  'postgres_version', current_setting('server_version'),
  'production_schema_used', false,
  'production_data_copied', false,
  'production_ddl_authorized', false,
  'index_drop_authorized', false,
  'live_fk_shape_mirrored', jsonb_build_object(
    'update_action', 'NO ACTION',
    'delete_action', 'CASCADE'
  ),
  'synthetic_deals_per_mode_before_mutation', 5001,
  'synthetic_answers_per_mode_before_mutation', 100000,
  'plans', (select jsonb_agg(to_jsonb(e) order by evidence_order) from harness.plan_evidence e),
  'mutations', (select jsonb_agg(to_jsonb(e) order by evidence_order) from harness.mutation_evidence e),
  'result_equivalence', (select jsonb_agg(to_jsonb(r) order by check_id) from harness.result_equivalence r)
)) as synthetic_fk_parent_mutation_evidence;

rollback;

do $post_rollback$
begin
  if to_regnamespace('harness') is not null then
    raise exception 'synthetic FK parent mutation harness schema survived rollback';
  end if;
end;
$post_rollback$;

select 'Navigator v2 synthetic FK parent mutation harness passed with full rollback' as result;
