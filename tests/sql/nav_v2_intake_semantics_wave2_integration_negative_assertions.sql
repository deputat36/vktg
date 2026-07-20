\set ON_ERROR_STOP on

do $combined_and_negative$
declare p jsonb; preview jsonb; plan jsonb; ctx jsonb; failed boolean; rid uuid;
begin
 ctx:=harness.governed_intake_server_context();
 p:=harness.wave2_all_intake();
 preview:=nav_v2_private.nav_v2_prepare_intake_legacy_save_wave2_v1(p,'76000000-0000-4000-8000-000000000001',ctx);
 perform harness.assert_true((preview->>'effective_supported_count')::integer=21,'combined effective supported count differs from 21');
 perform harness.assert_true((preview->>'effective_unsupported_count')::integer=0,'combined wave2 effective unsupported is not zero');
 plan:=nav_v2_private.nav_v2_build_governed_intake_write_plan_wave2_v1(p,'76000000-0000-4000-8000-000000000002',ctx);
 perform harness.assert_true((plan->>'allowed')::boolean,'combined wave2 plan blocked');
 perform harness.assert_true(jsonb_array_length(plan#>'{wave2_qualification,qualified_rule_ids}')=4,'combined wave2 qualification count differs from four');
 perform harness.assert_true(jsonb_array_length(plan->'documents')=5,'combined wave2 document count differs from five');
 perform harness.assert_true((select count(*) from jsonb_array_elements(plan->'tasks') t where t->>'owner_role'='lawyer')=4,'combined wave2 lawyer task count differs from four');
 perform harness.assert_true(
  (select count(*) from jsonb_array_elements(plan->'risks') r
   where r->>'id' in ('bankruptcy_risk','redevelopment','after_registration','certificate') and r->>'level'='yellow')=4,
  'combined wave2 yellow risk count differs from four'
 );
 perform harness.assert_true(
  (select count(*) from jsonb_array_elements(plan->'risks') r where r->>'id' in ('settlements_not_agreed','expenses_not_agreed'))=2,
  'combined base SPN risk regression changed'
 );

 p:=jsonb_set(harness.base_intake(),'{deal,intake_action}','"lawyer"'::jsonb,true);
 p:=jsonb_set(p,'{deal,intake_draft,lawyerRequestConfirmed}','true'::jsonb,true);
 p:=jsonb_set(p,'{deal,intake_draft,stage}','"legal_problem"'::jsonb,true);
 preview:=nav_v2_private.nav_v2_prepare_intake_legacy_save_wave2_v1(p,'76000000-0000-4000-8000-000000000003',ctx);
 perform harness.assert_true(preview#>'{legacy_parity,unsupported_rule_ids}' @> '["legal_problem"]'::jsonb,'remaining special rule escaped');
 plan:=nav_v2_private.nav_v2_build_governed_intake_write_plan_wave2_v1(p,'76000000-0000-4000-8000-000000000004',ctx);
 perform harness.assert_true(not (plan->>'allowed')::boolean,'remaining special governed plan allowed');

 p:=jsonb_set(harness.base_intake(),'{deal,intake_action}','"lawyer"'::jsonb,true);
 p:=jsonb_set(p,'{deal,intake_draft,lawyerRequestConfirmed}','true'::jsonb,true);
 p:=harness.with_fact(p,'bankruptcy_risk','yes','client');
 preview:=nav_v2_private.nav_v2_prepare_intake_legacy_save_wave2_v1(p,'76000000-0000-4000-8000-000000000005',ctx);
 perform harness.assert_true(preview#>'{legacy_parity,unsupported_rule_ids}' @> '["bankruptcy_risk"]'::jsonb,'missing document status qualified');

 p:=harness.wave2_intake('certificate','client'); rid:='76000000-0000-4000-8000-000000000006'; failed:=false;
 begin perform harness.mock_governed_intake_save_wave2_v1(p,rid,ctx,true); exception when sqlstate '40001' then failed:=true; end;
 perform harness.assert_true(failed,'injected wave2 failure did not surface');
 perform harness.assert_true(not exists(select 1 from nav_v2_private.nav_v2_intake_save_requests_v1 where client_request_id=rid),'failed wave2 request left ledger row');
 perform harness.assert_true(not exists(select 1 from harness.nav_v2_governed_deals where client_request_id=rid),'failed wave2 request left deal row');
end;
$combined_and_negative$;

select jsonb_build_object(
 'result','Navigator v2 intake semantics wave2 governed integration assertions passed',
 'effective_supported_count',21,'effective_unsupported_count',4,'writes_performed',false,'production_ready',false
) as evidence;
