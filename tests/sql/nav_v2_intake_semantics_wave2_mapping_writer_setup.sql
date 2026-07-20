\set ON_ERROR_STOP on

create or replace function harness.write_mapping_wave2(p_request_id uuid,p_plan jsonb)
returns jsonb
language plpgsql
set search_path=pg_catalog,public,harness,nav_v2_private
as $function$
declare m jsonb; d jsonb; item jsonb; result jsonb; existing jsonb;
begin
 select l.result into existing from harness.intake_request_ledger l where l.client_request_id=p_request_id;
 if found then return existing||jsonb_build_object('idempotent',true); end if;
 m:=nav_v2_private.nav_v2_map_governed_intake_to_production_wave2_v1(p_plan);
 d:=m->'deal';
 insert into public.nav_deals_v2(
  id,title,status,risk_level,created_by,manager_id,seller_spn_id,buyer_spn_id,lawyer_id,broker_id,
  representation_model,preparation_mode,object_type,address,readiness_deposit,readiness_deal,
  lawyer_needed,broker_needed,has_children,has_mortgage,has_matcap,has_nominal_child_money,
  expenses_agreed,settlements_agreed,documents_min_ready,deal_summary,wizard_snapshot,next_action,
  seller_name,buyer_name,seller_phone,buyer_phone
 ) values(
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
$function$;
