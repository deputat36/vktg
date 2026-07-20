\set ON_ERROR_STOP on

do $contract$
begin
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_map_governed_intake_to_production_special_v1(jsonb)') is not null,'final mapper missing');
 perform harness.assert_true(to_regprocedure('harness.write_mapping_special(uuid,jsonb)') is not null,'generated final writer missing');
 perform harness.assert_true(not has_function_privilege('authenticated','nav_v2_private.nav_v2_map_governed_intake_to_production_special_v1(jsonb)','EXECUTE'),'authenticated can execute final mapper');
 perform harness.assert_true(has_function_privilege('service_role','nav_v2_private.nav_v2_map_governed_intake_to_production_special_v1(jsonb)','EXECUTE'),'service role lacks final mapper');
end;
$contract$;

do $special_rules$
declare rec record; p jsonb; m jsonb; rid uuid; first_result jsonb; replay_result jsonb;
begin
 perform harness.assert_true((select count(*) from public.nav_deals_v2)=21,'final assertions require base 13 plus wave1 four plus wave2 four fixtures');
 for rec in select * from (values
  ('legal_problem','red',null,true,false,0),
  ('partner_agency','yellow','deal',false,false,1),
  ('flat_ground','yellow','object',true,false,2),
  ('house_land','yellow','object',false,false,3)
 ) as t(rule_id,risk_level,document_side,blocks_deposit,blocks_deal,document_count)
 loop
  p:=harness.special_mapping_plan(rec.rule_id);
  m:=nav_v2_private.nav_v2_map_governed_intake_to_production_special_v1(p);
  perform harness.assert_true((m->>'structurally_mappable')::boolean,'special rule not mappable: '||rec.rule_id);
  perform harness.assert_true(not (m->>'production_ready')::boolean,'final mapper claims production readiness');
  perform harness.assert_true((m->>'effective_supported_count')::integer=25,'effective supported count differs from 25');
  perform harness.assert_true((m->>'effective_unsupported_count')::integer=0,'effective unsupported count differs from zero');
  perform harness.assert_true(m->'rule_ids' @> jsonb_build_array(rec.rule_id),'mapped special rule id missing: '||rec.rule_id);
  perform harness.assert_true(m#>>'{deal,risk_level}'=rec.risk_level,'special deal risk mismatch: '||rec.rule_id);
  perform harness.assert_true((m#>>'{deal,lawyer_needed}')::boolean,'special lawyer route missing: '||rec.rule_id);
  perform harness.assert_true(jsonb_array_length(m->'documents')=rec.document_count,'special mapped document count mismatch: '||rec.rule_id);
  if rec.document_side is null then
   perform harness.assert_true(jsonb_array_length(m->'documents')=0,'legal_problem unexpectedly mapped documents');
  elsif rec.document_side in ('object','deal') then
   perform harness.assert_true(not exists(select 1 from jsonb_array_elements(m->'documents') d where d->>'side'<>'both' or d->>'source_hint'<>'intake_scope:'||rec.document_side),rec.document_side||' special scope mapping failed');
  end if;
  perform harness.assert_true(exists(select 1 from jsonb_array_elements(m->'risks') r where r->>'level'=rec.risk_level and (r->>'blocks_deposit')::boolean=rec.blocks_deposit and (r->>'blocks_deal')::boolean=rec.blocks_deal and r->>'assigned_role'='lawyer'),'special mapped risk contract mismatch: '||rec.rule_id);
  perform harness.assert_true(exists(select 1 from jsonb_array_elements(m->'tasks') t where t->>'source'='intake_v1:'||rec.rule_id and t->>'assigned_role'='lawyer' and t->>'task_type'='legal_blocker'),'special mapped lawyer task mismatch: '||rec.rule_id);
  rid:=md5('special-schema-'||rec.rule_id)::uuid;
  first_result:=harness.write_mapping_special(rid,p);
  replay_result:=harness.write_mapping_special(rid,p);
  perform harness.assert_true(not (first_result->>'idempotent')::boolean,'first special write marked replay');
  perform harness.assert_true((replay_result->>'idempotent')::boolean,'special exact replay not recovered');
  perform harness.assert_true((select count(*) from public.nav_deals_v2 where id=rid)=1,'special duplicate deal on replay');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2 where deal_id=rid and source='intake_v1:'||rec.rule_id)=1,'special task row count mismatch');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2 where deal_id=rid and source like 'auto_quality_%')=2,'privacy quality collision baseline changed');
  perform harness.assert_true((select due_date is null from public.nav_deal_tasks_v2 where deal_id=rid and source='intake_v1:'||rec.rule_id),'special intake task activated auto due date');
 end loop;
 perform harness.assert_true((select count(*) from public.nav_deals_v2)=25,'full 25-rule fixture inventory mismatch');
end;
$special_rules$;

do $compatible_composites$
declare p jsonb; m jsonb;
begin
 p:=harness.special_composite_mapping_plan('flat_ground');
 m:=nav_v2_private.nav_v2_map_governed_intake_to_production_special_v1(p);
 perform harness.assert_true(jsonb_array_length(m->'rule_ids')=3,'flat composite rule count differs from three');
 perform harness.assert_true(jsonb_array_length(m->'documents')=3,'flat composite document count differs from three');
 perform harness.assert_true(jsonb_array_length(m->'risks')=3,'flat composite risk count differs from three');
 perform harness.assert_true(jsonb_array_length(m->'tasks')=3,'flat composite task count differs from three');
 perform harness.assert_true(m#>>'{deal,risk_level}'='red','flat composite lost legal_problem red risk');

 p:=harness.special_composite_mapping_plan('house_land');
 m:=nav_v2_private.nav_v2_map_governed_intake_to_production_special_v1(p);
 perform harness.assert_true(jsonb_array_length(m->'rule_ids')=3,'house composite rule count differs from three');
 perform harness.assert_true(jsonb_array_length(m->'documents')=4,'house composite document count differs from four');
 perform harness.assert_true(jsonb_array_length(m->'risks')=3,'house composite risk count differs from three');
 perform harness.assert_true(jsonb_array_length(m->'tasks')=3,'house composite task count differs from three');
 perform harness.assert_true(m#>>'{deal,risk_level}'='red','house composite lost legal_problem red risk');
end;
$compatible_composites$;

select jsonb_build_object(
 'result','Navigator v2 final special semantics exact-schema assertions passed',
 'total_supported_fixtures',25,'effective_unsupported_count',0,'production_ready',false
) as evidence;
