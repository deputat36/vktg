\set ON_ERROR_STOP on

do $contract$
begin
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_prepare_intake_legacy_save_special_v1(jsonb,uuid,jsonb)') is not null,'final preview missing');
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_build_governed_intake_write_plan_special_v1(jsonb,uuid,jsonb)') is not null,'final governed builder missing');
 perform harness.assert_true(not has_function_privilege('authenticated','nav_v2_private.nav_v2_prepare_intake_legacy_save_special_v1(jsonb,uuid,jsonb)','EXECUTE'),'authenticated can execute final preview');
 perform harness.assert_true(has_function_privilege('service_role','nav_v2_private.nav_v2_prepare_intake_legacy_save_special_v1(jsonb,uuid,jsonb)','EXECUTE'),'service role lacks final preview');
end;
$contract$;

do $single_rules$
declare rec record; p jsonb; wave2_preview jsonb; preview jsonb; wave2_plan jsonb; plan jsonb; ctx jsonb; rid uuid; first_result jsonb; replay_result jsonb;
begin
 ctx:=harness.governed_intake_server_context();
 for rec in select * from (values
  ('legal_problem',0,'red',true,false),
  ('partner_agency',1,'yellow',false,false),
  ('flat_ground',2,'yellow',true,false),
  ('house_land',3,'yellow',false,false)
 ) as t(rule_id,document_count,risk_level,blocks_deposit,blocks_deal)
 loop
  p:=case rec.rule_id
   when 'legal_problem' then harness.special_legal_problem()
   when 'partner_agency' then harness.special_partner_agency()
   when 'flat_ground' then harness.special_flat_ground()
   else harness.special_house_land()
  end;
  wave2_preview:=nav_v2_private.nav_v2_prepare_intake_legacy_save_wave2_v1(p,md5('wave2-'||rec.rule_id)::uuid,ctx);
  perform harness.assert_true(wave2_preview#>'{legacy_parity,unsupported_rule_ids}' @> jsonb_build_array(rec.rule_id),'wave2 preview no longer fails closed: '||rec.rule_id);
  preview:=nav_v2_private.nav_v2_prepare_intake_legacy_save_special_v1(p,md5('preview-'||rec.rule_id)::uuid,ctx);
  perform harness.assert_true((preview#>>'{legacy_parity,rule_projection_complete}')::boolean,'final parity incomplete: '||rec.rule_id);
  perform harness.assert_true(jsonb_array_length(preview#>'{legacy_parity,unsupported_rule_ids}')=0,'final unsupported remains: '||rec.rule_id);
  perform harness.assert_true(preview#>'{special_qualification,qualified_rule_ids}' @> jsonb_build_array(rec.rule_id),'special qualification missing: '||rec.rule_id);
  perform harness.assert_true((preview->>'effective_supported_count')::integer=22,'single special supported count mismatch');
  perform harness.assert_true((preview#>>'{gates,production_call,allowed}')::boolean is false,'production call became allowed');
  wave2_plan:=nav_v2_private.nav_v2_build_governed_intake_write_plan_wave2_v1(p,md5('plan-wave2-'||rec.rule_id)::uuid,ctx);
  perform harness.assert_true(not (wave2_plan->>'allowed')::boolean,'wave2 plan unexpectedly allowed: '||rec.rule_id);
  plan:=nav_v2_private.nav_v2_build_governed_intake_write_plan_special_v1(p,md5('plan-'||rec.rule_id)::uuid,ctx);
  perform harness.assert_true((plan->>'allowed')::boolean,'final plan blocked: '||rec.rule_id);
  perform harness.assert_true((select count(*) from jsonb_array_elements(plan->'documents') d where coalesce(d->'rule_ids','[]'::jsonb) @> jsonb_build_array(rec.rule_id))=rec.document_count,'special document count mismatch: '||rec.rule_id);
  perform harness.assert_true(exists(select 1 from jsonb_array_elements(plan->'tasks') t where t->>'rule_id'=rec.rule_id and t->>'owner_role'='lawyer' and nullif(t->>'owner_id','') is not null),'special lawyer task mismatch: '||rec.rule_id);
  perform harness.assert_true(exists(select 1 from jsonb_array_elements(plan->'risks') r where r->>'id'=rec.rule_id and r->>'level'=rec.risk_level and (r->>'blocks_deposit')::boolean=rec.blocks_deposit and (r->>'blocks_deal')::boolean=rec.blocks_deal),'special risk mismatch: '||rec.rule_id);
  rid:=md5('save-final-'||rec.rule_id)::uuid;
  first_result:=harness.mock_governed_intake_save_special_v1(p,rid,ctx);
  replay_result:=harness.mock_governed_intake_save_special_v1(p,rid,ctx);
  perform harness.assert_true(not (first_result->>'idempotent')::boolean,'first final save marked replay');
  perform harness.assert_true((replay_result->>'idempotent')::boolean,'final exact replay not recovered');
  perform harness.assert_true((select count(*) from harness.nav_v2_governed_deals where client_request_id=rid)=1,'duplicate final shadow deal');
 end loop;
end;
$single_rules$;

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
 'result','Navigator v2 final special semantics governed assertions passed',
 'catalog_supported_count',25,'catalog_unsupported_count',0,'production_ready',false
) as evidence;
