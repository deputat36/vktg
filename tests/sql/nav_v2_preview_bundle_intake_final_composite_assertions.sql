\set ON_ERROR_STOP on

do $composites_and_negative$
declare p jsonb; preview jsonb; plan jsonb; ctx jsonb; failed boolean; rid uuid;
begin
  ctx:=harness.governed_intake_server_context();
  p:=harness.special_composite('flat_ground');
  preview:=nav_v2_private.nav_v2_prepare_intake_legacy_save_special_v1(p,'78000000-0000-4000-8000-000000000001',ctx);
  perform harness.assert_true((preview->>'effective_supported_count')::integer=24,'flat composite supported count differs from 24');
  perform harness.assert_true((preview->>'effective_unsupported_count')::integer=0,'flat composite unsupported is not zero');
  plan:=nav_v2_private.nav_v2_build_governed_intake_write_plan_special_v1(p,'78000000-0000-4000-8000-000000000002',ctx);
  perform harness.assert_true((plan->>'allowed')::boolean,'flat composite plan blocked');
  perform harness.assert_true(jsonb_array_length(plan#>'{special_qualification,qualified_rule_ids}')=3,'flat composite qualification count differs from three');
  perform harness.assert_true((select count(*) from jsonb_array_elements(plan->'tasks') t where t->>'rule_id' in ('legal_problem','partner_agency','flat_ground') and t->>'owner_role'='lawyer')=3,'flat composite lawyer task count differs from three');

  p:=harness.special_composite('house_land');
  preview:=nav_v2_private.nav_v2_prepare_intake_legacy_save_special_v1(p,'78000000-0000-4000-8000-000000000003',ctx);
  perform harness.assert_true((preview->>'effective_supported_count')::integer=24,'house composite supported count differs from 24');
  perform harness.assert_true((preview->>'effective_unsupported_count')::integer=0,'house composite unsupported is not zero');
  plan:=nav_v2_private.nav_v2_build_governed_intake_write_plan_special_v1(p,'78000000-0000-4000-8000-000000000004',ctx);
  perform harness.assert_true((plan->>'allowed')::boolean,'house composite plan blocked');
  perform harness.assert_true(jsonb_array_length(plan#>'{special_qualification,qualified_rule_ids}')=3,'house composite qualification count differs from three');

  p:=jsonb_set(harness.special_partner_agency(),'{deal,intake_draft,documents}','[]'::jsonb,true);
  preview:=nav_v2_private.nav_v2_prepare_intake_legacy_save_special_v1(p,'78000000-0000-4000-8000-000000000005',ctx);
  perform harness.assert_true(preview#>'{legacy_parity,unsupported_rule_ids}' @> '["partner_agency"]'::jsonb,'missing partner document status qualified');
  plan:=nav_v2_private.nav_v2_build_governed_intake_write_plan_special_v1(p,'78000000-0000-4000-8000-000000000006',ctx);
  perform harness.assert_true(not (plan->>'allowed')::boolean,'missing partner document plan allowed');

  p:=harness.special_house_land(); rid:='78000000-0000-4000-8000-000000000007'; failed:=false;
  begin perform harness.mock_governed_intake_save_special_v1(p,rid,ctx,true); exception when sqlstate '40001' then failed:=true; end;
  perform harness.assert_true(failed,'final injected failure did not surface');
  perform harness.assert_true(not exists(select 1 from nav_v2_private.nav_v2_intake_save_requests_v1 where client_request_id=rid),'failed final request left ledger row');
  perform harness.assert_true(not exists(select 1 from harness.nav_v2_governed_deals where client_request_id=rid),'failed final request left shadow deal');
end;
$composites_and_negative$;

select jsonb_build_object(
  'result','Navigator v2 preview bundle final intake composite assertions passed',
  'catalog_supported_count',25,
  'catalog_unsupported_count',0,
  'production_ready',false
) as evidence;
