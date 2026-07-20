-- Repository-only semantic qualification for four intake rules.
-- This does not change the effective 17/8 support inventory, mapper, save path or production objects.

create or replace function nav_v2_private.nav_v2_intake_semantics_wave2_spec_v1()
returns jsonb
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select jsonb_build_array(
    jsonb_build_object(
      'id','bankruptcy_risk','owner','lawyer','risk_level','yellow',
      'blocks_deposit',true,'blocks_deal',true,
      'lawyer_request_type','check_bankruptcy',
      'expected_decision','Оценить банкротный риск и допустимую конструкцию сделки.',
      'documents',jsonb_build_array(
        jsonb_build_object('type','bankruptcy_check','title','Результат проверки банкротного риска','side','seller','owner_role','seller_spn')
      )
    ),
    jsonb_build_object(
      'id','redevelopment','owner','lawyer','risk_level','yellow',
      'blocks_deposit',false,'blocks_deal',false,
      'lawyer_request_type','check_redevelopment',
      'expected_decision','Определить влияние перепланировки на сделку и ипотеку.',
      'documents',jsonb_build_array(
        jsonb_build_object('type','technical_plan','title','Технический план или описание объекта','side','object','owner_role','lead_spn'),
        jsonb_build_object('type','redevelopment_approval','title','Статус согласования перепланировки','side','object','owner_role','lead_spn')
      )
    ),
    jsonb_build_object(
      'id','after_registration','owner','lawyer','risk_level','yellow',
      'blocks_deposit',true,'blocks_deal',false,
      'lawyer_request_type','check_post_registration_payment',
      'expected_decision','Подтвердить безопасные условия перечисления денег после регистрации.',
      'documents',jsonb_build_array(
        jsonb_build_object('type','settlement_scheme','title','Согласованная схема расчётов','side','deal','owner_role','lead_spn')
      )
    ),
    jsonb_build_object(
      'id','certificate','owner','lawyer','risk_level','yellow',
      'blocks_deposit',false,'blocks_deal',false,
      'lawyer_request_type','design_safe_structure',
      'expected_decision','Проверить условия сертификата и безопасный порядок расчётов.',
      'documents',jsonb_build_array(
        jsonb_build_object('type','certificate_terms','title','Условия сертификата или субсидии','side','buyer','owner_role','buyer_spn')
      )
    )
  );
$function$;

create or replace function nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(
  p_adapter_result jsonb,
  p_owner_context jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, nav_v2_private
as $function$
declare
  v_spec jsonb := nav_v2_private.nav_v2_intake_semantics_wave2_spec_v1();
  v_matched jsonb := coalesce(p_adapter_result->'matched_rule_ids', '[]'::jsonb);
  v_draft jsonb := coalesce(p_adapter_result #> '{prepared_payload,deal,intake_draft}', '{}'::jsonb);
  v_passport jsonb := coalesce(p_adapter_result->'legal_passport', p_adapter_result #> '{prepared_payload,deal,legal_passport}', '{}'::jsonb);
  v_work_plan jsonb := coalesce(p_adapter_result->'work_plan', p_adapter_result #> '{prepared_payload,deal,intake_work_plan}', '{}'::jsonb);
  v_rule jsonb;
  v_rule_id text;
  v_fact jsonb;
  v_risk jsonb;
  v_task jsonb;
  v_doc_spec jsonb;
  v_doc jsonb;
  v_gaps jsonb;
  v_results jsonb := '[]'::jsonb;
  v_qualified jsonb := '[]'::jsonb;
  v_handoff_state text;
  v_lawyer_id uuid;
  v_adapter_allowed boolean;
  v_gap_count integer;
  v_risk_documents jsonb;
  v_spec_documents jsonb;
begin
  if p_adapter_result is null or jsonb_typeof(p_adapter_result) <> 'object' then
    raise exception 'Wave2 qualification requires adapter result object' using errcode = '22023';
  end if;
  if p_owner_context is null or jsonb_typeof(p_owner_context) <> 'object' then
    raise exception 'Wave2 qualification requires owner context object' using errcode = '22023';
  end if;

  begin
    v_lawyer_id := nullif(btrim(coalesce(p_owner_context->>'lawyer_id','')), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Wave2 owner context contains invalid lawyer UUID' using errcode = '22023';
  end;

  v_handoff_state := coalesce(v_passport #>> '{handoff_completeness,state}', 'blocked');
  v_adapter_allowed := coalesce((p_adapter_result->>'allowed')::boolean, false);

  for v_rule in select value from jsonb_array_elements(v_spec) loop
    v_rule_id := v_rule->>'id';
    if not (v_matched @> jsonb_build_array(v_rule_id)) then
      continue;
    end if;

    v_gaps := '[]'::jsonb;
    v_fact := coalesce(v_draft #> array['facts', v_rule_id], '{}'::jsonb);
    if coalesce(v_fact->>'value','unknown') <> 'yes' then
      v_gaps := v_gaps || jsonb_build_array('fact_value_not_yes');
    end if;
    if coalesce(v_fact->>'source','unchecked') not in ('client','document') then
      v_gaps := v_gaps || jsonb_build_array('fact_evidence_source_missing');
    end if;

    select item into v_risk
    from jsonb_array_elements(coalesce(v_passport->'risk_flags','[]'::jsonb)) item
    where item->>'id' = v_rule_id
    limit 1;

    if v_risk is null then
      v_gaps := v_gaps || jsonb_build_array('risk_flag_missing');
    else
      select coalesce(jsonb_agg(value order by value), '[]'::jsonb)
      into v_risk_documents
      from jsonb_array_elements_text(coalesce(v_risk->'required_documents','[]'::jsonb)) value;

      select coalesce(jsonb_agg(doc->>'type' order by doc->>'type'), '[]'::jsonb)
      into v_spec_documents
      from jsonb_array_elements(v_rule->'documents') doc;

      if v_risk->>'level' <> v_rule->>'risk_level'
         or coalesce((v_risk->>'blocks_deposit')::boolean,false) <> coalesce((v_rule->>'blocks_deposit')::boolean,false)
         or coalesce((v_risk->>'blocks_deal')::boolean,false) <> coalesce((v_rule->>'blocks_deal')::boolean,false)
         or v_risk->>'owner' <> 'lawyer'
         or v_risk_documents <> v_spec_documents then
        v_gaps := v_gaps || jsonb_build_array('risk_flag_contract_mismatch');
      end if;
    end if;

    select item into v_task
    from jsonb_array_elements(coalesce(v_work_plan->'task_candidates','[]'::jsonb)) item
    where item->>'rule_id' = v_rule_id
    limit 1;
    if v_task is null then
      v_gaps := v_gaps || jsonb_build_array('lawyer_task_missing');
    else
      if v_task->>'owner_role' <> 'lawyer'
         or nullif(btrim(coalesce(v_task->>'action','')), '') is null
         or v_task->>'evidence' <> 'structured_document_statuses'
         or v_task->>'expected_result' <> v_rule->>'expected_decision'
         or coalesce((v_task #>> '{gate_impact,blocks_deposit}')::boolean,false) <> coalesce((v_rule->>'blocks_deposit')::boolean,false)
         or coalesce((v_task #>> '{gate_impact,blocks_deal}')::boolean,false) <> coalesce((v_rule->>'blocks_deal')::boolean,false) then
        v_gaps := v_gaps || jsonb_build_array('lawyer_task_contract_mismatch');
      end if;
    end if;

    for v_doc_spec in select value from jsonb_array_elements(v_rule->'documents') loop
      select item into v_doc
      from jsonb_array_elements(coalesce(v_work_plan->'document_candidates','[]'::jsonb)) item
      where item->>'type' = v_doc_spec->>'type'
      limit 1;
      if v_doc is null then
        v_gaps := v_gaps || jsonb_build_array('document_missing:' || (v_doc_spec->>'type'));
      elsif v_doc->>'title' <> v_doc_spec->>'title'
         or v_doc->>'side' <> v_doc_spec->>'side'
         or v_doc->>'owner_role' <> v_doc_spec->>'owner_role'
         or coalesce(v_doc->>'status','') not in ('available','requested','missing','problem')
         or not (coalesce(v_doc->'rule_ids','[]'::jsonb) @> jsonb_build_array(v_rule_id)) then
        v_gaps := v_gaps || jsonb_build_array('document_contract_mismatch:' || (v_doc_spec->>'type'));
      end if;
    end loop;

    if v_lawyer_id is null then
      v_gaps := v_gaps || jsonb_build_array('lawyer_owner_unresolved');
    end if;
    if v_handoff_state not in ('ready','urgent_incomplete') then
      v_gaps := v_gaps || jsonb_build_array('lawyer_handoff_not_ready');
    end if;
    if not v_adapter_allowed then
      v_gaps := v_gaps || jsonb_build_array('adapter_gate_blocked');
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(v_work_plan->'task_candidates','[]'::jsonb)) item
      where item->>'rule_id' = v_rule_id and item->>'owner_role' = 'broker'
    ) then
      v_gaps := v_gaps || jsonb_build_array('broker_scope_expansion');
    end if;

    v_gap_count := jsonb_array_length(v_gaps);
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'rule_id',v_rule_id,
      'qualified',v_gap_count=0,
      'gaps',v_gaps,
      'owner_role','lawyer',
      'lawyer_id',v_lawyer_id,
      'risk_level',v_rule->>'risk_level',
      'blocks_deposit',v_rule->'blocks_deposit',
      'blocks_deal',v_rule->'blocks_deal'
    ));
    if v_gap_count=0 then
      v_qualified := v_qualified || jsonb_build_array(v_rule_id);
    end if;
  end loop;

  return jsonb_build_object(
    'qualification_version',1,
    'repository_only',true,
    'writes_performed',false,
    'production_ready',false,
    'changes_supported_inventory',false,
    'matched_candidate_rule_ids',coalesce((
      select jsonb_agg(value order by value)
      from jsonb_array_elements_text(v_matched) value
      where value in ('bankruptcy_risk','redevelopment','after_registration','certificate')
    ),'[]'::jsonb),
    'qualified_rule_ids',v_qualified,
    'rule_results',v_results,
    'base_effective_supported_count',17,
    'base_effective_unsupported_inventory',8,
    'candidate_unsupported_after_future_integration',8-jsonb_array_length(v_qualified),
    'mandatory_stops',jsonb_build_array(
      'qualification_only_not_support',
      'effective_17_8_inventory_unchanged',
      'wave2_integration_not_added',
      'authenticated_role_matrix_not_run',
      'deployment_approval_missing'
    )
  );
end;
$function$;

revoke all on function nav_v2_private.nav_v2_intake_semantics_wave2_spec_v1() from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(jsonb,jsonb) from public, anon, authenticated;
grant execute on function nav_v2_private.nav_v2_intake_semantics_wave2_spec_v1() to service_role;
grant execute on function nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(jsonb,jsonb) to service_role;
