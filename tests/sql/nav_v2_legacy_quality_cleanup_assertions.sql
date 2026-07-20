\set ON_ERROR_STOP on

do $assertions$
declare
  v_plan jsonb;
  v_plan_repeat jsonb;
  v_before harness.before_snapshot%rowtype;
  v_after_deals bigint;
  v_after_tasks bigint;
  v_after_hash text;
  v_case jsonb;
begin
  select * into v_before from harness.before_snapshot;
  v_plan := nav_v2_private.nav_v2_plan_legacy_quality_cleanup_v1();
  v_plan_repeat := nav_v2_private.nav_v2_plan_legacy_quality_cleanup_v1();

  perform harness.assert_true(v_plan = v_plan_repeat, 'cleanup plan is not deterministic');
  perform harness.assert_true((v_plan->>'writes_performed')::boolean is false, 'planner claims business writes');
  perform harness.assert_true((v_plan->>'production_ready')::boolean is false, 'planner claims production readiness');
  perform harness.assert_true(v_plan->'selected_option' = 'null'::jsonb, 'planner selected an owner option');
  perform harness.assert_true((v_plan #>> '{inventory,total}')::integer = 46, 'planner inventory total differs from 46');
  perform harness.assert_true((v_plan #>> '{inventory,by_classification,obsolete_privacy_conflict}')::integer = 40, 'privacy-conflict count differs from 40');
  perform harness.assert_true((v_plan #>> '{inventory,by_classification,replace_object_context}')::integer = 4, 'object replacement count differs from 4');
  perform harness.assert_true((v_plan #>> '{inventory,by_classification,replace_representation}')::integer = 2, 'representation replacement count differs from 2');
  perform harness.assert_true(jsonb_array_length(v_plan->'items') = 46, 'planner item count differs from 46');
  perform harness.assert_true(jsonb_array_length(v_plan->'owner_options') = 3, 'owner option count differs from three');
  perform harness.assert_true(jsonb_array_length(v_plan->'mandatory_stops') = 6, 'mandatory stop count differs from six');
  perform harness.assert_true(
    not (lower(v_plan::text) ~ '(seller_name|buyer_name|seller_phone|buyer_phone|email|passport|snils|inn)'),
    'planner output contains a forbidden identifier key'
  );

  perform harness.assert_true(
    not exists(
      select 1 from jsonb_array_elements(v_plan->'items') item
      where item->>'classification' = 'obsolete_privacy_conflict'
        and nullif(item->>'replacement_source','') is not null
    ),
    'privacy-conflict rows incorrectly create replacement tasks'
  );
  perform harness.assert_true(
    (select count(*) from jsonb_array_elements(v_plan->'items') item
      where item->>'classification'='replace_object_context'
        and item->>'replacement_source'='auto_quality_object_context') = 4,
    'address rows are not mapped to object-context replacements'
  );
  perform harness.assert_true(
    (select count(*) from jsonb_array_elements(v_plan->'items') item
      where item->>'classification'='replace_representation'
        and item->>'replacement_source'='auto_quality_representation') = 2,
    'responsible-SPN rows are not mapped to representation replacements'
  );

  -- Pure classifier coverage beyond the current production inventory.
  v_case := nav_v2_private.nav_v2_classify_legacy_quality_task_v1('auto_quality_address','seller','deal',true,false,true,false);
  perform harness.assert_true(v_case->>'classification'='resolved_under_new_contract', 'resolved address classification failed');
  v_case := nav_v2_private.nav_v2_classify_legacy_quality_task_v1('auto_quality_responsible_spn','seller','deal',true,false,false,false);
  perform harness.assert_true(v_case->>'classification'='replace_seller_spn', 'seller-SPN classification failed');
  v_case := nav_v2_private.nav_v2_classify_legacy_quality_task_v1('auto_quality_responsible_spn','buyer','deal',true,false,false,false);
  perform harness.assert_true(v_case->>'classification'='replace_buyer_spn', 'buyer-SPN classification failed');
  v_case := nav_v2_private.nav_v2_classify_legacy_quality_task_v1('auto_quality_responsible_spn','both','deal',true,false,false,false);
  perform harness.assert_true(v_case->>'classification'='replace_both_spn', 'both-SPN classification failed');
  v_case := nav_v2_private.nav_v2_classify_legacy_quality_task_v1('auto_quality_responsible_spn','one_spn_both','deal',true,false,true,false);
  perform harness.assert_true(v_case->>'classification'='replace_one_spn_consistency', 'one-SPN classification failed');
  v_case := nav_v2_private.nav_v2_classify_legacy_quality_task_v1('other_source','seller','deal',true,false,true,false);
  perform harness.assert_true(v_case->>'classification'='manual_review', 'unknown source did not fail closed');

  select count(*) into v_after_deals from public.nav_deals_v2;
  select count(*), md5(coalesce(string_agg(id::text||':'||status::text||':'||coalesce(source,''),'|' order by id),''))
  into v_after_tasks, v_after_hash
  from public.nav_deal_tasks_v2;

  perform harness.assert_true(v_after_deals=v_before.deal_count, 'planner changed deal count');
  perform harness.assert_true(v_after_tasks=v_before.task_count, 'planner changed task count');
  perform harness.assert_true(v_after_hash=v_before.task_hash, 'planner changed task rows');
  perform harness.assert_true(
    not has_function_privilege('authenticated','nav_v2_private.nav_v2_plan_legacy_quality_cleanup_v1()','EXECUTE')
    and not has_function_privilege('anon','nav_v2_private.nav_v2_plan_legacy_quality_cleanup_v1()','EXECUTE')
    and has_function_privilege('service_role','nav_v2_private.nav_v2_plan_legacy_quality_cleanup_v1()','EXECUTE'),
    'planner grants escaped service boundary'
  );
end;
$assertions$;

select jsonb_build_object(
  'result','Navigator v2 legacy quality cleanup planner PostgreSQL 17 assertions passed',
  'inventory',nav_v2_private.nav_v2_plan_legacy_quality_cleanup_v1()->'inventory',
  'writes_performed',false
) as evidence;
