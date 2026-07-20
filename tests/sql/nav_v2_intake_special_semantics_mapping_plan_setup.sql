\set ON_ERROR_STOP on

create or replace function harness.special_mapping_plan(p_rule_id text)
returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,harness
as $function$
declare p jsonb; docs jsonb; risk jsonb; task jsonb; level text; blocks_deposit boolean; blocks_deal boolean; decision text; evidence text;
begin
 if p_rule_id='legal_problem' then
  level:='red'; blocks_deposit:=true; blocks_deal:=false;
  decision:='Определить первый безопасный шаг и перечень данных, необходимых для решения.';
  evidence:='structured_legal_decision'; docs:='[]'::jsonb;
 elsif p_rule_id='partner_agency' then
  level:='yellow'; blocks_deposit:=false; blocks_deal:=false;
  decision:='Подтвердить границы ответственности и комплект документов сторон.';
  evidence:='structured_document_statuses';
  docs:=jsonb_build_array(jsonb_build_object(
   'type','partner_responsibility_note','title','Распределение ответственности с партнёром','side','deal','status','available',
   'owner_id','63000000-0000-4000-8000-000000000001','rule_ids',jsonb_build_array(p_rule_id),
   'gate_impact',jsonb_build_object('blocks_deposit',false,'blocks_deal',false)
  ));
 elsif p_rule_id='flat_ground' then
  level:='yellow'; blocks_deposit:=true; blocks_deal:=false;
  decision:='Проверить связь помещения с землёй, входом и коммуникациями.';
  evidence:='structured_document_statuses';
  docs:=jsonb_build_array(
   jsonb_build_object('type','land_status','title','Статус земли','side','object','status','available','owner_id','63000000-0000-4000-8000-000000000001','rule_ids',jsonb_build_array(p_rule_id),'gate_impact',jsonb_build_object('blocks_deposit',true,'blocks_deal',false)),
   jsonb_build_object('type','object_title_basis','title','Основание права на объект','side','object','status','requested','owner_id','63000000-0000-4000-8000-000000000001','rule_ids',jsonb_build_array(p_rule_id),'gate_impact',jsonb_build_object('blocks_deposit',true,'blocks_deal',false))
  );
 elsif p_rule_id='house_land' then
  level:='yellow'; blocks_deposit:=false; blocks_deal:=false;
  decision:='Подтвердить комплект и согласованность документов на дом и участок.';
  evidence:='structured_document_statuses';
  docs:=jsonb_build_array(
   jsonb_build_object('type','house_title_basis','title','Основание права на дом','side','object','status','available','owner_id','63000000-0000-4000-8000-000000000001','rule_ids',jsonb_build_array(p_rule_id),'gate_impact',jsonb_build_object('blocks_deposit',false,'blocks_deal',false)),
   jsonb_build_object('type','land_title_basis','title','Основание права на участок','side','object','status','available','owner_id','63000000-0000-4000-8000-000000000001','rule_ids',jsonb_build_array(p_rule_id),'gate_impact',jsonb_build_object('blocks_deposit',false,'blocks_deal',false)),
   jsonb_build_object('type','boundary_status','title','Статус границ участка','side','object','status','requested','owner_id','63000000-0000-4000-8000-000000000001','rule_ids',jsonb_build_array(p_rule_id),'gate_impact',jsonb_build_object('blocks_deposit',false,'blocks_deal',false))
  );
 else
  raise exception 'unsupported special mapping rule';
 end if;

 p:=harness.rule_plan(p_rule_id,'lawyer',level,null);
 risk:=jsonb_build_object(
  'id',p_rule_id,'level',level,'owner','lawyer','blocks_deposit',blocks_deposit,'blocks_deal',blocks_deal,
  'owner_id','63000000-0000-4000-8000-000000000003','creation_state','planned'
 );
 task:=jsonb_build_object(
  'id','intake-rule:'||p_rule_id,'rule_id',p_rule_id,'owner_role','lawyer',
  'owner_id','63000000-0000-4000-8000-000000000003','action','Рассмотреть структурированный запрос.',
  'evidence',evidence,'expected_result',decision,
  'deadline_rule',case when blocks_deposit then 'before_deposit' when blocks_deal then 'before_deal' else 'next_review' end,
  'deadline',null,'gate_impact',jsonb_build_object('blocks_deposit',blocks_deposit,'blocks_deal',blocks_deal)
 );
 p:=jsonb_set(p,'{documents}',docs,true);
 p:=jsonb_set(p,'{risks}',jsonb_build_array(risk),true);
 p:=jsonb_set(p,'{tasks}',jsonb_build_array(task),true);
 p:=jsonb_set(p,'{special_qualification}',jsonb_build_object('qualified_rule_ids',jsonb_build_array(p_rule_id)),true);
 p:=jsonb_set(p,'{effective_supported_count}','25'::jsonb,true);
 p:=jsonb_set(p,'{effective_unsupported_count}','0'::jsonb,true);
 return p;
end;
$function$;

create or replace function harness.special_composite_mapping_plan(p_object_rule text)
returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,harness
as $function$
declare p jsonb; one jsonb; v_rule_id text; v_rules text[];
begin
 if p_object_rule='flat_ground' then
  v_rules:=array['legal_problem','partner_agency','flat_ground'];
 elsif p_object_rule='house_land' then
  v_rules:=array['legal_problem','partner_agency','house_land'];
 else
  raise exception 'unsupported special composite mapping object';
 end if;
 p:=harness.special_mapping_plan('legal_problem');
 p:=jsonb_set(p,'{documents}','[]'::jsonb,true);
 p:=jsonb_set(p,'{risks}','[]'::jsonb,true);
 p:=jsonb_set(p,'{tasks}','[]'::jsonb,true);
 for v_rule_id in select unnest(v_rules) loop
  one:=harness.special_mapping_plan(v_rule_id);
  p:=jsonb_set(p,'{documents}',(p->'documents')||(one->'documents'),true);
  p:=jsonb_set(p,'{risks}',(p->'risks')||(one->'risks'),true);
  p:=jsonb_set(p,'{tasks}',(p->'tasks')||(one->'tasks'),true);
 end loop;
 p:=jsonb_set(p,'{special_qualification}',jsonb_build_object('qualified_rule_ids',to_jsonb(v_rules)),true);
 return p;
end;
$function$;
