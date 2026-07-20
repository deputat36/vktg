\set ON_ERROR_STOP on

do $combined_and_negative$
declare p jsonb; preview jsonb; plan jsonb; ctx jsonb; failed boolean; rid uuid;
begin
 ctx:=harness.governed_intake_server_context();
 p:=harness.wave1_all_intake();
 preview:=nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(p,'75000000-0000-4000-8000-000000000001',ctx);
 perform harness.assert_true((preview->>'effective_supported_count')::integer=17,'combined effective supported count differs from 17');
 perform harness.assert_true((preview->>'effective_unsupported_count')::integer=0,'combined effective unsupported is not zero');
 plan:=nav_v2_private.nav_v2_build_governed_intake_write_plan_wave1_v1(p,'75000000-0000-4000-8000-000000000002',ctx);
 perform harness.assert_true((plan->>'allowed')::boolean,'combined wave1 plan blocked');
 perform harness.assert_true(jsonb_array_length(plan#>'{wave1_qualification,qualified_rule_ids}')=4,'combined qualification count differs from four');
 perform harness.assert_true(jsonb_array_length(plan->'documents')=6,'combined document count differs from six');
 perform harness.assert_true((select count(*) from jsonb_array_elements(plan->'tasks') t where t->>'owner_role'='lawyer')=4,'combined lawyer task count differs from four');
 perform harness.assert_true((select count(*) from jsonb_array_elements(plan->'risks') r where r->>'level'='red')=1,'combined red risk count differs from one');

 p:=jsonb_set(harness.base_intake(),'{deal,intake_action}','"lawyer"'::jsonb,true);
 p:=jsonb_set(p,'{deal,intake_draft,lawyerRequestConfirmed}','true'::jsonb,true);
 p:=harness.with_fact(p,'bankruptcy_risk','yes','client');
 p:=harness.with_document(p,'bankruptcy_check','requested');
 preview:=nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(p,'75000000-0000-4000-8000-000000000003',ctx);
 perform harness.assert_true(preview#>'{legacy_parity,unsupported_rule_ids}' @> '["bankruptcy_risk"]'::jsonb,'remaining unsupported rule escaped');
 plan:=nav_v2_private.nav_v2_build_governed_intake_write_plan_wave1_v1(p,'75000000-0000-4000-8000-000000000004',ctx);
 perform harness.assert_true(not (plan->>'allowed')::boolean,'remaining unsupported governed plan allowed');

 p:=jsonb_set(harness.base_intake(),'{deal,intake_action}','"lawyer"'::jsonb,true);
 p:=jsonb_set(p,'{deal,intake_draft,lawyerRequestConfirmed}','true'::jsonb,true);
 p:=harness.with_fact(p,'inheritance','yes','client');
 preview:=nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(p,'75000000-0000-4000-8000-000000000005',ctx);
 perform harness.assert_true(preview#>'{legacy_parity,unsupported_rule_ids}' @> '["inheritance"]'::jsonb,'missing document status qualified');

 p:=harness.wave1_intake('spouse','client'); rid:='75000000-0000-4000-8000-000000000006'; failed:=false;
 begin perform harness.mock_governed_intake_save_wave1_v1(p,rid,ctx,true); exception when sqlstate '40001' then failed:=true; end;
 perform harness.assert_true(failed,'injected wave1 failure did not surface');
 perform harness.assert_true(not exists(select 1 from nav_v2_private.nav_v2_intake_save_requests_v1 where client_request_id=rid),'failed wave1 request left ledger row');
 perform harness.assert_true(not exists(select 1 from harness.nav_v2_governed_deals where client_request_id=rid),'failed wave1 request left deal row');
end;
$combined_and_negative$;

select jsonb_build_object(
 'result','Navigator v2 intake semantics wave1 governed integration assertions passed',
 'effective_supported_count',17,'effective_unsupported_count',8,'writes_performed',false,'production_ready',false
) as evidence;
