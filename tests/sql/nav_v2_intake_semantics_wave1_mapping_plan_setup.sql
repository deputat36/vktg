\set ON_ERROR_STOP on

create or replace function harness.wave1_mapping_plan(p_rule_id text)
returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,harness
as $function$
declare p jsonb; docs jsonb; risk jsonb; task jsonb; level text; blocks_deposit boolean; blocks_deal boolean; decision text;
begin
 if p_rule_id='spouse' then
  level:='yellow'; blocks_deposit:=false; blocks_deal:=false;
  decision:='Определить, требуется ли согласие супруга и в какой форме.';
  docs:=jsonb_build_array(jsonb_build_object(
   'type','spouse_consent_status','title','Статус согласия супруга','side','seller','status','requested',
   'owner_id','63000000-0000-4000-8000-000000000001','gate_impact',jsonb_build_object('blocks_deposit',false,'blocks_deal',false)
  ));
 elsif p_rule_id='seller_absent' then
  level:='yellow'; blocks_deposit:=true; blocks_deal:=true;
  decision:='Определить допустимый способ участия продавца и необходимые полномочия представителя.';
  docs:=jsonb_build_array(
   jsonb_build_object('type','participation_plan','title','План участия продавца в сделке','side','seller','status','requested','owner_id','63000000-0000-4000-8000-000000000001','gate_impact',jsonb_build_object('blocks_deposit',true,'blocks_deal',true)),
   jsonb_build_object('type','power_of_attorney','title','Статус доверенности','side','seller','status','available','owner_id','63000000-0000-4000-8000-000000000001','gate_impact',jsonb_build_object('blocks_deposit',true,'blocks_deal',true))
  );
 elsif p_rule_id='encumbrance' then
  level:='red'; blocks_deposit:=true; blocks_deal:=true;
  decision:='Определить, можно ли продолжать сделку и как снять или учесть ограничение.';
  docs:=jsonb_build_array(
   jsonb_build_object('type','encumbrance_extract','title','Сведения об обременении или запрете','side','object','status','available','owner_id','63000000-0000-4000-8000-000000000001','gate_impact',jsonb_build_object('blocks_deposit',true,'blocks_deal',true)),
   jsonb_build_object('type','release_terms','title','Условия снятия ограничения','side','object','status','requested','owner_id','63000000-0000-4000-8000-000000000001','gate_impact',jsonb_build_object('blocks_deposit',true,'blocks_deal',true))
  );
 elsif p_rule_id='inheritance' then
  level:='yellow'; blocks_deposit:=true; blocks_deal:=false;
  decision:='Оценить основание права, наследников и возможность безопасного задатка.';
  docs:=jsonb_build_array(jsonb_build_object(
   'type','inheritance_certificate','title','Документ об основании наследования','side','seller','status','available',
   'owner_id','63000000-0000-4000-8000-000000000001','gate_impact',jsonb_build_object('blocks_deposit',true,'blocks_deal',false)
  ));
 else
  raise exception 'unsupported wave1 mapping rule';
 end if;

 p:=harness.rule_plan(p_rule_id,'lawyer',level,null);
 risk:=jsonb_build_object(
  'id',p_rule_id,'level',level,'owner','lawyer','blocks_deposit',blocks_deposit,'blocks_deal',blocks_deal,
  'owner_id','63000000-0000-4000-8000-000000000003','creation_state','planned'
 );
 task:=jsonb_build_object(
  'id','intake-rule:'||p_rule_id,'rule_id',p_rule_id,'owner_role','lawyer',
  'owner_id','63000000-0000-4000-8000-000000000003','action','Рассмотреть структурированный запрос.',
  'evidence','structured_document_statuses','expected_result',decision,'deadline_rule',case when blocks_deposit then 'before_deposit' when blocks_deal then 'before_deal' else 'next_review' end,
  'deadline',null,'gate_impact',jsonb_build_object('blocks_deposit',blocks_deposit,'blocks_deal',blocks_deal)
 );
 p:=jsonb_set(p,'{documents}',docs,true);
 p:=jsonb_set(p,'{risks}',jsonb_build_array(risk),true);
 p:=jsonb_set(p,'{tasks}',jsonb_build_array(task),true);
 p:=jsonb_set(p,'{wave1_qualification}',jsonb_build_object('qualified_rule_ids',jsonb_build_array(p_rule_id)),true);
 p:=jsonb_set(p,'{effective_supported_count}','17'::jsonb,true);
 p:=jsonb_set(p,'{effective_unsupported_count}','8'::jsonb,true);
 return p;
end;
$function$;

create or replace function harness.wave1_combined_mapping_plan()
returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,harness
as $function$
declare p jsonb; item jsonb; one jsonb;
begin
 p:=harness.wave1_mapping_plan('spouse');
 p:=jsonb_set(p,'{documents}','[]'::jsonb,true);
 p:=jsonb_set(p,'{risks}','[]'::jsonb,true);
 p:=jsonb_set(p,'{tasks}','[]'::jsonb,true);
 foreach item in array array['"spouse"'::jsonb,'"seller_absent"'::jsonb,'"encumbrance"'::jsonb,'"inheritance"'::jsonb] loop
  one:=harness.wave1_mapping_plan(item#>>'{}');
  p:=jsonb_set(p,'{documents}',p->'documents'||one->'documents',true);
  p:=jsonb_set(p,'{risks}',p->'risks'||one->'risks',true);
  p:=jsonb_set(p,'{tasks}',p->'tasks'||one->'tasks',true);
 end loop;
 p:=jsonb_set(p,'{wave1_qualification}',jsonb_build_object('qualified_rule_ids','["spouse","seller_absent","encumbrance","inheritance"]'::jsonb),true);
 return p;
end;
$function$;
