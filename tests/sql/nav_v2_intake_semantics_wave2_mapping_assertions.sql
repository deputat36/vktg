\set ON_ERROR_STOP on

do $contract$
begin
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_map_governed_intake_to_production_wave2_v1(jsonb)') is not null,'wave2 mapper missing');
 perform harness.assert_true(not has_function_privilege('authenticated','nav_v2_private.nav_v2_map_governed_intake_to_production_wave2_v1(jsonb)','EXECUTE'),'authenticated can execute wave2 mapper');
 perform harness.assert_true(has_function_privilege('service_role','nav_v2_private.nav_v2_map_governed_intake_to_production_wave2_v1(jsonb)','EXECUTE'),'service role lacks wave2 mapper');
end;
$contract$;

do $wave2_rules$
declare rec record; p jsonb; m jsonb; rid uuid; first_result jsonb; replay_result jsonb;
begin
 perform harness.assert_true((select count(*) from public.nav_deals_v2)=17,'wave2 assertions require base 13 plus wave1 four fixtures');
 for rec in select * from (values
  ('bankruptcy_risk','yellow','seller',true,true,1),
  ('redevelopment','yellow','object',false,false,2),
  ('after_registration','yellow','deal',true,false,1),
  ('certificate','yellow','buyer',false,false,1)
 ) as t(rule_id,risk_level,document_side,blocks_deposit,blocks_deal,document_count)
 loop
  p:=harness.wave2_mapping_plan(rec.rule_id);
  m:=nav_v2_private.nav_v2_map_governed_intake_to_production_wave2_v1(p);
  perform harness.assert_true((m->>'structurally_mappable')::boolean,'wave2 rule not mappable: '||rec.rule_id);
  perform harness.assert_true(not (m->>'production_ready')::boolean,'wave2 mapper claims production readiness');
  perform harness.assert_true((m->>'effective_supported_count')::integer=21,'effective supported count differs from 21');
  perform harness.assert_true((m->>'effective_unsupported_count')::integer=4,'effective unsupported count differs from 4');
  perform harness.assert_true(m->'rule_ids' @> jsonb_build_array(rec.rule_id),'mapped wave2 rule id missing: '||rec.rule_id);
  perform harness.assert_true(m#>>'{deal,risk_level}'=rec.risk_level,'wave2 deal risk mismatch: '||rec.rule_id);
  perform harness.assert_true((m#>>'{deal,lawyer_needed}')::boolean,'wave2 lawyer route missing: '||rec.rule_id);
  perform harness.assert_true(jsonb_array_length(m->'documents')=rec.document_count,'wave2 mapped document count mismatch: '||rec.rule_id);
  if rec.document_side in ('object','deal') then
   perform harness.assert_true(not exists(select 1 from jsonb_array_elements(m->'documents') d where d->>'side'<>'both' or d->>'source_hint'<>'intake_scope:'||rec.document_side),rec.document_side||' scope mapping failed');
  else
   perform harness.assert_true(not exists(select 1 from jsonb_array_elements(m->'documents') d where d->>'side'<>rec.document_side or d->>'source_hint'<>'intake_scope:'||rec.document_side),rec.document_side||' scope mapping failed');
  end if;
  perform harness.assert_true(exists(select 1 from jsonb_array_elements(m->'risks') r where r->>'level'=rec.risk_level and (r->>'blocks_deposit')::boolean=rec.blocks_deposit and (r->>'blocks_deal')::boolean=rec.blocks_deal and r->>'assigned_role'='lawyer'),'wave2 mapped risk contract mismatch: '||rec.rule_id);
  perform harness.assert_true(exists(select 1 from jsonb_array_elements(m->'tasks') t where t->>'source'='intake_v1:'||rec.rule_id and t->>'assigned_role'='lawyer' and t->>'task_type'='legal_blocker'),'wave2 mapped lawyer task mismatch: '||rec.rule_id);
  rid:=md5('wave2-schema-'||rec.rule_id)::uuid;
  first_result:=harness.write_mapping_wave2(rid,p);
  replay_result:=harness.write_mapping_wave2(rid,p);
  perform harness.assert_true(not (first_result->>'idempotent')::boolean,'first wave2 write marked replay');
  perform harness.assert_true((replay_result->>'idempotent')::boolean,'wave2 exact replay not recovered');
  perform harness.assert_true((select count(*) from public.nav_deals_v2 where id=rid)=1,'wave2 duplicate deal on replay');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2 where deal_id=rid and source='intake_v1:'||rec.rule_id)=1,'wave2 task row count mismatch');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2 where deal_id=rid and source like 'auto_quality_%')=2,'privacy quality collision baseline changed');
  perform harness.assert_true((select due_date is null from public.nav_deal_tasks_v2 where deal_id=rid and source='intake_v1:'||rec.rule_id),'wave2 intake task activated auto due date');
 end loop;
 perform harness.assert_true((select count(*) from public.nav_deals_v2)=21,'base 13 plus wave1 four plus wave2 four fixture count mismatch');
end;
$wave2_rules$;

do $combined$
declare p jsonb; m jsonb;
begin
 p:=harness.wave2_combined_mapping_plan();
 m:=nav_v2_private.nav_v2_map_governed_intake_to_production_wave2_v1(p);
 perform harness.assert_true(jsonb_array_length(m->'rule_ids')=4,'combined wave2 rule count differs from four');
 perform harness.assert_true(jsonb_array_length(m->'documents')=5,'combined wave2 document count differs from five');
 perform harness.assert_true(jsonb_array_length(m->'risks')=4,'combined wave2 risk count differs from four');
 perform harness.assert_true(jsonb_array_length(m->'tasks')=4,'combined wave2 task count differs from four');
 perform harness.assert_true(m#>>'{deal,risk_level}'='yellow','combined wave2 deal risk is not yellow');
 perform harness.assert_true(not exists(select 1 from jsonb_array_elements(m->'tasks') t where t->>'assigned_role'<>'lawyer' or t->>'task_type'<>'legal_blocker'),'combined wave2 task escaped lawyer scope');
 perform harness.assert_true((select count(*) from jsonb_array_elements(m->'documents') d where d->>'source_hint'='intake_scope:seller')=1,'combined seller document count mismatch');
 perform harness.assert_true((select count(*) from jsonb_array_elements(m->'documents') d where d->>'source_hint'='intake_scope:object')=2,'combined object document count mismatch');
 perform harness.assert_true((select count(*) from jsonb_array_elements(m->'documents') d where d->>'source_hint'='intake_scope:deal')=1,'combined deal document count mismatch');
 perform harness.assert_true((select count(*) from jsonb_array_elements(m->'documents') d where d->>'source_hint'='intake_scope:buyer')=1,'combined buyer document count mismatch');
end;
$combined$;

select jsonb_build_object(
 'result','Navigator v2 intake semantics wave2 exact-schema mapping assertions passed',
 'total_supported_fixtures',21,'effective_unsupported_count',4,'production_ready',false
) as evidence;
