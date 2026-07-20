\set ON_ERROR_STOP on

do $contract$
begin
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_prepare_intake_legacy_save_wave2_v1(jsonb,uuid,jsonb)') is not null,'wave2 preview missing');
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_build_governed_intake_write_plan_wave2_v1(jsonb,uuid,jsonb)') is not null,'wave2 governed builder missing');
 perform harness.assert_true(not has_function_privilege('authenticated','nav_v2_private.nav_v2_prepare_intake_legacy_save_wave2_v1(jsonb,uuid,jsonb)','EXECUTE'),'authenticated can execute wave2 preview');
 perform harness.assert_true(has_function_privilege('service_role','nav_v2_private.nav_v2_prepare_intake_legacy_save_wave2_v1(jsonb,uuid,jsonb)','EXECUTE'),'service role lacks wave2 preview');
end;
$contract$;

do $rules$
declare
 rec record; p jsonb; wave1_preview jsonb; preview jsonb; wave1_plan jsonb; plan jsonb; ctx jsonb; rid uuid; first_result jsonb; replay_result jsonb;
begin
 ctx:=harness.governed_intake_server_context();
 for rec in select * from (values
  ('bankruptcy_risk','client',1,1,true,true,'yellow','seller'),
  ('redevelopment','document',2,1,false,false,'yellow','object'),
  ('after_registration','client',1,1,true,false,'yellow','deal'),
  ('certificate','document',1,1,false,false,'yellow','buyer')
 ) as t(rule_id,evidence_source,document_count,task_count,blocks_deposit,blocks_deal,risk_level,document_side)
 loop
  p:=harness.wave2_intake(rec.rule_id,rec.evidence_source);
  wave1_preview:=nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(p,md5('wave1-'||rec.rule_id)::uuid,ctx);
  perform harness.assert_true(wave1_preview#>'{legacy_parity,unsupported_rule_ids}' @> jsonb_build_array(rec.rule_id),'wave1 preview no longer fails closed: '||rec.rule_id);
  preview:=nav_v2_private.nav_v2_prepare_intake_legacy_save_wave2_v1(p,md5('preview-'||rec.rule_id)::uuid,ctx);
  perform harness.assert_true((preview#>>'{legacy_parity,rule_projection_complete}')::boolean,'wave2 parity incomplete: '||rec.rule_id);
  perform harness.assert_true(jsonb_array_length(preview#>'{legacy_parity,unsupported_rule_ids}')=0,'wave2 unsupported remains: '||rec.rule_id);
  perform harness.assert_true(preview#>'{wave2_qualification,qualified_rule_ids}' @> jsonb_build_array(rec.rule_id),'wave2 qualification missing: '||rec.rule_id);
  perform harness.assert_true((preview->>'effective_supported_count')::integer=18,'single wave2 supported count mismatch');
  wave1_plan:=nav_v2_private.nav_v2_build_governed_intake_write_plan_wave1_v1(p,md5('plan-wave1-'||rec.rule_id)::uuid,ctx);
  perform harness.assert_true(not (wave1_plan->>'allowed')::boolean,'wave1 governed plan unexpectedly allowed: '||rec.rule_id);
  plan:=nav_v2_private.nav_v2_build_governed_intake_write_plan_wave2_v1(p,md5('plan-'||rec.rule_id)::uuid,ctx);
  perform harness.assert_true((plan->>'allowed')::boolean,'wave2 governed plan blocked: '||rec.rule_id);
  perform harness.assert_true(jsonb_array_length(plan->'documents')=rec.document_count,'document count mismatch: '||rec.rule_id);
  perform harness.assert_true((select count(*) from jsonb_array_elements(plan->'documents') d where d->>'side'=rec.document_side)=rec.document_count,'document side mismatch: '||rec.rule_id);
  perform harness.assert_true((select count(*) from jsonb_array_elements(plan->'tasks') t where t->>'rule_id'=rec.rule_id and t->>'owner_role'='lawyer' and nullif(t->>'owner_id','') is not null)=rec.task_count,'lawyer task mismatch: '||rec.rule_id);
  perform harness.assert_true(exists(select 1 from jsonb_array_elements(plan->'risks') r where r->>'id'=rec.rule_id and r->>'level'=rec.risk_level and (r->>'blocks_deposit')::boolean=rec.blocks_deposit and (r->>'blocks_deal')::boolean=rec.blocks_deal),'risk contract mismatch: '||rec.rule_id);
  rid:=md5('save-wave2-'||rec.rule_id)::uuid;
  first_result:=harness.mock_governed_intake_save_wave2_v1(p,rid,ctx);
  replay_result:=harness.mock_governed_intake_save_wave2_v1(p,rid,ctx);
  perform harness.assert_true(not (first_result->>'idempotent')::boolean,'first wave2 save marked replay: '||rec.rule_id);
  perform harness.assert_true((replay_result->>'idempotent')::boolean,'wave2 exact replay not recovered: '||rec.rule_id);
  perform harness.assert_true((select count(*) from harness.nav_v2_governed_deals where client_request_id=rid)=1,'duplicate wave2 deal: '||rec.rule_id);
  perform harness.assert_true((select count(*) from harness.nav_v2_governed_tasks where client_request_id=rid and owner_role='lawyer')=1,'wave2 lawyer task row mismatch: '||rec.rule_id);
 end loop;
end;
$rules$;

select 'Navigator v2 intake semantics wave2 governed rule assertions passed' as result;
