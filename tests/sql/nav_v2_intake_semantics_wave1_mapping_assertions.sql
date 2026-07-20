\set ON_ERROR_STOP on

do $contract$
begin
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_map_governed_intake_to_production_wave1_v1(jsonb)') is not null,'wave1 mapper missing');
 perform harness.assert_true(not has_function_privilege('authenticated','nav_v2_private.nav_v2_map_governed_intake_to_production_wave1_v1(jsonb)','EXECUTE'),'authenticated can execute wave1 mapper');
 perform harness.assert_true(has_function_privilege('service_role','nav_v2_private.nav_v2_map_governed_intake_to_production_wave1_v1(jsonb)','EXECUTE'),'service role lacks wave1 mapper');
end;
$contract$;

do $wave1_rules$
declare rec record; p jsonb; m jsonb; rid uuid; first_result jsonb; replay_result jsonb;
begin
 for rec in select * from (values
  ('spouse','yellow','seller',false,false,1),
  ('seller_absent','yellow','seller',true,true,2),
  ('encumbrance','red','object',true,true,2),
  ('inheritance','yellow','seller',true,false,1)
 ) as t(rule_id,risk_level,document_side,blocks_deposit,blocks_deal,document_count)
 loop
  p:=harness.wave1_mapping_plan(rec.rule_id);
  m:=nav_v2_private.nav_v2_map_governed_intake_to_production_wave1_v1(p);
  perform harness.assert_true((m->>'structurally_mappable')::boolean,'wave1 rule not mappable: '||rec.rule_id);
  perform harness.assert_true(not (m->>'production_ready')::boolean,'wave1 mapper claims production readiness');
  perform harness.assert_true((m->>'effective_supported_count')::integer=17,'effective supported count differs from 17');
  perform harness.assert_true((m->>'effective_unsupported_count')::integer=8,'effective unsupported count differs from 8');
  perform harness.assert_true(m->'rule_ids' @> jsonb_build_array(rec.rule_id),'mapped rule id missing: '||rec.rule_id);
  perform harness.assert_true(m#>>'{deal,risk_level}'=rec.risk_level,'deal risk mismatch: '||rec.rule_id);
  perform harness.assert_true((m#>>'{deal,lawyer_needed}')::boolean,'lawyer route missing: '||rec.rule_id);
  perform harness.assert_true(jsonb_array_length(m->'documents')=rec.document_count,'mapped document count mismatch: '||rec.rule_id);
  if rec.document_side='object' then
   perform harness.assert_true(not exists(select 1 from jsonb_array_elements(m->'documents') d where d->>'side'<>'both' or d->>'source_hint'<>'intake_scope:object'),'object scope mapping failed');
  else
   perform harness.assert_true(not exists(select 1 from jsonb_array_elements(m->'documents') d where d->>'side'<>'seller'),'seller scope mapping failed');
  end if;
  perform harness.assert_true(exists(select 1 from jsonb_array_elements(m->'risks') r where r->>'level'=rec.risk_level and (r->>'blocks_deposit')::boolean=rec.blocks_deposit and (r->>'blocks_deal')::boolean=rec.blocks_deal and r->>'assigned_role'='lawyer'),'mapped risk contract mismatch: '||rec.rule_id);
  perform harness.assert_true(exists(select 1 from jsonb_array_elements(m->'tasks') t where t->>'source'='intake_v1:'||rec.rule_id and t->>'assigned_role'='lawyer' and t->>'task_type'='legal_blocker'),'mapped lawyer task mismatch: '||rec.rule_id);
  rid:=md5('wave1-schema-'||rec.rule_id)::uuid;
  first_result:=harness.write_mapping_wave1(rid,p);
  replay_result:=harness.write_mapping_wave1(rid,p);
  perform harness.assert_true(not (first_result->>'idempotent')::boolean,'first wave1 write marked replay');
  perform harness.assert_true((replay_result->>'idempotent')::boolean,'wave1 exact replay not recovered');
  perform harness.assert_true((select count(*) from public.nav_deals_v2 where id=rid)=1,'wave1 duplicate deal on replay');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2 where deal_id=rid and source='intake_v1:'||rec.rule_id)=1,'wave1 task row count mismatch');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2 where deal_id=rid and source like 'auto_quality_%')=2,'privacy quality collision baseline changed');
  perform harness.assert_true((select due_date is null from public.nav_deal_tasks_v2 where deal_id=rid and source='intake_v1:'||rec.rule_id),'intake task activated auto due date');
 end loop;
 perform harness.assert_true((select count(*) from public.nav_deals_v2)=17,'base 13 plus wave1 four fixture count mismatch');
end;
$wave1_rules$;

do $combined$
declare p jsonb; m jsonb;
begin
 p:=harness.wave1_combined_mapping_plan();
 m:=nav_v2_private.nav_v2_map_governed_intake_to_production_wave1_v1(p);
 perform harness.assert_true(jsonb_array_length(m->'rule_ids')=4,'combined rule count differs from four');
 perform harness.assert_true(jsonb_array_length(m->'documents')=6,'combined document count differs from six');
 perform harness.assert_true(jsonb_array_length(m->'risks')=4,'combined risk count differs from four');
 perform harness.assert_true(jsonb_array_length(m->'tasks')=4,'combined task count differs from four');
 perform harness.assert_true(m#>>'{deal,risk_level}'='red','combined deal risk is not red');
 perform harness.assert_true(not exists(select 1 from jsonb_array_elements(m->'tasks') t where t->>'assigned_role'<>'lawyer' or t->>'task_type'<>'legal_blocker'),'combined task escaped lawyer scope');
end;
$combined$;

select jsonb_build_object(
 'result','Navigator v2 intake semantics wave1 exact-schema mapping assertions passed',
 'total_supported_fixtures',17,'effective_unsupported_count',8,'production_ready',false
) as evidence;
