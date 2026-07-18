-- Repository-only integration preview. This file is not a migration and performs no writes.
-- It must be applied only after nav_v2_intake_save_adapter_v1.sql in an ephemeral PostgreSQL harness.

create or replace function nav_v2_private.nav_v2_intake_legacy_mode_v1(p_request_type text)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select case p_request_type
    when 'capture_situation' then 'consult'
    when 'check_documents' then 'check_docs'
    when 'prepare_deposit' then 'deposit'
    when 'prepare_deal' then 'deal'
    when 'rework_deal' then 'rework'
    else null
  end;
$function$;

create or replace function nav_v2_private.nav_v2_intake_context_uuid_v1(
  p_context jsonb,
  p_key text,
  p_required boolean default false
)
returns uuid
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_text text := nullif(btrim(coalesce(p_context->>p_key, '')), '');
begin
  if v_text is null then
    if p_required then
      raise exception 'Trusted server context is missing %', p_key using errcode = '22023';
    end if;
    return null;
  end if;

  begin
    return v_text::uuid;
  exception when invalid_text_representation then
    raise exception 'Trusted server context has invalid UUID in %', p_key using errcode = '22023';
  end;
end;
$function$;

create or replace function nav_v2_private.nav_v2_intake_legacy_markers_v1(
  p_draft jsonb,
  p_group text
)
returns jsonb
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select coalesce(jsonb_agg(marker order by marker), '[]'::jsonb)
  from (
    select mapping.marker
    from (values
      ('flags', 'minor_seller', 'minorSeller'),
      ('flags', 'minor_buyer', 'minorBuyer'),
      ('flags', 'minor_registered', 'minorRegistered'),
      ('flags', 'power_of_attorney', 'powerOfAttorney'),
      ('flags', 'shares', 'shares'),
      ('payments', 'mortgage', 'mortgage'),
      ('payments', 'military_mortgage', 'militaryMortgage'),
      ('payments', 'matcap', 'matcap'),
      ('payments', 'child_money', 'nominalChild'),
      ('basis', 'privatisation', 'privat'),
      ('basis', 'court_basis', 'court')
    ) as mapping(marker_group, fact_id, marker)
    where mapping.marker_group = p_group
      and coalesce(p_draft #>> array['facts', mapping.fact_id, 'value'], 'unknown') = 'yes'
  ) selected;
$function$;

create or replace function nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(
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
  v_adapter jsonb;
  v_prepared_payload jsonb;
  v_prepared_deal jsonb;
  v_draft jsonb;
  v_work_plan jsonb;
  v_task_candidates jsonb;
  v_resolved_tasks jsonb := '[]'::jsonb;
  v_unresolved_roles jsonb := '[]'::jsonb;
  v_legacy_gap_ids jsonb := '[]'::jsonb;
  v_legacy_deal jsonb;
  v_legacy_payload jsonb;
  v_request_scope jsonb;
  v_request_fingerprint text;
  v_blockers jsonb := '[]'::jsonb;
  v_verified_actor_id uuid;
  v_lead_spn_id uuid;
  v_seller_spn_id uuid;
  v_buyer_spn_id uuid;
  v_lawyer_id uuid;
  v_broker_id uuid;
  v_verified_actor_role text;
  v_representation text;
  v_accompanied_sides jsonb;
  v_owner_id uuid;
  v_task jsonb;
  v_owner_role text;
  v_owner_resolution_complete boolean;
  v_actor_assignment_parity boolean;
  v_document_scope_parity boolean;
  v_rule_parity boolean;
  v_mock_call_allowed boolean;
begin
  if p_client_request_id is null then
    raise exception 'client_request_id UUID is required' using errcode = '22023';
  end if;
  if p_server_context is null or jsonb_typeof(p_server_context) <> 'object' then
    raise exception 'Trusted server context must be an object' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_server_context) key
    where key <> all(array[
      'verified_actor_id', 'verified_actor_role', 'lead_spn_id', 'seller_spn_id',
      'buyer_spn_id', 'lawyer_id', 'broker_id'
    ])
  ) then
    raise exception 'Trusted server context contains an unknown key' using errcode = '22023';
  end if;

  v_verified_actor_id := nav_v2_private.nav_v2_intake_context_uuid_v1(p_server_context, 'verified_actor_id', true);
  v_lead_spn_id := nav_v2_private.nav_v2_intake_context_uuid_v1(p_server_context, 'lead_spn_id', true);
  v_seller_spn_id := nav_v2_private.nav_v2_intake_context_uuid_v1(p_server_context, 'seller_spn_id');
  v_buyer_spn_id := nav_v2_private.nav_v2_intake_context_uuid_v1(p_server_context, 'buyer_spn_id');
  v_lawyer_id := nav_v2_private.nav_v2_intake_context_uuid_v1(p_server_context, 'lawyer_id');
  v_broker_id := nav_v2_private.nav_v2_intake_context_uuid_v1(p_server_context, 'broker_id');
  v_verified_actor_role := btrim(coalesce(p_server_context->>'verified_actor_role', ''));
  if v_verified_actor_role <> all(array['owner', 'admin', 'manager', 'spn']) then
    raise exception 'Trusted server context has an unsupported actor role' using errcode = '22023';
  end if;

  v_adapter := nav_v2_private.nav_v2_prepare_intake_save_v1(p_result);
  v_prepared_payload := v_adapter->'prepared_payload';
  v_prepared_deal := v_prepared_payload->'deal';
  v_draft := v_prepared_deal->'intake_draft';
  v_work_plan := v_adapter->'work_plan';
  v_task_candidates := coalesce(v_work_plan->'task_candidates', '[]'::jsonb);
  v_representation := coalesce(v_draft->>'representation', 'unknown');
  v_accompanied_sides := coalesce(v_work_plan->'accompanied_sides', '[]'::jsonb);

  for v_task in select value from jsonb_array_elements(v_task_candidates) loop
    v_owner_role := coalesce(v_task->>'owner_role', '');
    v_owner_id := case v_owner_role
      when 'spn' then v_lead_spn_id
      when 'lawyer' then v_lawyer_id
      when 'broker' then v_broker_id
      else null
    end;
    v_resolved_tasks := v_resolved_tasks || jsonb_build_array(
      v_task || jsonb_build_object(
        'owner_id', v_owner_id,
        'assignment_state', case when v_owner_id is null then 'needs_server_assignment' else 'resolved_preview' end,
        'creation_state', 'preview_only'
      )
    );
    if v_owner_id is null and v_owner_role <> '' and not (v_unresolved_roles @> jsonb_build_array(v_owner_role)) then
      v_unresolved_roles := v_unresolved_roles || jsonb_build_array(v_owner_role);
    end if;
  end loop;

  select coalesce(jsonb_agg(rule_id order by rule_id), '[]'::jsonb)
  into v_legacy_gap_ids
  from jsonb_array_elements_text(coalesce(v_adapter->'matched_rule_ids', '[]'::jsonb)) rule_id
  where rule_id <> all(array[
    'minor_seller', 'minor_buyer', 'child_money', 'power_of_attorney', 'shares',
    'minor_registered', 'privatisation', 'court_basis', 'matcap', 'mortgage',
    'military_mortgage', 'settlements_not_agreed', 'expenses_not_agreed'
  ]);

  v_owner_resolution_complete := jsonb_array_length(v_unresolved_roles) = 0;
  v_rule_parity := jsonb_array_length(v_legacy_gap_ids) = 0;
  v_document_scope_parity := v_accompanied_sides @> '["seller","buyer"]'::jsonb;
  v_actor_assignment_parity := coalesce(case v_representation
    when 'seller' then v_verified_actor_id = v_lead_spn_id
    when 'buyer' then v_verified_actor_id = v_lead_spn_id
    when 'one_spn_both' then v_verified_actor_id = v_lead_spn_id
    when 'both' then v_verified_actor_id = v_seller_spn_id and v_verified_actor_id = v_buyer_spn_id
    else false
  end, false);

  v_legacy_deal := jsonb_strip_nulls(jsonb_build_object(
    'preparationMode', nav_v2_private.nav_v2_intake_legacy_mode_v1(v_draft->>'requestType'),
    'representation', nullif(v_representation, ''),
    'stage', nullif(v_draft->>'stage', ''),
    'objectType', nullif(nullif(v_draft->>'objectType', ''), 'not_selected'),
    'address', nullif(btrim(coalesce(v_draft->>'objectAddress', '')), ''),
    'flags', nav_v2_private.nav_v2_intake_legacy_markers_v1(v_draft, 'flags'),
    'payments', nav_v2_private.nav_v2_intake_legacy_markers_v1(v_draft, 'payments'),
    'basis', nav_v2_private.nav_v2_intake_legacy_markers_v1(v_draft, 'basis'),
    'expensesAgreed', coalesce(v_draft #>> '{facts,expenses_agreed,value}', 'unknown') = 'yes',
    'settlementsAgreed', coalesce(v_draft #>> '{facts,settlements_agreed,value}', 'unknown') = 'yes',
    'intake_contract_version', v_prepared_deal->'intake_contract_version',
    'intake_catalog_version', v_prepared_deal->'intake_catalog_version',
    'intake_action', v_prepared_deal->'intake_action',
    'intake_draft', v_draft,
    'legal_passport', v_adapter->'legal_passport',
    'intake_work_plan', v_adapter->'work_plan',
    'client_request_id', p_client_request_id::text
  ));
  v_legacy_deal := nav_v2_private.nav_v2_sanitize_client_deal_json(v_legacy_deal);
  v_legacy_payload := jsonb_build_object('deal', v_legacy_deal);
  v_request_scope := jsonb_build_object(
    'verified_actor_id', v_verified_actor_id,
    'verified_actor_role', v_verified_actor_role,
    'lead_spn_id', v_lead_spn_id,
    'seller_spn_id', v_seller_spn_id,
    'buyer_spn_id', v_buyer_spn_id,
    'lawyer_id', v_lawyer_id,
    'broker_id', v_broker_id,
    'legacy_payload', v_legacy_payload
  );
  v_request_fingerprint := md5(v_request_scope::text);
  v_mock_call_allowed := coalesce((v_adapter->>'allowed')::boolean, false)
    and v_owner_resolution_complete
    and v_rule_parity
    and v_document_scope_parity
    and v_actor_assignment_parity;

  if not coalesce((v_adapter->>'allowed')::boolean, false) then
    v_blockers := v_blockers || jsonb_build_array('adapter_gate_blocked');
  end if;
  if not v_owner_resolution_complete then
    v_blockers := v_blockers || jsonb_build_array('owner_resolution_incomplete');
  end if;
  if not v_rule_parity then
    v_blockers := v_blockers || jsonb_build_array('legacy_rule_projection_incomplete');
  end if;
  if not v_document_scope_parity then
    v_blockers := v_blockers || jsonb_build_array('legacy_creates_generic_document_rows');
  end if;
  if not v_actor_assignment_parity then
    v_blockers := v_blockers || jsonb_build_array('legacy_assigns_current_actor');
  end if;
  v_blockers := v_blockers || jsonb_build_array('production_request_ledger_missing');

  return jsonb_build_object(
    'integration_version', 1,
    'repository_only', true,
    'writes_performed', false,
    'client_request_id', p_client_request_id::text,
    'payload_fingerprint', v_request_fingerprint,
    'fingerprint_scope', 'trusted_context_and_legacy_payload',
    'adapter_result', v_adapter,
    'legacy_payload', v_legacy_payload,
    'legacy_call_preview', jsonb_build_object(
      'function', 'nav_v2_private.nav_v2_save_wizard_result_legacy_20260715(jsonb)',
      'args', jsonb_build_object('p_result', v_legacy_payload),
      'execute', false
    ),
    'owner_resolution', jsonb_build_object(
      'source', 'trusted_server_context',
      'verified_actor_id', v_verified_actor_id,
      'verified_actor_role', v_verified_actor_role,
      'lead_spn_id', v_lead_spn_id,
      'seller_spn_id', v_seller_spn_id,
      'buyer_spn_id', v_buyer_spn_id,
      'lawyer_id', v_lawyer_id,
      'broker_id', v_broker_id,
      'resolved_task_previews', v_resolved_tasks,
      'unresolved_roles', v_unresolved_roles,
      'complete', v_owner_resolution_complete,
      'legacy_actor_assignment_parity', v_actor_assignment_parity
    ),
    'legacy_parity', jsonb_build_object(
      'rule_projection_complete', v_rule_parity,
      'unsupported_rule_ids', v_legacy_gap_ids,
      'document_scope_complete', v_document_scope_parity,
      'unknown_evidence_preserved_in_snapshot', true,
      'legacy_boolean_columns_collapse_unknown', true
    ),
    'gates', jsonb_build_object(
      'adapter', jsonb_build_object('allowed', coalesce((v_adapter->>'allowed')::boolean, false)),
      'owner_resolution', jsonb_build_object('allowed', v_owner_resolution_complete),
      'legacy_rule_parity', jsonb_build_object('allowed', v_rule_parity, 'unsupported_rule_ids', v_legacy_gap_ids),
      'legacy_document_scope', jsonb_build_object('allowed', v_document_scope_parity),
      'legacy_actor_assignment', jsonb_build_object('allowed', v_actor_assignment_parity),
      'mock_call', jsonb_build_object('allowed', v_mock_call_allowed),
      'production_call', jsonb_build_object('allowed', false, 'blockers', v_blockers)
    )
  );
end;
$function$;

comment on function nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(jsonb, uuid, jsonb) is
  'Repository-only pure integration preview. Recomputes, allowlists and sanitizes an intake payload; never executes legacy save.';

revoke all on function nav_v2_private.nav_v2_intake_legacy_mode_v1(text) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_intake_context_uuid_v1(jsonb, text, boolean) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_intake_legacy_markers_v1(jsonb, text) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(jsonb, uuid, jsonb) from public, anon, authenticated;

grant execute on function nav_v2_private.nav_v2_intake_legacy_mode_v1(text) to service_role;
grant execute on function nav_v2_private.nav_v2_intake_context_uuid_v1(jsonb, text, boolean) to service_role;
grant execute on function nav_v2_private.nav_v2_intake_legacy_markers_v1(jsonb, text) to service_role;
grant execute on function nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(jsonb, uuid, jsonb) to service_role;
