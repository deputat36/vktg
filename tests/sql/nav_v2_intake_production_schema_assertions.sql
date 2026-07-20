\set ON_ERROR_STOP on

create or replace function harness.rule_plan(
 p_rule_id text,
 p_owner_role text,
 p_risk_level text,
 p_document_side text default null
)
returns jsonb
language sql
immutable
set search_path=pg_catalog
as $$
 select jsonb_build_object(
  'allowed',true,
  'unsupported_rule_ids','[]'::jsonb,
  'deal',jsonb_build_object(
    'created_by','63000000-0000-4000-8000-000000000001',
    'lead_spn_id','63000000-0000-4000-8000-000000000001',
    'seller_spn_id','63000000-0000-4000-8000-000000000001',
    'buyer_spn_id','63000000-0000-4000-8000-000000000002',
    'lawyer_id','63000000-0000-4000-8000-000000000003',
    'broker_id','63000000-0000-4000-8000-000000000004',
    'representation_model','one_spn_both',
    'preparation_mode','deal',
    'object_type','flat_mkd',
    'address','тестовый ориентир',
    'wizard_snapshot',jsonb_build_object('deal',jsonb_build_object('intake_contract_version',1)),
    'legal_passport',jsonb_build_object('version',1,'spn_next_action','Выполнить следующий безопасный шаг.'),
    'intake_work_plan',jsonb_build_object('version',1)
  ),
  'participants',jsonb_build_array(
    jsonb_build_object('user_id','63000000-0000-4000-8000-000000000001','role_in_deal','verified_creator','side','company'),
    jsonb_build_object('user_id','63000000-0000-4000-8000-000000000001','role_in_deal','seller_spn','side','seller'),
    jsonb_build_object('user_id','63000000-0000-4000-8000-000000000002','role_in_deal','buyer_spn','side','buyer')
  ),
  'documents',case when p_document_side is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
    'type',p_rule_id||'_document','title','Документ '||p_rule_id,'side',p_document_side,
    'status','requested','owner_id','63000000-0000-4000-8000-000000000001',
    'gate_impact',jsonb_build_object('blocks_deposit',true,'blocks_deal',false)
  )) end,
  'risks',jsonb_build_array(jsonb_build_object(
    'id',p_rule_id,'title','Риск '||p_rule_id,'risk_level',p_risk_level,
    'owner',p_owner_role,'expected_decision','Принять структурированное решение.',
    'blocks_deposit',p_owner_role<>'broker','blocks_deal',false
  )),
  'tasks',jsonb_build_array(jsonb_build_object(
    'id','intake-rule:'||p_rule_id,'rule_id',p_rule_id,'owner_role',p_owner_role,
    'owner_id',case p_owner_role when 'lawyer' then '63000000-0000-4000-8000-000000000003'
                              when 'broker' then '63000000-0000-4000-8000-000000000004'
                              else '63000000-0000-4000-8000-000000000001' end,
    'action','Действие '||p_rule_id,'evidence','Структурированное подтверждение.',
    'expected_result','Зафиксированный результат.',
    'gate_impact',jsonb_build_object('blocks_deposit',p_owner_role<>'broker','blocks_deal',false)
  )),
  'created_event',jsonb_build_object(
    'actor_id','63000000-0000-4000-8000-000000000001',
    'event_data',jsonb_build_object('rule_id',p_rule_id)
  )
 );
$$;

create or replace function harness.write_mapping(p_request_id uuid,p_plan jsonb)
returns jsonb
language plpgsql
set search_path=pg_catalog,public,harness,nav_v2_private
as $$
declare
 m jsonb; d jsonb; item jsonb; result jsonb; existing jsonb;
begin
 select l.result into existing from harness.intake_request_ledger l where l.client_request_id=p_request_id;
 if found then return existing||jsonb_build_object('idempotent',true); end if;
 m:=nav_v2_private.nav_v2_map_governed_intake_to_production_v1(p_plan);
 d:=m->'deal';
 insert into public.nav_deals_v2(
   id,title,status,risk_level,created_by,manager_id,seller_spn_id,buyer_spn_id,lawyer_id,broker_id,
   representation_model,preparation_mode,object_type,address,readiness_deposit,readiness_deal,
   lawyer_needed,broker_needed,has_children,has_mortgage,has_matcap,has_nominal_child_money,
   expenses_agreed,settlements_agreed,documents_min_ready,deal_summary,wizard_snapshot,next_action,
   seller_name,buyer_name,seller_phone,buyer_phone
 ) values (
   p_request_id,d->>'title',(d->>'status')::public.nav_v2_deal_status,(d->>'risk_level')::public.nav_v2_risk_level,
   (d->>'created_by')::uuid,nullif(d->>'manager_id','')::uuid,nullif(d->>'seller_spn_id','')::uuid,
   nullif(d->>'buyer_spn_id','')::uuid,nullif(d->>'lawyer_id','')::uuid,nullif(d->>'broker_id','')::uuid,
   d->>'representation_model',d->>'preparation_mode',d->>'object_type',d->>'address',
   (d->>'readiness_deposit')::integer,(d->>'readiness_deal')::integer,
   (d->>'lawyer_needed')::boolean,(d->>'broker_needed')::boolean,(d->>'has_children')::boolean,
   (d->>'has_mortgage')::boolean,(d->>'has_matcap')::boolean,(d->>'has_nominal_child_money')::boolean,
   (d->>'expenses_agreed')::boolean,(d->>'settlements_agreed')::boolean,(d->>'documents_min_ready')::boolean,
   d->'deal_summary',d->'wizard_snapshot',d->>'next_action',d->>'seller_name',d->>'buyer_name',d->>'seller_phone',d->>'buyer_phone'
 );
 for item in select value from jsonb_array_elements(m->'participants') loop
  insert into public.nav_deal_participants_v2(deal_id,user_id,role_in_deal,side,can_view,can_edit,can_manage_tasks,can_view_finance)
  values(p_request_id,(item->>'user_id')::uuid,item->>'role_in_deal',(item->>'side')::public.nav_v2_side,
         (item->>'can_view')::boolean,(item->>'can_edit')::boolean,(item->>'can_manage_tasks')::boolean,(item->>'can_view_finance')::boolean);
 end loop;
 for item in select value from jsonb_array_elements(m->'documents') loop
  insert into public.nav_deal_documents_v2(deal_id,side,category,title,description,required_for_deposit,required_for_deal,is_required,status,source_hint,assigned_to,responsible_role,due_date)
  values(p_request_id,(item->>'side')::public.nav_v2_side,item->>'category',item->>'title',item->>'description',
         (item->>'required_for_deposit')::boolean,(item->>'required_for_deal')::boolean,(item->>'is_required')::boolean,
         item->>'status',item->>'source_hint',nullif(item->>'assigned_to','')::uuid,(item->>'responsible_role')::public.nav_v2_user_role,nullif(item->>'due_date','')::date);
 end loop;
 for item in select value from jsonb_array_elements(m->'risks') loop
  insert into public.nav_deal_risks_v2(deal_id,level,category,title,description,recommendation,blocks_deposit,blocks_deal,assigned_role)
  values(p_request_id,(item->>'level')::public.nav_v2_risk_level,item->>'category',item->>'title',item->>'description',item->>'recommendation',
         (item->>'blocks_deposit')::boolean,(item->>'blocks_deal')::boolean,(item->>'assigned_role')::public.nav_v2_user_role);
 end loop;
 for item in select value from jsonb_array_elements(m->'tasks') loop
  insert into public.nav_deal_tasks_v2(deal_id,title,description,assigned_to,assigned_role,status,priority,due_date,source,created_by,task_type,sla_days)
  values(p_request_id,item->>'title',item->>'description',(item->>'assigned_to')::uuid,(item->>'assigned_role')::public.nav_v2_user_role,
         (item->>'status')::public.nav_v2_task_status,(item->>'priority')::public.nav_v2_task_priority,nullif(item->>'due_date','')::date,
         item->>'source',(item->>'created_by')::uuid,item->>'task_type',nullif(item->>'sla_days','')::integer);
 end loop;
 item:=m->'created_event';
 insert into public.nav_deal_events_v2(deal_id,actor_id,event_type,event_title,event_data)
 values(p_request_id,(item->>'actor_id')::uuid,item->>'event_type',item->>'event_title',item->'event_data');
 result:=jsonb_build_object('deal_id',p_request_id,'idempotent',false,'mapping',m);
 insert into harness.intake_request_ledger values(p_request_id,result);
 return result;
end;
$$;

do $contract$
begin
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_map_governed_intake_to_production_v1(jsonb)') is not null,'mapper missing');
 perform harness.assert_true(not has_function_privilege('authenticated','nav_v2_private.nav_v2_map_governed_intake_to_production_v1(jsonb)','EXECUTE'),'authenticated can execute mapper');
 perform harness.assert_true(has_function_privilege('service_role','nav_v2_private.nav_v2_map_governed_intake_to_production_v1(jsonb)','EXECUTE'),'service role lacks mapper execute');
end;
$contract$;

do $rules$
declare
 rec record; p jsonb; m jsonb; rid uuid; first_result jsonb; replay_result jsonb;
begin
 for rec in select * from (values
  ('minor_seller','lawyer','red','deal'),
  ('minor_buyer','lawyer','red','buyer'),
  ('child_money','lawyer','red','buyer'),
  ('power_of_attorney','lawyer','yellow','seller'),
  ('shares','lawyer','yellow','object'),
  ('minor_registered','lawyer','yellow','object'),
  ('privatisation','lawyer','yellow','seller'),
  ('court_basis','lawyer','yellow','seller'),
  ('matcap','lawyer','yellow','deal'),
  ('mortgage','broker','info','buyer'),
  ('military_mortgage','broker','info','buyer'),
  ('settlements_not_agreed','spn','yellow',null),
  ('expenses_not_agreed','spn','yellow',null)
 ) as t(rule_id,owner_role,risk_level,document_side)
 loop
  p:=harness.rule_plan(rec.rule_id,rec.owner_role,rec.risk_level,rec.document_side);
  m:=nav_v2_private.nav_v2_map_governed_intake_to_production_v1(p);
  perform harness.assert_true((m->>'structurally_mappable')::boolean,'supported rule not structurally mappable: '||rec.rule_id);
  perform harness.assert_true(not (m->>'production_ready')::boolean,'mapper claims production readiness');
  perform harness.assert_true(m->'production_blockers' ? 'privacy_quality_task_collision','trigger blocker missing');
  if rec.document_side in ('object','deal') then
   perform harness.assert_true(m #>> '{documents,0,side}'='both','scope enum mapping failed: '||rec.rule_id);
   perform harness.assert_true(m #>> '{documents,0,source_hint}'='intake_scope:'||rec.document_side,'original scope lost: '||rec.rule_id);
  end if;
  if rec.risk_level='info' then perform harness.assert_true(m #>> '{risks,0,level}'='green','info risk enum mapping failed'); end if;
  perform harness.assert_true(m #>> '{tasks,0,source}'='intake_v1:'||rec.rule_id,'safe task source missing');
  rid:=md5(rec.rule_id)::uuid;
  first_result:=harness.write_mapping(rid,p);
  replay_result:=harness.write_mapping(rid,p);
  perform harness.assert_true(not (first_result->>'idempotent')::boolean,'first write marked replay');
  perform harness.assert_true((replay_result->>'idempotent')::boolean,'exact replay not recovered');
  perform harness.assert_true((select count(*) from public.nav_deals_v2 where id=rid)=1,'duplicate deal on replay');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2 where deal_id=rid and source='intake_v1:'||rec.rule_id)=1,'mapped task count mismatch');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2 where deal_id=rid and source like 'auto_quality_%')=2,'privacy/quality collision was not reproduced');
  perform harness.assert_true((select due_date is null from public.nav_deal_tasks_v2 where deal_id=rid and source='intake_v1:'||rec.rule_id),'intake source activated auto due date');
 end loop;
 perform harness.assert_true((select count(*) from public.nav_deals_v2)=13,'supported fixture count mismatch');
end;
$rules$;

do $negative$
declare p jsonb; failed boolean:=false;
begin
 p:=harness.rule_plan('spouse','lawyer','yellow','seller');
 p:=jsonb_set(p,'{unsupported_rule_ids}','["spouse"]'::jsonb,true);
 begin perform nav_v2_private.nav_v2_map_governed_intake_to_production_v1(p); exception when sqlstate '22023' then failed:=true; end;
 perform harness.assert_true(failed,'unsupported rule did not fail closed');
 failed:=false;
 p:=harness.rule_plan('minor_seller','lawyer','red','deal');
 p:=jsonb_set(p,'{participants,0,user_id}','"63000000-0000-4000-8000-999999999999"'::jsonb,true);
 begin perform harness.write_mapping('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',p); exception when foreign_key_violation then failed:=true; end;
 perform harness.assert_true(failed,'invalid owner did not hit production FK');
 perform harness.assert_true(not exists(select 1 from public.nav_deals_v2 where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'failed write was not atomic');
end;
$negative$;

select 'Navigator v2 production schema mapping PostgreSQL 17 assertions passed' as result;
