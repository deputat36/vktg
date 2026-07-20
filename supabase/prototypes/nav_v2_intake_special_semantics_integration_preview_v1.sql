-- Repository-only final effective preview/governed integration.
-- Apply after wave2 integration and special qualification. No business writes.

create or replace function nav_v2_private.nav_v2_prepare_intake_legacy_save_special_v1(
  p_result jsonb,
  p_client_request_id uuid,
  p_server_context jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, nav_v2_private
as $function$
declare
  v_base jsonb;
  v_qualification jsonb;
  v_base_unsupported jsonb;
  v_qualified jsonb;
  v_effective_unsupported jsonb;
  v_base_blockers jsonb;
  v_effective_blockers jsonb;
  v_effective_rule_parity boolean;
  v_governed_allowed boolean;
begin
  v_base := nav_v2_private.nav_v2_prepare_intake_legacy_save_wave2_v1(
    p_result,p_client_request_id,p_server_context
  );
  v_qualification := nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(
    v_base->'adapter_result',v_base->'owner_resolution'
  );
  v_base_unsupported := coalesce(v_base #> '{legacy_parity,unsupported_rule_ids}','[]'::jsonb);
  v_qualified := coalesce(v_qualification->'qualified_rule_ids','[]'::jsonb);

  select coalesce(jsonb_agg(rule_id order by rule_id),'[]'::jsonb)
  into v_effective_unsupported
  from jsonb_array_elements_text(v_base_unsupported) as unsupported(rule_id)
  where not (v_qualified @> jsonb_build_array(rule_id));

  v_effective_rule_parity := jsonb_array_length(v_effective_unsupported)=0;
  v_governed_allowed := coalesce((v_base #>> '{gates,adapter,allowed}')::boolean,false)
    and coalesce((v_base #>> '{gates,owner_resolution,allowed}')::boolean,false)
    and v_effective_rule_parity;

  v_base_blockers := coalesce(v_base #> '{gates,production_call,blockers}','[]'::jsonb);
  select coalesce(jsonb_agg(blocker order by blocker),'[]'::jsonb)
  into v_effective_blockers
  from jsonb_array_elements_text(v_base_blockers) as blockers(blocker)
  where blocker <> 'wave2_effective_rule_projection_incomplete';
  if not v_effective_rule_parity then
    v_effective_blockers := v_effective_blockers || jsonb_build_array('special_effective_rule_projection_incomplete');
  end if;

  return v_base || jsonb_build_object(
    'integration_version',4,
    'production_ready',false,
    'special_qualification',v_qualification,
    'effective_supported_count',21+jsonb_array_length(v_qualified),
    'effective_unsupported_count',jsonb_array_length(v_effective_unsupported),
    'legacy_parity',(v_base->'legacy_parity') || jsonb_build_object(
      'wave2_effective_unsupported_rule_ids',v_base_unsupported,
      'special_qualified_rule_ids',v_qualified,
      'unsupported_rule_ids',v_effective_unsupported,
      'rule_projection_complete',v_effective_rule_parity
    ),
    'gates',(v_base->'gates') || jsonb_build_object(
      'special_semantics',jsonb_build_object(
        'allowed',jsonb_array_length(coalesce(v_qualification->'matched_candidate_rule_ids','[]'::jsonb))=jsonb_array_length(v_qualified),
        'qualification',v_qualification
      ),
      'effective_rule_parity',jsonb_build_object('allowed',v_effective_rule_parity,'unsupported_rule_ids',v_effective_unsupported),
      'governed_call',jsonb_build_object('allowed',v_governed_allowed,'production_execute',false),
      'production_call',jsonb_build_object('allowed',false,'blockers',v_effective_blockers)
    )
  );
end;
$function$;

create or replace function nav_v2_private.nav_v2_build_governed_intake_write_plan_special_v1(
  p_result jsonb,
  p_client_request_id uuid,
  p_server_context jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, nav_v2_private
as $function$
declare
  v_plan jsonb;
  v_preview jsonb;
  v_unsupported jsonb;
  v_blockers jsonb;
  v_effective_blockers jsonb;
  v_allowed boolean;
begin
  v_plan := nav_v2_private.nav_v2_build_governed_intake_write_plan_wave2_v1(
    p_result,p_client_request_id,p_server_context
  );
  v_preview := nav_v2_private.nav_v2_prepare_intake_legacy_save_special_v1(
    p_result,p_client_request_id,p_server_context
  );
  v_unsupported := coalesce(v_preview #> '{legacy_parity,unsupported_rule_ids}','[]'::jsonb);
  v_blockers := coalesce(v_plan->'blockers','[]'::jsonb);

  select coalesce(jsonb_agg(blocker order by blocker),'[]'::jsonb)
  into v_effective_blockers
  from jsonb_array_elements_text(v_blockers) as blockers(blocker)
  where blocker <> 'unsupported_rule_semantics';
  if jsonb_array_length(v_unsupported)>0 then
    v_effective_blockers := v_effective_blockers || jsonb_build_array('unsupported_rule_semantics');
  end if;
  v_allowed := jsonb_array_length(v_effective_blockers)=0;

  return v_plan || jsonb_build_object(
    'write_plan_version',4,
    'integration_version',4,
    'allowed',v_allowed,
    'production_ready',false,
    'blockers',v_effective_blockers,
    'unsupported_rule_ids',v_unsupported,
    'special_qualification',v_preview->'special_qualification',
    'effective_supported_count',v_preview->'effective_supported_count',
    'effective_unsupported_count',v_preview->'effective_unsupported_count'
  );
end;
$function$;

revoke all on function nav_v2_private.nav_v2_prepare_intake_legacy_save_special_v1(jsonb,uuid,jsonb) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_build_governed_intake_write_plan_special_v1(jsonb,uuid,jsonb) from public, anon, authenticated;
grant execute on function nav_v2_private.nav_v2_prepare_intake_legacy_save_special_v1(jsonb,uuid,jsonb) to service_role;
grant execute on function nav_v2_private.nav_v2_build_governed_intake_write_plan_special_v1(jsonb,uuid,jsonb) to service_role;
