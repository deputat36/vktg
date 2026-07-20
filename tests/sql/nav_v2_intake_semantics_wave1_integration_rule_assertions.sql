\set ON_ERROR_STOP on

do $contract$
begin
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(jsonb,uuid,jsonb)') is not null,'wave1 preview missing');
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_build_governed_intake_write_plan_wave1_v1(jsonb,uuid,jsonb)') is not null,'wave1 governed builder missing');
 perform harness.assert_true(not has_function_privilege('authenticated','nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(jsonb,uuid,jsonb)','EXECUTE'),'authenticated can execute wave1 preview');
 perform harness.assert_true(has_function_privilege('service_role','nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(jsonb,uuid,jsonb)','EXECUTE'),'service role lacks wave1 preview');
end;
$contract$;

do $rules$
declare
 rec record; p jsonb; base_preview jsonb; preview jsonb; base_plan jsonb; plan jsonb; ctx jsonb; rid uuid; first_result jsonb; replay_result jsonb;
begin
 ctx:=harness.governed_intake_server_context();
 for rec in select * from (values
  ('spouse','client',1,1,false,false,'yellow'),
  ('seller_absent','client',2,1,true,true,'yellow'),
  ('encumbrance','document',2,1,true,true,'red'),
  ('inheritance','document',1,1,true,false,'yellow')
 ) as t(rule_id,evidence_source,document_count,task_count,blocks_deposit,blocks_deal,risk_level)
 loop
  p:=harness.wave1_intake(rec.rule_id,rec.evidence_source);
  base_preview:=nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(p,md5('base-'||rec.rule_id)::uuid,ctx);
  perform harness.assert_true(base_preview#>'{legacy_parity,unsupported_rule_ids}' @> jsonb_build_array(rec.rule_id),'base preview no longer fails closed: '||rec.rule_id);
  preview:=nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(p,md5('preview-'||rec.rule_id)::uuid,ctx);
  perform harness.assert_true((preview#>>'{legacy_parity,rule_projection_complete}')::boolean,'wave1 parity incomplete: '||rec.rule_id);
  perform harness.assert_true(jsonb_array_length(preview#>'{legacy_parity,unsupported_rule_ids}')=0,'wave1 unsupported remains: '||rec.rule_id);
  perform harness.assert_true(preview#>'{wave1_qualification,qualified_rule_ids}' @> jsonb_build_array(rec.rule_id),'qualification missing: '||rec.rule_id);
  base_plan:=nav_v2_private.nav_v2_build_governed_intake_write_plan_v1(p,md5('plan-base-'||rec.rule_id)::uuid,ctx);
  perform harness.assert_true(not (base_plan->>'allowed')::boolean,'base governed plan unexpectedly allowed: '||rec.rule_id);
  plan:=nav_v2_private.nav_v2_build_governed_intake_write_plan_wave1_v1(p,md5('plan-'||rec.rule_id)::uuid,ctx);
  perform harness.assert_true((plan->>'allowed')::boolean,'wave1 governed plan blocked: '||rec.rule_id);
  perform harness.assert_true((plan->>'effective_supported_count')::integer=14,'single wave supported count mismatch');
  perform harness.assert_true(jsonb_array_length(plan->'documents')=rec.document_count,'document count mismatch: '||rec.rule_id);
  perform harness.assert_true((select count(*) from jsonb_array_elements(plan->'tasks') t where t->>'rule_id'=rec.rule_id and t->>'owner_role'='lawyer' and nullif(t->>'owner_id','') is not null)=rec.task_count,'lawyer task mismatch: '||rec.rule_id);
  perform harness.assert_true(exists(select 1 from jsonb_array_elements(plan->'risks') r where r->>'id'=rec.rule_id and r->>'level'=rec.risk_level and (r->>'blocks_deposit')::boolean=rec.blocks_deposit and (r->>'blocks_deal')::boolean=rec.blocks_deal),'risk contract mismatch: '||rec.rule_id);
  rid:=md5('save-'||rec.rule_id)::uuid;
  first_result:=harness.mock_governed_intake_save_wave1_v1(p,rid,ctx);
  replay_result:=harness.mock_governed_intake_save_wave1_v1(p,rid,ctx);
  perform harness.assert_true(not (first_result->>'idempotent')::boolean,'first save marked replay: '||rec.rule_id);
  perform harness.assert_true((replay_result->>'idempotent')::boolean,'exact replay not recovered: '||rec.rule_id);
  perform harness.assert_true((select count(*) from harness.nav_v2_governed_deals where client_request_id=rid)=1,'duplicate wave1 deal: '||rec.rule_id);
  perform harness.assert_true((select count(*) from harness.nav_v2_governed_tasks where client_request_id=rid and owner_role='lawyer')=1,'wave1 lawyer task row mismatch: '||rec.rule_id);
 end loop;
end;
$rules$;

select 'Navigator v2 intake semantics wave1 governed rule assertions passed' as result;
