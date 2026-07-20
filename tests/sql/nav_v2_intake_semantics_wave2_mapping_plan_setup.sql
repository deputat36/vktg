\set ON_ERROR_STOP on

create or replace function harness.wave2_mapping_plan(p_rule_id text)
returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,harness
as $function$
declare p jsonb; docs jsonb; risk jsonb; task jsonb; blocks_deposit boolean; blocks_deal boolean; decision text;
begin
 if p_rule_id='bankruptcy_risk' then
  blocks_deposit:=true; blocks_deal:=true;
  decision:='Оценить банкротный риск и допустимую конструкцию сделки.';
  docs:=jsonb_build_array(jsonb_build_object(
   'type','bankruptcy_check','title','Результат проверки банкротного риска','side','seller','status','available',
   'owner_id','63000000-0000-4000-8000-000000000001','gate_impact',jsonb_build_object('blocks_deposit',true,'blocks_deal',true)
  ));
 elsif p_rule_id='redevelopment' then
  blocks_deposit:=false; blocks_deal:=false;
  decision:='Определить влияние перепланировки на сделку и ипотеку.';
  docs:=jsonb_build_array(
   jsonb_build_object('type','technical_plan','title','Технический план или описание объекта','side','object','status','available','owner_id','63000000-0000-4000-8000-000000000001','gate_impact',jsonb_build_object('blocks_deposit',false,'blocks_deal',false)),
   jsonb_build_object('type','redevelopment_approval','title','Статус согласования перепланировки','side','object','status','requested','owner_id','63000000-0000-4000-8000-000000000001','gate_impact',jsonb_build_object('blocks_deposit',false,'blocks_deal',false))
  );
 elsif p_rule_id='after_registration' then
  blocks_deposit:=true; blocks_deal:=false;
  decision:='Подтвердить безопасные условия перечисления денег после регистрации.';
  docs:=jsonb_build_array(jsonb_build_object(
   'type','settlement_scheme','title','Согласованная схема расчётов','side','deal','status','requested',
   'owner_id','63000000-0000-4000-8000-000000000001','gate_impact',jsonb_build_object('blocks_deposit',true,'blocks_deal',false)
  ));
 elsif p_rule_id='certificate' then
  blocks_deposit:=false; blocks_deal:=false;
  decision:='Проверить условия сертификата и безопасный порядок расчётов.';
  docs:=jsonb_build_array(jsonb_build_object(
   'type','certificate_terms','title','Условия сертификата или субсидии','side','buyer','status','requested',
   'owner_id','63000000-0000-4000-8000-000000000002','gate_impact',jsonb_build_object('blocks_deposit',false,'blocks_deal',false)
  ));
 else
  raise exception 'unsupported wave2 mapping rule';
 end if;

 p:=harness.rule_plan(p_rule_id,'lawyer','yellow',null);
 risk:=jsonb_build_object(
  'id',p_rule_id,'level','yellow','owner','lawyer','blocks_deposit',blocks_deposit,'blocks_deal',blocks_deal,
  'owner_id','63000000-0000-4000-8000-000000000003','creation_state','planned'
 );
 task:=jsonb_build_object(
  'id','intake-rule:'||p_rule_id,'rule_id',p_rule_id,'owner_role','lawyer',
  'owner_id','63000000-0000-4000-8000-000000000003','action','Рассмотреть структурированный запрос.',
  'evidence','structured_document_statuses','expected_result',decision,
  'deadline_rule',case when blocks_deposit then 'before_deposit' when blocks_deal then 'before_deal' else 'next_review' end,
  'deadline',null,'gate_impact',jsonb_build_object('blocks_deposit',blocks_deposit,'blocks_deal',blocks_deal)
 );
 p:=jsonb_set(p,'{documents}',docs,true);
 p:=jsonb_set(p,'{risks}',jsonb_build_array(risk),true);
 p:=jsonb_set(p,'{tasks}',jsonb_build_array(task),true);
 p:=jsonb_set(p,'{wave2_qualification}',jsonb_build_object('qualified_rule_ids',jsonb_build_array(p_rule_id)),true);
 p:=jsonb_set(p,'{effective_supported_count}','21'::jsonb,true);
 p:=jsonb_set(p,'{effective_unsupported_count}','4'::jsonb,true);
 return p;
end;
$function$;

create or replace function harness.wave2_combined_mapping_plan()
returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,harness
as $function$
declare p jsonb; one jsonb; v_rule_id text;
begin
 p:=harness.wave2_mapping_plan('bankruptcy_risk');
 p:=jsonb_set(p,'{documents}','[]'::jsonb,true);
 p:=jsonb_set(p,'{risks}','[]'::jsonb,true);
 p:=jsonb_set(p,'{tasks}','[]'::jsonb,true);
 for v_rule_id in select unnest(array['bankruptcy_risk','redevelopment','after_registration','certificate']) loop
  one:=harness.wave2_mapping_plan(v_rule_id);
  p:=jsonb_set(p,'{documents}',(p->'documents')||(one->'documents'),true);
  p:=jsonb_set(p,'{risks}',(p->'risks')||(one->'risks'),true);
  p:=jsonb_set(p,'{tasks}',(p->'tasks')||(one->'tasks'),true);
 end loop;
 p:=jsonb_set(p,'{wave2_qualification}',jsonb_build_object('qualified_rule_ids','["bankruptcy_risk","redevelopment","after_registration","certificate"]'::jsonb),true);
 return p;
end;
$function$;
