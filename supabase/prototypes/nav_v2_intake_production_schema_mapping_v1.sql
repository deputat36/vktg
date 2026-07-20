-- Repository-only mapper from governed intake write plan to the existing Navigator v2 write surface.
-- Not a migration. Exposes no public RPC and performs no writes.

create or replace function nav_v2_private.nav_v2_map_intake_document_side_v1(p_side text)
returns text
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
begin
  if p_side = 'seller' then return 'seller'; end if;
  if p_side = 'buyer' then return 'buyer'; end if;
  if p_side in ('object', 'deal') then return 'both'; end if;
  raise exception 'Unsupported intake document side: %', p_side using errcode = '22023';
end;
$function$;

create or replace function nav_v2_private.nav_v2_map_intake_document_status_v1(p_status text)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select case coalesce(p_status, '')
    when 'available' then 'received'
    when 'requested' then 'requested'
    when 'problem' then 'problem'
    else 'needed'
  end;
$function$;

create or replace function nav_v2_private.nav_v2_map_intake_risk_level_v1(p_level text)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select case coalesce(p_level, '')
    when 'red' then 'red'
    when 'yellow' then 'yellow'
    when 'green' then 'green'
    when 'info' then 'green'
    else 'yellow'
  end;
$function$;

create or replace function nav_v2_private.nav_v2_map_intake_task_type_v1(p_owner_role text)
returns text
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
begin
  if p_owner_role = 'lawyer' then return 'legal_blocker'; end if;
  if p_owner_role = 'broker' then return 'broker_task'; end if;
  if p_owner_role = 'spn' then return 'operational_task'; end if;
  raise exception 'Unsupported intake task owner role: %', p_owner_role using errcode = '22023';
end;
$function$;

create or replace function nav_v2_private.nav_v2_map_intake_task_priority_v1(p_task jsonb)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select case
    when coalesce((p_task #>> '{gate_impact,blocks_deposit}')::boolean, false) then 'urgent'
    when coalesce((p_task #>> '{gate_impact,blocks_deal}')::boolean, false) then 'high'
    else 'normal'
  end;
$function$;

create or replace function nav_v2_private.nav_v2_map_governed_intake_to_production_v1(p_plan jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, nav_v2_private
as $function$
declare
  v_deal jsonb := coalesce(p_plan->'deal', '{}'::jsonb);
  v_passport jsonb := coalesce(v_deal->'legal_passport', '{}'::jsonb);
  v_work_plan jsonb := coalesce(v_deal->'intake_work_plan', '{}'::jsonb);
  v_participants jsonb := '[]'::jsonb;
  v_documents jsonb := '[]'::jsonb;
  v_risks jsonb := '[]'::jsonb;
  v_tasks jsonb := '[]'::jsonb;
  v_item jsonb;
  v_original_side text;
  v_owner_role text;
  v_level text := 'green';
  v_next_action text;
  v_rule_ids jsonb;
  v_supported text[] := array[
    'minor_seller','minor_buyer','child_money','power_of_attorney','shares',
    'minor_registered','privatisation','court_basis','matcap','mortgage',
    'military_mortgage','settlements_not_agreed','expenses_not_agreed'
  ];
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' then
    raise exception 'Governed intake plan must be an object' using errcode = '22023';
  end if;
  if not coalesce((p_plan->>'allowed')::boolean, false) then
    raise exception 'Governed intake plan is blocked' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_plan->'unsupported_rule_ids', '[]'::jsonb)) > 0 then
    raise exception 'Unsupported intake semantics cannot be mapped' using errcode = '22023';
  end if;

  v_rule_ids := coalesce(
    (select jsonb_agg(distinct value order by value)
     from (
       select coalesce(item->>'rule_id', item->>'id') as value
       from jsonb_array_elements(coalesce(p_plan->'tasks', '[]'::jsonb)) item
       union all
       select item->>'id'
       from jsonb_array_elements(coalesce(p_plan->'risks', '[]'::jsonb)) item
     ) rules
     where value is not null),
    '[]'::jsonb
  );
  if exists (
    select 1 from jsonb_array_elements_text(v_rule_ids) rule_id
    where rule_id <> all(v_supported)
  ) then
    raise exception 'Mapped plan contains a rule outside supported allowlist' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'participants', '[]'::jsonb)) loop
    if coalesce(v_item->>'side', '') not in ('company','seller','buyer') then
      raise exception 'Participant side is incompatible with production enum' using errcode = '22023';
    end if;
    v_participants := v_participants || jsonb_build_array(jsonb_build_object(
      'user_id', v_item->>'user_id',
      'role_in_deal', v_item->>'role_in_deal',
      'side', v_item->>'side',
      'can_view', true,
      'can_edit', true,
      'can_manage_tasks', true,
      'can_view_finance', true,
      'display_name', null
    ));
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'documents', '[]'::jsonb)) loop
    v_original_side := coalesce(v_item->>'side', '');
    v_documents := v_documents || jsonb_build_array(jsonb_build_object(
      'side', nav_v2_private.nav_v2_map_intake_document_side_v1(v_original_side),
      'category', 'intake',
      'title', coalesce(nullif(v_item->>'title', ''), v_item->>'type'),
      'description', concat_ws(' ', nullif(v_item->>'reason', ''), nullif(v_item->>'description', '')),
      'required_for_deposit', coalesce((v_item #>> '{gate_impact,blocks_deposit}')::boolean, false),
      'required_for_deal', coalesce((v_item #>> '{gate_impact,blocks_deal}')::boolean, false),
      'is_required', true,
      'status', nav_v2_private.nav_v2_map_intake_document_status_v1(v_item->>'status'),
      'source_hint', 'intake_scope:' || v_original_side,
      'assigned_to', v_item->>'owner_id',
      'responsible_role', 'spn',
      'due_date', nullif(v_item->>'deadline', '')
    ));
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'risks', '[]'::jsonb)) loop
    if nav_v2_private.nav_v2_map_intake_risk_level_v1(v_item->>'risk_level') = 'red' then
      v_level := 'red';
    elsif v_level <> 'red' and nav_v2_private.nav_v2_map_intake_risk_level_v1(v_item->>'risk_level') = 'yellow' then
      v_level := 'yellow';
    end if;
    v_risks := v_risks || jsonb_build_array(jsonb_build_object(
      'level', nav_v2_private.nav_v2_map_intake_risk_level_v1(v_item->>'risk_level'),
      'category', 'intake',
      'title', coalesce(nullif(v_item->>'title', ''), v_item->>'id'),
      'description', coalesce(v_item->>'expected_decision', v_item->>'description'),
      'recommendation', coalesce(v_item->>'action', v_item->>'expected_decision'),
      'blocks_deposit', coalesce((v_item->>'blocks_deposit')::boolean, false),
      'blocks_deal', coalesce((v_item->>'blocks_deal')::boolean, false),
      'assigned_role', nullif(v_item->>'owner', '')
    ));
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_plan->'tasks', '[]'::jsonb)) loop
    v_owner_role := coalesce(v_item->>'owner_role', '');
    v_tasks := v_tasks || jsonb_build_array(jsonb_build_object(
      'title', coalesce(nullif(v_item->>'action', ''), v_item->>'rule_id'),
      'description', concat_ws(' ', nullif(v_item->>'evidence', ''), nullif(v_item->>'expected_result', '')),
      'assigned_to', v_item->>'owner_id',
      'assigned_role', v_owner_role,
      'status', 'open',
      'priority', nav_v2_private.nav_v2_map_intake_task_priority_v1(v_item),
      'due_date', nullif(v_item->>'deadline', ''),
      'source', 'intake_v1:' || coalesce(v_item->>'rule_id', v_item->>'id'),
      'created_by', v_deal->>'created_by',
      'task_type', nav_v2_private.nav_v2_map_intake_task_type_v1(v_owner_role),
      'sla_days', null
    ));
  end loop;

  v_next_action := coalesce(
    nullif(v_passport->>'spn_next_action', ''),
    (select item->>'action' from jsonb_array_elements(coalesce(p_plan->'tasks', '[]'::jsonb)) item limit 1),
    'Проверить структурированную карточку сделки.'
  );

  return jsonb_build_object(
    'mapping_version', 1,
    'repository_only', true,
    'writes_performed', false,
    'structurally_mappable', true,
    'production_ready', false,
    'production_blockers', jsonb_build_array(
      'privacy_quality_task_collision','authenticated_role_matrix_not_run','deployment_approval_missing'
    ),
    'rule_ids', v_rule_ids,
    'deal', jsonb_build_object(
      'title', concat_ws(' — ', coalesce(nullif(v_deal->>'object_type', ''), 'Объект'), coalesce(nullif(v_deal->>'address', ''), 'ориентир уточняется')),
      'status', 'draft',
      'risk_level', v_level,
      'created_by', v_deal->>'created_by',
      'manager_id', null,
      'seller_spn_id', v_deal->>'seller_spn_id',
      'buyer_spn_id', v_deal->>'buyer_spn_id',
      'lawyer_id', v_deal->>'lawyer_id',
      'broker_id', v_deal->>'broker_id',
      'representation_model', coalesce(v_deal->>'representation_model', 'unknown'),
      'preparation_mode', coalesce(v_deal->>'preparation_mode', 'consult'),
      'object_type', nullif(v_deal->>'object_type', ''),
      'address', nullif(v_deal->>'address', ''),
      'readiness_deposit', 0,
      'readiness_deal', 0,
      'lawyer_needed', exists(select 1 from jsonb_array_elements(coalesce(p_plan->'tasks','[]'::jsonb)) item where item->>'owner_role'='lawyer'),
      'broker_needed', exists(select 1 from jsonb_array_elements(coalesce(p_plan->'tasks','[]'::jsonb)) item where item->>'owner_role'='broker'),
      'has_children', v_rule_ids ?| array['minor_seller','minor_buyer','minor_registered','child_money','matcap'],
      'has_mortgage', v_rule_ids ?| array['mortgage','military_mortgage'],
      'has_matcap', v_rule_ids ? 'matcap',
      'has_nominal_child_money', v_rule_ids ? 'child_money',
      'expenses_agreed', not (v_rule_ids ? 'expenses_not_agreed'),
      'settlements_agreed', not (v_rule_ids ? 'settlements_not_agreed'),
      'documents_min_ready', false,
      'deal_summary', jsonb_build_object(
        'legal_passport', v_passport,
        'intake_work_plan', v_work_plan,
        'mapping_version', 1
      ),
      'wizard_snapshot', coalesce(v_deal->'wizard_snapshot', '{}'::jsonb),
      'next_action', v_next_action,
      'seller_name', null,
      'buyer_name', null,
      'seller_phone', null,
      'buyer_phone', null
    ),
    'participants', v_participants,
    'documents', v_documents,
    'risks', v_risks,
    'tasks', v_tasks,
    'created_event', jsonb_build_object(
      'actor_id', p_plan #>> '{created_event,actor_id}',
      'event_type', 'intake_governed_created',
      'event_title', 'Сделка создана из нового мастера',
      'event_data', coalesce(p_plan #> '{created_event,event_data}', '{}'::jsonb)
        || jsonb_build_object('mapping_version', 1)
    )
  );
end;
$function$;

revoke all on function nav_v2_private.nav_v2_map_intake_document_side_v1(text) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_map_intake_document_status_v1(text) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_map_intake_risk_level_v1(text) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_map_intake_task_type_v1(text) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_map_intake_task_priority_v1(jsonb) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_map_governed_intake_to_production_v1(jsonb) from public, anon, authenticated;

grant execute on function nav_v2_private.nav_v2_map_intake_document_side_v1(text) to service_role;
grant execute on function nav_v2_private.nav_v2_map_intake_document_status_v1(text) to service_role;
grant execute on function nav_v2_private.nav_v2_map_intake_risk_level_v1(text) to service_role;
grant execute on function nav_v2_private.nav_v2_map_intake_task_type_v1(text) to service_role;
grant execute on function nav_v2_private.nav_v2_map_intake_task_priority_v1(jsonb) to service_role;
grant execute on function nav_v2_private.nav_v2_map_governed_intake_to_production_v1(jsonb) to service_role;
