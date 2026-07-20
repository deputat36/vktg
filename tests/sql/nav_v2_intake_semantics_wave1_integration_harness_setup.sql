\set ON_ERROR_STOP on

create or replace function harness.wave1_intake(p_rule_id text,p_source text default 'client')
returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,harness
as $function$
declare p jsonb;
begin
 p:=jsonb_set(harness.base_intake(),'{deal,intake_action}','"lawyer"'::jsonb,true);
 p:=jsonb_set(p,'{deal,intake_draft,lawyerRequestConfirmed}','true'::jsonb,true);
 p:=harness.with_fact(p,p_rule_id,'yes',p_source);
 if p_rule_id='spouse' then
  p:=harness.with_document(p,'spouse_consent_status','requested');
 elsif p_rule_id='seller_absent' then
  p:=harness.with_document(p,'participation_plan','requested');
  p:=harness.with_document(p,'power_of_attorney','available');
 elsif p_rule_id='encumbrance' then
  p:=harness.with_document(p,'encumbrance_extract','available');
  p:=harness.with_document(p,'release_terms','requested');
 elsif p_rule_id='inheritance' then
  p:=harness.with_document(p,'inheritance_certificate','available');
 else
  raise exception 'unsupported harness wave1 rule';
 end if;
 return p;
end;
$function$;

create or replace function harness.wave1_all_intake()
returns jsonb
language plpgsql
immutable
set search_path=pg_catalog,harness
as $function$
declare p jsonb;
begin
 p:=jsonb_set(harness.base_intake(),'{deal,intake_action}','"lawyer"'::jsonb,true);
 p:=jsonb_set(p,'{deal,intake_draft,lawyerRequestConfirmed}','true'::jsonb,true);
 p:=harness.with_fact(p,'spouse','yes','client');
 p:=harness.with_fact(p,'seller_absent','yes','client');
 p:=harness.with_fact(p,'encumbrance','yes','document');
 p:=harness.with_fact(p,'inheritance','yes','document');
 p:=harness.with_document(p,'spouse_consent_status','requested');
 p:=harness.with_document(p,'participation_plan','requested');
 p:=harness.with_document(p,'power_of_attorney','available');
 p:=harness.with_document(p,'encumbrance_extract','available');
 p:=harness.with_document(p,'release_terms','requested');
 p:=harness.with_document(p,'inheritance_certificate','available');
 return p;
end;
$function$;

create or replace function harness.mock_governed_intake_save_wave1_v1(
 p_result jsonb,
 p_client_request_id uuid,
 p_server_context jsonb,
 p_fail_after_rows boolean default false
)
returns jsonb
language plpgsql
volatile
set search_path=pg_catalog,harness,nav_v2_private
as $function$
declare v_plan jsonb; v_claim jsonb; v_item jsonb; v_result jsonb;
begin
 v_plan:=nav_v2_private.nav_v2_build_governed_intake_write_plan_wave1_v1(p_result,p_client_request_id,p_server_context);
 if not coalesce((v_plan->>'allowed')::boolean,false) then
  raise exception 'wave1 governed plan blocked' using errcode='22023';
 end if;
 v_claim:=nav_v2_private.nav_v2_begin_intake_save_request_v1(v_plan);
 if not coalesce((v_claim->>'execute')::boolean,false) then
  return (v_claim->'result')||jsonb_build_object('idempotent',true,'recovered_from_ledger',true);
 end if;
 insert into harness.nav_v2_governed_deals(
  id,client_request_id,created_by,lead_spn_id,seller_spn_id,buyer_spn_id,lawyer_id,broker_id,payload
 ) values(
  p_client_request_id,p_client_request_id,(v_plan#>>'{deal,created_by}')::uuid,(v_plan#>>'{deal,lead_spn_id}')::uuid,
  nullif(v_plan#>>'{deal,seller_spn_id}','')::uuid,nullif(v_plan#>>'{deal,buyer_spn_id}','')::uuid,
  nullif(v_plan#>>'{deal,lawyer_id}','')::uuid,nullif(v_plan#>>'{deal,broker_id}','')::uuid,v_plan->'deal'
 );
 for v_item in select value from jsonb_array_elements(v_plan->'participants') loop
  insert into harness.nav_v2_governed_participants(client_request_id,user_id,role_in_deal,side,payload)
  values(p_client_request_id,(v_item->>'user_id')::uuid,v_item->>'role_in_deal',v_item->>'side',v_item);
 end loop;
 for v_item in select value from jsonb_array_elements(v_plan->'documents') loop
  insert into harness.nav_v2_governed_documents(client_request_id,document_type,side,assigned_to,payload)
  values(p_client_request_id,v_item->>'type',v_item->>'side',(v_item->>'owner_id')::uuid,v_item);
 end loop;
 for v_item in select value from jsonb_array_elements(v_plan->'risks') loop
  insert into harness.nav_v2_governed_risks(client_request_id,risk_id,assigned_to,payload)
  values(p_client_request_id,v_item->>'id',(v_item->>'owner_id')::uuid,v_item);
 end loop;
 for v_item in select value from jsonb_array_elements(v_plan->'tasks') loop
  insert into harness.nav_v2_governed_tasks(client_request_id,task_id,assigned_to,owner_role,payload)
  values(p_client_request_id,v_item->>'id',(v_item->>'owner_id')::uuid,v_item->>'owner_role',v_item);
 end loop;
 insert into harness.nav_v2_governed_events(client_request_id,actor_id,event_type,payload)
 values(p_client_request_id,(v_plan#>>'{created_event,actor_id}')::uuid,v_plan#>>'{created_event,event_type}',v_plan->'created_event');
 if p_fail_after_rows then raise exception 'wave1 injected failure' using errcode='40001'; end if;
 v_result:=jsonb_build_object(
  'deal_id',p_client_request_id,'client_request_id',p_client_request_id,'idempotent',false,'recovered_from_ledger',false,
  'integration_version',2,'row_counts',jsonb_build_object(
   'deal',1,'participants',jsonb_array_length(v_plan->'participants'),'documents',jsonb_array_length(v_plan->'documents'),
   'risks',jsonb_array_length(v_plan->'risks'),'tasks',jsonb_array_length(v_plan->'tasks'),'events',1
  )
 );
 perform nav_v2_private.nav_v2_complete_intake_save_request_v1(
  p_client_request_id,(v_plan#>>'{deal,created_by}')::uuid,v_plan->>'payload_fingerprint',v_result
 );
 return v_result;
end;
$function$;
