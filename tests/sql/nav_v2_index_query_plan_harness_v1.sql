-- Navigator v2 synthetic index query-plan harness v1.
-- Runs only in an isolated PostgreSQL 17 CI database with generated data.
-- It proves structural planner applicability, not production performance or DDL readiness.

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

create table harness.plan_evidence (
  evidence_order integer primary key,
  evidence_id text not null unique,
  plan jsonb not null,
  index_expected text,
  index_observed boolean not null,
  seq_scan_observed boolean not null,
  note text not null
);

-- Candidate A: nav_user_profiles_role_idx.
create table harness.nav_user_profiles (
  id bigint primary key,
  role text not null,
  is_active boolean not null,
  manager_id bigint,
  created_at timestamptz not null
);

create index nav_user_profiles_role_idx
  on harness.nav_user_profiles (role);

insert into harness.nav_user_profiles (id, role, is_active, manager_id, created_at)
select
  g,
  case
    when g % 100 = 0 then 'owner'
    when g % 25 = 0 then 'admin'
    when g % 10 = 0 then 'manager'
    when g % 7 = 0 then 'lawyer'
    when g % 5 = 0 then 'broker'
    else 'spn'
  end,
  g % 29 <> 0,
  case when g % 10 <> 0 then ((g % 1000) + 1)::bigint else null end,
  timestamptz '2026-01-01 00:00:00+00' + make_interval(secs => g)
from generate_series(1, 120000) as series(g);

analyze harness.nav_user_profiles;

insert into harness.plan_evidence (
  evidence_order, evidence_id, plan, index_expected, index_observed, seq_scan_observed, note
)
select
  1,
  'profile_role_natural_with_index',
  plan,
  'nav_user_profiles_role_idx',
  plan::text like '%nav_user_profiles_role_idx%',
  plan::text like '%"Node Type": "Seq Scan"%',
  'Natural cost-based plan on 120000 synthetic profiles; captured but not used as production benchmark.'
from (
  select harness.explain_json(
    $query$select id
      from harness.nav_user_profiles
      where role = 'owner' and is_active is true
      order by created_at desc
      limit 50$query$
  ) as plan
) captured;

set local enable_seqscan = off;

insert into harness.plan_evidence (
  evidence_order, evidence_id, plan, index_expected, index_observed, seq_scan_observed, note
)
select
  2,
  'profile_role_structural_with_index',
  plan,
  'nav_user_profiles_role_idx',
  plan::text like '%nav_user_profiles_role_idx%',
  plan::text like '%"Node Type": "Seq Scan"%',
  'Structural applicability check with sequential scan disabled; proves the role predicate is supported by the index.'
from (
  select harness.explain_json(
    $query$select id
      from harness.nav_user_profiles
      where role = 'owner' and is_active is true
      order by created_at desc
      limit 50$query$
  ) as plan
) captured;

select harness.assert_true(
  (select index_observed from harness.plan_evidence where evidence_id = 'profile_role_structural_with_index'),
  'role index was not structurally applicable to a selective role consumer query'
);

set local enable_seqscan = on;

drop index harness.nav_user_profiles_role_idx;

insert into harness.plan_evidence (
  evidence_order, evidence_id, plan, index_expected, index_observed, seq_scan_observed, note
)
select
  3,
  'profile_role_without_index',
  plan,
  'nav_user_profiles_role_idx',
  plan::text like '%nav_user_profiles_role_idx%',
  plan::text like '%"Node Type": "Seq Scan"%',
  'After synthetic removal the role query has no equivalent role-leading index and falls back to a sequential scan.'
from (
  select harness.explain_json(
    $query$select id
      from harness.nav_user_profiles
      where role = 'owner' and is_active is true
      order by created_at desc
      limit 50$query$
  ) as plan
) captured;

select harness.assert_true(
  not (select index_observed from harness.plan_evidence where evidence_id = 'profile_role_without_index'),
  'removed role index still appeared in the plan'
);
select harness.assert_true(
  (select seq_scan_observed from harness.plan_evidence where evidence_id = 'profile_role_without_index'),
  'role query did not expose the expected sequential-scan fallback after synthetic removal'
);

-- Candidate B: nav_deal_answers_v2_deal_idx overlapping a unique leading prefix.
create table harness.nav_deals_v2 (
  id bigint primary key
);

create table harness.nav_deal_answers_v2 (
  id bigserial primary key,
  deal_id bigint not null references harness.nav_deals_v2(id),
  question_key text not null,
  answer_value text,
  constraint nav_deal_answers_v2_deal_id_question_key_key unique (deal_id, question_key)
);

create index nav_deal_answers_v2_deal_idx
  on harness.nav_deal_answers_v2 (deal_id);

insert into harness.nav_deals_v2 (id)
select g from generate_series(1, 5000) as series(g);

insert into harness.nav_deal_answers_v2 (deal_id, question_key, answer_value)
select
  deal_id,
  format('question_%s', question_no),
  format('synthetic_%s_%s', deal_id, question_no)
from generate_series(1, 5000) as deals(deal_id)
cross join generate_series(1, 20) as questions(question_no);

analyze harness.nav_deals_v2;
analyze harness.nav_deal_answers_v2;

create table harness.result_equivalence (
  check_id text primary key,
  before_hash text not null,
  after_hash text,
  equivalent boolean
);

insert into harness.result_equivalence (check_id, before_hash)
select
  'answers_by_deal',
  md5(string_agg(question_key || '=' || answer_value, '|' order by question_key))
from harness.nav_deal_answers_v2
where deal_id = 4000;

insert into harness.plan_evidence (
  evidence_order, evidence_id, plan, index_expected, index_observed, seq_scan_observed, note
)
select
  4,
  'answers_deal_natural_with_both_indexes',
  plan,
  null,
  plan::text like '%nav_deal_answers_v2_deal_idx%'
    or plan::text like '%nav_deal_answers_v2_deal_id_question_key_key%',
  plan::text like '%"Node Type": "Seq Scan"%',
  'Natural plan with both the single-column and composite unique indexes; no exact winner is required.'
from (
  select harness.explain_json(
    $query$select question_key, answer_value
      from harness.nav_deal_answers_v2
      where deal_id = 4000
      order by question_key$query$
  ) as plan
) captured;

drop index harness.nav_deal_answers_v2_deal_idx;

insert into harness.plan_evidence (
  evidence_order, evidence_id, plan, index_expected, index_observed, seq_scan_observed, note
)
select
  5,
  'answers_deal_natural_without_single_index',
  plan,
  'nav_deal_answers_v2_deal_id_question_key_key',
  plan::text like '%nav_deal_answers_v2_deal_id_question_key_key%',
  plan::text like '%"Node Type": "Seq Scan"%',
  'Natural plan after synthetic removal of the single-column index.'
from (
  select harness.explain_json(
    $query$select question_key, answer_value
      from harness.nav_deal_answers_v2
      where deal_id = 4000
      order by question_key$query$
  ) as plan
) captured;

set local enable_seqscan = off;

insert into harness.plan_evidence (
  evidence_order, evidence_id, plan, index_expected, index_observed, seq_scan_observed, note
)
select
  6,
  'answers_deal_structural_composite_prefix',
  plan,
  'nav_deal_answers_v2_deal_id_question_key_key',
  plan::text like '%nav_deal_answers_v2_deal_id_question_key_key%',
  plan::text like '%"Node Type": "Seq Scan"%',
  'Structural check: the composite unique index serves a deal_id leading-prefix read after the single-column index is absent.'
from (
  select harness.explain_json(
    $query$select question_key, answer_value
      from harness.nav_deal_answers_v2
      where deal_id = 4000
      order by question_key$query$
  ) as plan
) captured;

insert into harness.plan_evidence (
  evidence_order, evidence_id, plan, index_expected, index_observed, seq_scan_observed, note
)
select
  7,
  'answers_fk_lookup_structural_composite_prefix',
  plan,
  'nav_deal_answers_v2_deal_id_question_key_key',
  plan::text like '%nav_deal_answers_v2_deal_id_question_key_key%',
  plan::text like '%"Node Type": "Seq Scan"%',
  'Structural approximation of the child-row lookup needed by a foreign-key parent mutation check.'
from (
  select harness.explain_json(
    $query$select 1
      from harness.nav_deal_answers_v2
      where deal_id = 4000
      limit 1$query$
  ) as plan
) captured;

select harness.assert_true(
  (select index_observed from harness.plan_evidence where evidence_id = 'answers_deal_structural_composite_prefix'),
  'composite unique index did not support the deal_id leading-prefix read'
);
select harness.assert_true(
  (select index_observed from harness.plan_evidence where evidence_id = 'answers_fk_lookup_structural_composite_prefix'),
  'composite unique index did not support the synthetic FK child lookup'
);

set local enable_seqscan = on;

update harness.result_equivalence
set after_hash = comparison.after_hash,
    equivalent = before_hash = comparison.after_hash
from (
  select md5(string_agg(question_key || '=' || answer_value, '|' order by question_key)) as after_hash
  from harness.nav_deal_answers_v2
  where deal_id = 4000
) comparison
where check_id = 'answers_by_deal';

select harness.assert_true(
  (select equivalent from harness.result_equivalence where check_id = 'answers_by_deal'),
  'answer query result changed after synthetic single-column index removal'
);
select harness.assert_true(
  (select count(*) from harness.nav_user_profiles) = 120000,
  'synthetic profile cardinality drifted'
);
select harness.assert_true(
  (select count(*) from harness.nav_deals_v2) = 5000,
  'synthetic deal cardinality drifted'
);
select harness.assert_true(
  (select count(*) from harness.nav_deal_answers_v2) = 100000,
  'synthetic answer cardinality drifted'
);

select jsonb_pretty(jsonb_build_object(
  'schema_version', 1,
  'status', 'repository_only_synthetic_index_query_plan_evidence',
  'postgres_version', current_setting('server_version'),
  'production_schema_used', false,
  'production_data_copied', false,
  'production_ddl_authorized', false,
  'profile_rows', (select count(*) from harness.nav_user_profiles),
  'deal_rows', (select count(*) from harness.nav_deals_v2),
  'answer_rows', (select count(*) from harness.nav_deal_answers_v2),
  'result_equivalence', (select jsonb_agg(to_jsonb(r) order by check_id) from harness.result_equivalence r),
  'plans', (select jsonb_agg(to_jsonb(e) order by evidence_order) from harness.plan_evidence e)
)) as synthetic_index_query_plan_evidence;

rollback;

do $post_rollback$
begin
  if to_regnamespace('harness') is not null then
    raise exception 'synthetic harness schema survived rollback';
  end if;
end;
$post_rollback$;

select 'Navigator v2 synthetic index query-plan harness passed with full rollback' as result;
