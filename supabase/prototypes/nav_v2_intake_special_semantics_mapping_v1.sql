-- Repository-only final production-schema mapper overlay. No business writes.

create or replace function nav_v2_private.nav_v2_map_governed_intake_to_production_special_v1(
  p_plan jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, nav_v2_private
as $function$
declare
  v_special_ids text[] := array['legal_problem','partner_agency','flat_ground','house_land'];
  v_spec jsonb := nav_v2_private.nav_v2_intake_special_semantics_spec_v1();
  v_effective_unsupported jsonb := coalesce(p_plan->'unsupported_rule_ids','[]'::jsonb);
  v_qualified jsonb := coalesce(p_plan #> '{special_qualification,qualified_rule_ids}','[]'::jsonb);
  v_special_rule_ids jsonb;
  v_special_document_types text[];
  v_wave2_plan jsonb;
  v_result jsonb;
  v_special_documents jsonb := '[]'::jsonb;
  v_special_risks jsonb := '[]'::jsonb;
  v_special_tasks jsonb := '[]'::jsonb;
  v_all_rule_ids jsonb;
  v_task jsonb;
  v_risk jsonb;
  v_rule jsonb;
  v_doc_spec jsonb;
  v_doc jsonb;
  v_rule_id text;
  v_risk_level text;
  v_deal jsonb;
begin
  if p_plan is null or jsonb_typeof(p_plan)<>'object' then
    raise exception 'Special mapper requires governed plan object' using errcode='22023';
  end if;
  if not coalesce((p_plan->>'allowed')::boolean,false) then
    raise exception 'Special governed plan is blocked' using errcode='22023';
  end if;
  if jsonb_array_length(v_effective_unsupported)>0 then
    raise exception 'Special governed plan still contains unsupported semantics' using errcode='22023';
  end if;

  select coalesce(jsonb_agg(rule_id order by rule_id),'[]'::jsonb)
  into v_special_rule_ids
  from (
    select coalesce(item->>'rule_id',item->>'id') as rule_id
    from jsonb_array_elements(coalesce(p_plan->'tasks','[]'::jsonb)) item
    union
    select item->>'id' as rule_id
    from jsonb_array_elements(coalesce(p_plan->'risks','[]'::jsonb)) item
  ) special
  where rule_id=any(v_special_ids);

  if exists(
    select 1 from jsonb_array_elements_text(v_special_rule_ids) as special(rule_id)
    where not (v_qualified @> jsonb_build_array(rule_id))
  ) then
    raise exception 'Special rule is not backed by qualification evidence' using errcode='22023';
  end if;

  select coalesce(array_agg(distinct doc->>'type' order by doc->>'type'),array[]::text[])
  into v_special_document_types
  from jsonb_array_elements(v_spec) rule
  cross join lateral jsonb_array_elements(rule->'documents') doc;

  for v_rule_id in select value from jsonb_array_elements_text(v_special_rule_ids) loop
    select item into v_rule from jsonb_array_elements(v_spec) item where item->>'id'=v_rule_id limit 1;
    select item into v_risk from jsonb_array_elements(coalesce(p_plan->'risks','[]'::jsonb)) item where item->>'id'=v_rule_id limit 1;
    select item into v_task from jsonb_array_elements(coalesce(p_plan->'tasks','[]'::jsonb)) item where item->>'rule_id'=v_rule_id limit 1;
    if v_rule is null or v_risk is null or v_task is null then
      raise exception 'Special governed rows are incomplete' using errcode='22023';
    end if;
    if coalesce(v_risk->>'level',v_risk->>'risk_level','')<>v_rule->>'risk_level'
       or coalesce((v_risk->>'blocks_deposit')::boolean,false)<>coalesce((v_rule->>'blocks_deposit')::boolean,false)
       or coalesce((v_risk->>'blocks_deal')::boolean,false)<>coalesce((v_rule->>'blocks_deal')::boolean,false)
       or v_risk->>'owner'<>'lawyer' then
      raise exception 'Special risk row differs from qualified catalog contract' using errcode='22023';
    end if;
    if v_task->>'owner_role'<>'lawyer'
       or nullif(v_task->>'owner_id','') is null
       or nullif(btrim(coalesce(v_task->>'action','')),'') is null
       or v_task->>'evidence'<>v_rule->>'task_evidence'
       or v_task->>'expected_result'<>v_rule->>'expected_decision'
       or coalesce((v_task #>> '{gate_impact,blocks_deposit}')::boolean,false)<>coalesce((v_rule->>'blocks_deposit')::boolean,false)
       or coalesce((v_task #>> '{gate_impact,blocks_deal}')::boolean,false)<>coalesce((v_rule->>'blocks_deal')::boolean,false) then
      raise exception 'Special lawyer task differs from qualified catalog contract' using errcode='22023';
    end if;
    if jsonb_array_length(v_rule->'documents')=0 then
      if exists(
        select 1 from jsonb_array_elements(coalesce(p_plan->'documents','[]'::jsonb)) item
        where coalesce(item->'rule_ids','[]'::jsonb) @> jsonb_build_array(v_rule_id)
      ) then
        raise exception 'Special no-document rule contains document row' using errcode='22023';
      end if;
    else
      for v_doc_spec in select value from jsonb_array_elements(v_rule->'documents') loop
        select item into v_doc from jsonb_array_elements(coalesce(p_plan->'documents','[]'::jsonb)) item
        where item->>'type'=v_doc_spec->>'type' limit 1;
        if v_doc is null
           or v_doc->>'title'<>v_doc_spec->>'title'
           or v_doc->>'side'<>v_doc_spec->>'side'
           or nullif(v_doc->>'owner_id','') is null
           or coalesce(v_doc->>'status','') not in ('available','requested','missing','problem') then
          raise exception 'Special document row differs from qualified catalog contract' using errcode='22023';
        end if;
      end loop;
    end if;
  end loop;

  v_wave2_plan := jsonb_set(
    jsonb_set(
      jsonb_set(
        p_plan,
        '{tasks}',coalesce((
          select jsonb_agg(item order by coalesce(item->>'rule_id',item->>'id'))
          from jsonb_array_elements(coalesce(p_plan->'tasks','[]'::jsonb)) item
          where coalesce(item->>'rule_id',item->>'id')<>all(v_special_ids)
        ),'[]'::jsonb),true
      ),
      '{risks}',coalesce((
        select jsonb_agg(item order by item->>'id')
        from jsonb_array_elements(coalesce(p_plan->'risks','[]'::jsonb)) item
        where item->>'id'<>all(v_special_ids)
      ),'[]'::jsonb),true
    ),
    '{documents}',coalesce((
      select jsonb_agg(item order by item->>'type')
      from jsonb_array_elements(coalesce(p_plan->'documents','[]'::jsonb)) item
      where item->>'type'<>all(v_special_document_types)
    ),'[]'::jsonb),true
  );
  v_wave2_plan := jsonb_set(v_wave2_plan,'{unsupported_rule_ids}','[]'::jsonb,true);
  v_result := nav_v2_private.nav_v2_map_governed_intake_to_production_wave2_v1(v_wave2_plan);

  for v_doc in
    select value from jsonb_array_elements(coalesce(p_plan->'documents','[]'::jsonb)) item
    where item->>'type'=any(v_special_document_types)
  loop
    v_special_documents := v_special_documents || jsonb_build_array(jsonb_build_object(
      'side',nav_v2_private.nav_v2_map_intake_document_side_v1(v_doc->>'side'),
      'category','intake','title',coalesce(nullif(v_doc->>'title',''),v_doc->>'type'),
      'description',concat_ws(' ',nullif(v_doc->>'reason',''),nullif(v_doc->>'description','')),
      'required_for_deposit',coalesce((v_doc #>> '{gate_impact,blocks_deposit}')::boolean,false),
      'required_for_deal',coalesce((v_doc #>> '{gate_impact,blocks_deal}')::boolean,false),
      'is_required',true,'status',nav_v2_private.nav_v2_map_intake_document_status_v1(v_doc->>'status'),
      'source_hint','intake_scope:'||(v_doc->>'side'),'assigned_to',v_doc->>'owner_id',
      'responsible_role','spn','due_date',nullif(v_doc->>'deadline','')
    ));
  end loop;

  for v_rule_id in select value from jsonb_array_elements_text(v_special_rule_ids) loop
    select item into v_rule from jsonb_array_elements(v_spec) item where item->>'id'=v_rule_id limit 1;
    select item into v_task from jsonb_array_elements(p_plan->'tasks') item where item->>'rule_id'=v_rule_id limit 1;
    v_special_risks := v_special_risks || jsonb_build_array(jsonb_build_object(
      'level',nav_v2_private.nav_v2_map_intake_risk_level_v1(v_rule->>'risk_level'),
      'category','intake','title',v_rule_id,'description',v_rule->>'expected_decision',
      'recommendation',coalesce(nullif(v_task->>'action',''),v_rule->>'expected_decision'),
      'blocks_deposit',v_rule->'blocks_deposit','blocks_deal',v_rule->'blocks_deal','assigned_role','lawyer'
    ));
    v_special_tasks := v_special_tasks || jsonb_build_array(jsonb_build_object(
      'title',v_task->>'action','description',concat_ws(' ',nullif(v_task->>'evidence',''),nullif(v_task->>'expected_result','')),
      'assigned_to',v_task->>'owner_id','assigned_role','lawyer','status','open',
      'priority',nav_v2_private.nav_v2_map_intake_task_priority_v1(v_task),'due_date',nullif(v_task->>'deadline',''),
      'source','intake_v1:'||v_rule_id,'created_by',p_plan #>> '{deal,created_by}',
      'task_type','legal_blocker','sla_days',null
    ));
  end loop;

  select coalesce(jsonb_agg(rule_id order by rule_id),'[]'::jsonb)
  into v_all_rule_ids
  from (
    select value as rule_id from jsonb_array_elements_text(coalesce(v_result->'rule_ids','[]'::jsonb))
    union select value as rule_id from jsonb_array_elements_text(v_special_rule_ids)
  ) all_rules;

  v_risk_level := case
    when exists(select 1 from jsonb_array_elements(coalesce(p_plan->'risks','[]'::jsonb)) item where coalesce(item->>'level',item->>'risk_level')='red') then 'red'
    when exists(select 1 from jsonb_array_elements(coalesce(p_plan->'risks','[]'::jsonb)) item where coalesce(item->>'level',item->>'risk_level')='yellow') then 'yellow'
    else coalesce(v_result #>> '{deal,risk_level}','green')
  end;
  v_deal := (v_result->'deal') || jsonb_build_object(
    'risk_level',v_risk_level,
    'lawyer_needed',jsonb_array_length(v_special_rule_ids)>0 or coalesce((v_result #>> '{deal,lawyer_needed}')::boolean,false),
    'deal_summary',coalesce(v_result #> '{deal,deal_summary}','{}'::jsonb)||jsonb_build_object(
      'special_semantics_integration_version',1,'effective_supported_count',25,'effective_unsupported_count',0
    )
  );

  return v_result || jsonb_build_object(
    'mapping_version',4,'integration_version',4,'repository_only',true,'writes_performed',false,
    'structurally_mappable',true,'production_ready',false,
    'effective_supported_count',25,'effective_unsupported_count',0,
    'rule_ids',v_all_rule_ids,'deal',v_deal,
    'documents',coalesce(v_result->'documents','[]'::jsonb)||v_special_documents,
    'risks',coalesce(v_result->'risks','[]'::jsonb)||v_special_risks,
    'tasks',coalesce(v_result->'tasks','[]'::jsonb)||v_special_tasks,
    'created_event',(v_result->'created_event')||jsonb_build_object(
      'event_data',coalesce(v_result #> '{created_event,event_data}','{}'::jsonb)||jsonb_build_object(
        'special_semantics_integration_version',1,'special_rule_ids',v_special_rule_ids
      )
    )
  );
end;
$function$;

revoke all on function nav_v2_private.nav_v2_map_governed_intake_to_production_special_v1(jsonb) from public, anon, authenticated;
grant execute on function nav_v2_private.nav_v2_map_governed_intake_to_production_special_v1(jsonb) to service_role;
