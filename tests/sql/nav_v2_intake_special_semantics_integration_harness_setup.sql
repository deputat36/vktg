\set ON_ERROR_STOP on

create or replace function harness.mock_governed_intake_save_special_v1(
 p_result jsonb,
 p_client_request_id uuid,
 p_server_context jsonb,
 p_fail_after_deal boolean default false
)
returns jsonb
language plpgsql
volatile
set search_path=pg_catalog,harness,nav_v2_private
as $function$
declare v_plan jsonb; v_claim jsonb; v_result jsonb;
begin
 v_plan:=nav_v2_private.nav_v2_build_governed_intake_write_plan_special_v1(p_result,p_client_request_id,p_server_context);
 if not coalesce((v_plan->>'allowed')::boolean,false) then
  raise exception 'final governed plan blocked' using errcode='22023';
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
 if p_fail_after_deal then raise exception 'final injected failure' using errcode='40001'; end if;
 v_result:=jsonb_build_object(
  'deal_id',p_client_request_id,'client_request_id',p_client_request_id,'idempotent',false,
  'recovered_from_ledger',false,'integration_version',4
 );
 perform nav_v2_private.nav_v2_complete_intake_save_request_v1(
  p_client_request_id,(v_plan#>>'{deal,created_by}')::uuid,v_plan->>'payload_fingerprint',v_result
 );
 return v_result;
end;
$function$;
