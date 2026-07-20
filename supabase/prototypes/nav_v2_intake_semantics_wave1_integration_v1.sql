-- Repository-only effective integration for four qualified intake rules.
-- Apply only after the canonical adapter, legacy preview, governed plan, wave1 qualifier and base mapper.
-- This is not a migration and performs no business writes.

create or replace function nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(
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
  v_base := nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(
    p_result,
    p_client_request_id,
    p_server_context
  );
  v_qualification := nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(
    v_base->'adapter_result',
    v_base->'owner_resolution'
  );
  v_base_unsupported := coalesce(v_base #> '{legacy_parity,unsupported_rule_ids}', '[]'::jsonb);
  v_qualified := coalesce(v_qualification->'qualified_rule_ids', '[]'::jsonb);

  select coalesce(jsonb_agg(rule_id order by rule_id), '[]'::jsonb)
  into v_effective_unsupported
  from jsonb_array_elements_text(v_base_unsupported) as unsupported(rule_id)
  where not (v_qualified @> jsonb_build_array(rule_id));

  v_effective_rule_parity := jsonb_array_length(v_effective_unsupported) = 0;
  v_governed_allowed := coalesce((v_base #>> '{gates,adapter,allowed}')::boolean, false)
    and coalesce((v_base #>> '{gates,owner_resolution,allowed}')::boolean, false)
    and v_effective_rule_parity;

  v_base_blockers := coalesce(v_base #> '{gates,production_call,blockers}', '[]'::jsonb);
  select coalesce(jsonb_agg(blocker order by blocker), '[]'::jsonb)
  into v_effective_blockers
  from jsonb_array_elements_text(v_base_blockers) as blockers(blocker)
  where blocker <> 'legacy_rule_projection_incomplete';
  if not v_effective_rule_parity then
    v_effective_blockers := v_effective_blockers || jsonb_build_array('effective_rule_projection_incomplete');
  end if;

  return v_base || jsonb_build_object(
    'integration_version', 2,
    'production_ready', false,
    'wave1_qualification', v_qualification,
    'effective_supported_count', 13 + jsonb_array_length(v_qualified),
    'effective_unsupported_count', jsonb_array_length(v_effective_unsupported),
    'legacy_parity', (v_base->'legacy_parity') || jsonb_build_object(
      'base_unsupported_rule_ids', v_base_unsupported,
      'wave1_qualified_rule_ids', v_qualified,
      'unsupported_rule_ids', v_effective_unsupported,
      'rule_projection_complete', v_effective_rule_parity
    ),
    'gates', (v_base->'gates') || jsonb_build_object(
      'wave1_semantics', jsonb_build_object(
        'allowed', jsonb_array_length(coalesce(v_qualification->'matched_candidate_rule_ids','[]'::jsonb))
          = jsonb_array_length(v_qualified),
        'qualification', v_qualification
      ),
      'effective_rule_parity', jsonb_build_object(
        'allowed', v_effective_rule_parity,
        'unsupported_rule_ids', v_effective_unsupported
      ),
      'governed_call', jsonb_build_object(
        'allowed', v_governed_allowed,
        'production_execute', false
      ),
      'production_call', jsonb_build_object(
        'allowed', false,
        'blockers', v_effective_blockers
      )
    )
  );
end;
$function$;

create or replace function nav_v2_private.nav_v2_build_governed_intake_write_plan_wave1_v1(
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
  v_plan := nav_v2_private.nav_v2_build_governed_intake_write_plan_v1(
    p_result,
    p_client_request_id,
    p_server_context
  );
  v_preview := nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(
    p_result,
    p_client_request_id,
    p_server_context
  );
  v_unsupported := coalesce(v_preview #> '{legacy_parity,unsupported_rule_ids}', '[]'::jsonb);
  v_blockers := coalesce(v_plan->'blockers', '[]'::jsonb);

  select coalesce(jsonb_agg(blocker order by blocker), '[]'::jsonb)
  into v_effective_blockers
  from jsonb_array_elements_text(v_blockers) as blockers(blocker)
  where blocker <> 'unsupported_rule_semantics';
  if jsonb_array_length(v_unsupported) > 0 then
    v_effective_blockers := v_effective_blockers || jsonb_build_array('unsupported_rule_semantics');
  end if;
  v_allowed := jsonb_array_length(v_effective_blockers) = 0;

  return v_plan || jsonb_build_object(
    'write_plan_version', 2,
    'integration_version', 2,
    'allowed', v_allowed,
    'production_ready', false,
    'blockers', v_effective_blockers,
    'unsupported_rule_ids', v_unsupported,
    'wave1_qualification', v_preview->'wave1_qualification',
    'effective_supported_count', v_preview->'effective_supported_count',
    'effective_unsupported_count', v_preview->'effective_unsupported_count'
  );
end;
$function$;

create or replace function nav_v2_private.nav_v2_map_governed_intake_to_production_wave1_v1(
  p_plan jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, nav_v2_private
as $function$
declare
  v_wave_ids text[] := array['spouse','seller_absent','encumbrance','inheritance'];
  v_spec jsonb := nav_v2_private.nav_v2_intake_semantics_wave1_spec_v1();
  v_effective_unsupported jsonb := coalesce(p_plan->'unsupported_rule_ids', '[]'::jsonb);
  v_qualified jsonb := coalesce(p_plan #> '{wave1_qualification,qualified_rule_ids}', '[]'::jsonb);
  v_wave_rule_ids jsonb;
  v_base_plan jsonb;
  v_result jsonb;
  v_wave_risks jsonb := '[]'::jsonb;
  v_wave_tasks jsonb := '[]'::jsonb;
  v_all_rule_ids jsonb;
  v_item jsonb;
  v_task jsonb;
  v_risk jsonb;
  v_rule jsonb;
  v_doc_spec jsonb;
  v_doc jsonb;
  v_rule_id text;
  v_risk_level text;
  v_deal jsonb;
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'Wave1 mapper requires governed plan object' using errcode = '22023';
  end if;
  if not coalesce((p_plan->>'allowed')::boolean, false) then
    raise exception 'Wave1 governed plan is blocked' using errcode = '22023';
  end if;
  if jsonb_array_length(v_effective_unsupported) > 0 then
    raise exception 'Wave1 governed plan still contains unsupported semantics' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(rule_id order by rule_id), '[]'::jsonb)
  into v_wave_rule_ids
  from (
    select coalesce(item->>'rule_id', item->>'id') as rule_id
    from jsonb_array_elements(coalesce(p_plan->'tasks','[]'::jsonb)) item
    union
    select item->>'id' as rule_id
    from jsonb_array_elements(coalesce(p_plan->'risks','[]'::jsonb)) item
  ) wave
  where rule_id = any(v_wave_ids);

  if exists (
    select 1 from jsonb_array_elements_text(v_wave_rule_ids) as wave(rule_id)
    where not (v_qualified @> jsonb_build_array(rule_id))
  ) then
    raise exception 'Wave1 rule is not backed by qualification evidence' using errcode = '22023';
  end if;

  -- Re-check the governed rows so a qualification object cannot be replayed against a tampered plan.
  for v_rule_id in select value from jsonb_array_elements_text(v_wave_rule_ids) loop
    select item into v_rule from jsonb_array_elements(v_spec) item where item->>'id'=v_rule_id limit 1;
    select item into v_risk from jsonb_array_elements(coalesce(p_plan->'risks','[]'::jsonb)) item where item->>'id'=v_rule_id limit 1;
    select item into v_task from jsonb_array_elements(coalesce(p_plan->'tasks','[]'::jsonb)) item where item->>'rule_id'=v_rule_id limit 1;
    if v_rule is null or v_risk is null or v_task is null then
      raise exception 'Wave1 governed rows are incomplete' using errcode = '22023';
    end if;
    if coalesce(v_risk->>'level',v_risk->>'risk_level','') <> v_rule->>'risk_level'
       or coalesce((v_risk->>'blocks_deposit')::boolean,false) <> coalesce((v_rule->>'blocks_deposit')::boolean,false)
       or coalesce((v_risk->>'blocks_deal')::boolean,false) <> coalesce((v_rule->>'blocks_deal')::boolean,false)
       or v_risk->>'owner' <> 'lawyer' then
      raise exception 'Wave1 risk row differs from qualified catalog contract' using errcode = '22023';
    end if;
    if v_task->>'owner_role' <> 'lawyer'
       or nullif(v_task->>'owner_id','') is null
       or nullif(btrim(coalesce(v_task->>'action','')),'') is null
       or v_task->>'expected_result' <> v_rule->>'expected_decision'
       or coalesce((v_task #>> '{gate_impact,blocks_deposit}')::boolean,false) <> coalesce((v_rule->>'blocks_deposit')::boolean,false)
       or coalesce((v_task #>> '{gate_impact,blocks_deal}')::boolean,false) <> coalesce((v_rule->>'blocks_deal')::boolean,false) then
      raise exception 'Wave1 lawyer task differs from qualified catalog contract' using errcode = '22023';
    end if;
    for v_doc_spec in select value from jsonb_array_elements(v_rule->'documents') loop
      select item into v_doc
      from jsonb_array_elements(coalesce(p_plan->'documents','[]'::jsonb)) item
      where item->>'type'=v_doc_spec->>'type' limit 1;
      if v_doc is null
         or v_doc->>'side' <> v_doc_spec->>'side'
         or nullif(v_doc->>'owner_id','') is null
         or coalesce(v_doc->>'status','') not in ('available','requested','missing','problem') then
        raise exception 'Wave1 document row differs from qualified catalog contract' using errcode = '22023';
      end if;
    end loop;
  end loop;

  v_base_plan := jsonb_set(
    jsonb_set(
      p_plan,
      '{tasks}',
      coalesce((
        select jsonb_agg(item order by coalesce(item->>'rule_id',item->>'id'))
        from jsonb_array_elements(coalesce(p_plan->'tasks','[]'::jsonb)) item
        where coalesce(item->>'rule_id',item->>'id') <> all(v_wave_ids)
      ),'[]'::jsonb),
      true
    ),
    '{risks}',
    coalesce((
      select jsonb_agg(item order by item->>'id')
      from jsonb_array_elements(coalesce(p_plan->'risks','[]'::jsonb)) item
      where item->>'id' <> all(v_wave_ids)
    ),'[]'::jsonb),
    true
  );
  v_base_plan := jsonb_set(v_base_plan,'{unsupported_rule_ids}','[]'::jsonb,true);
  v_result := nav_v2_private.nav_v2_map_governed_intake_to_production_v1(v_base_plan);

  for v_rule_id in select value from jsonb_array_elements_text(v_wave_rule_ids) loop
    select item into v_rule from jsonb_array_elements(v_spec) item where item->>'id'=v_rule_id limit 1;
    select item into v_risk from jsonb_array_elements(p_plan->'risks') item where item->>'id'=v_rule_id limit 1;
    select item into v_task from jsonb_array_elements(p_plan->'tasks') item where item->>'rule_id'=v_rule_id limit 1;

    v_wave_risks := v_wave_risks || jsonb_build_array(jsonb_build_object(
      'level', nav_v2_private.nav_v2_map_intake_risk_level_v1(v_rule->>'risk_level'),
      'category','intake',
      'title',v_rule_id,
      'description',v_rule->>'expected_decision',
      'recommendation',coalesce(nullif(v_task->>'action',''),v_rule->>'expected_decision'),
      'blocks_deposit',v_rule->'blocks_deposit',
      'blocks_deal',v_rule->'blocks_deal',
      'assigned_role','lawyer'
    ));
    v_wave_tasks := v_wave_tasks || jsonb_build_array(jsonb_build_object(
      'title',v_task->>'action',
      'description',concat_ws(' ',nullif(v_task->>'evidence',''),nullif(v_task->>'expected_result','')),
      'assigned_to',v_task->>'owner_id',
      'assigned_role','lawyer',
      'status','open',
      'priority',nav_v2_private.nav_v2_map_intake_task_priority_v1(v_task),
      'due_date',nullif(v_task->>'deadline',''),
      'source','intake_v1:'||v_rule_id,
      'created_by',p_plan #>> '{deal,created_by}',
      'task_type','legal_blocker',
      'sla_days',null
    ));
  end loop;

  select coalesce(jsonb_agg(rule_id order by rule_id),'[]'::jsonb)
  into v_all_rule_ids
  from (
    select value as rule_id from jsonb_array_elements_text(coalesce(v_result->'rule_ids','[]'::jsonb))
    union
    select value as rule_id from jsonb_array_elements_text(v_wave_rule_ids)
  ) all_rules;

  v_risk_level := case
    when exists(select 1 from jsonb_array_elements(coalesce(p_plan->'risks','[]'::jsonb)) item where coalesce(item->>'level',item->>'risk_level')='red') then 'red'
    when exists(select 1 from jsonb_array_elements(coalesce(p_plan->'risks','[]'::jsonb)) item where coalesce(item->>'level',item->>'risk_level')='yellow') then 'yellow'
    else coalesce(v_result #>> '{deal,risk_level}','green')
  end;
  v_deal := (v_result->'deal') || jsonb_build_object(
    'risk_level',v_risk_level,
    'lawyer_needed',jsonb_array_length(v_wave_rule_ids)>0 or coalesce((v_result #>> '{deal,lawyer_needed}')::boolean,false),
    'deal_summary',coalesce(v_result #> '{deal,deal_summary}','{}'::jsonb) || jsonb_build_object(
      'wave1_semantics_integration_version',1,
      'effective_supported_count',17,
      'effective_unsupported_count',8
    )
  );

  return v_result || jsonb_build_object(
    'mapping_version',2,
    'integration_version',2,
    'repository_only',true,
    'writes_performed',false,
    'structurally_mappable',true,
    'production_ready',false,
    'effective_supported_count',17,
    'effective_unsupported_count',8,
    'rule_ids',v_all_rule_ids,
    'deal',v_deal,
    'risks',coalesce(v_result->'risks','[]'::jsonb)||v_wave_risks,
    'tasks',coalesce(v_result->'tasks','[]'::jsonb)||v_wave_tasks,
    'created_event',(v_result->'created_event') || jsonb_build_object(
      'event_data',coalesce(v_result #> '{created_event,event_data}','{}'::jsonb)||jsonb_build_object(
        'wave1_semantics_integration_version',1,
        'wave1_rule_ids',v_wave_rule_ids
      )
    )
  );
end;
$function$;

revoke all on function nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(jsonb,uuid,jsonb) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_build_governed_intake_write_plan_wave1_v1(jsonb,uuid,jsonb) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_map_governed_intake_to_production_wave1_v1(jsonb) from public, anon, authenticated;
grant execute on function nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(jsonb,uuid,jsonb) to service_role;
grant execute on function nav_v2_private.nav_v2_build_governed_intake_write_plan_wave1_v1(jsonb,uuid,jsonb) to service_role;
grant execute on function nav_v2_private.nav_v2_map_governed_intake_to_production_wave1_v1(jsonb) to service_role;
