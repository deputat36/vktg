-- Repository-only template. Render with:
-- node scripts/render-nav-v2-intake-server-adapter-v1.mjs --output /tmp/nav_v2_intake_save_adapter_v1.sql
-- Do not add this file to supabase/migrations and do not apply it to production.

create or replace function nav_v2_private.nav_v2_intake_catalog_v1()
returns jsonb
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select $nav_v2_catalog$__NAV_V2_INTAKE_CATALOG_JSON__$nav_v2_catalog$::jsonb;
$function$;

create or replace function nav_v2_private.nav_v2_intake_catalog_sha256_v1()
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select '__NAV_V2_INTAKE_CATALOG_SHA256__'::text;
$function$;

create or replace function nav_v2_private.nav_v2_intake_contains_forbidden_key_v1(p_value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog, nav_v2_private
as $function$
declare
  v_key text;
  v_child jsonb;
  v_compact_key text;
begin
  if p_value is null then
    return false;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    for v_key, v_child in select key, value from jsonb_each(p_value) loop
      v_compact_key := replace(replace(lower(v_key), '_', ''), '-', '');
      if v_compact_key = any(array[
        'phone', 'sellerphone', 'buyerphone', 'clientphone', 'email', 'clientemail',
        'passport', 'passportnumber', 'snils', 'inn', 'bankcard', 'cardnumber',
        'bankaccount', 'accountnumber', 'clientname', 'sellername', 'buyername',
        'fullname', 'documentnumber', 'scan', 'signature', 'documentcontent'
      ]) then
        return true;
      end if;
      if nav_v2_private.nav_v2_intake_contains_forbidden_key_v1(v_child) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(p_value) = 'array' then
    for v_child in select value from jsonb_array_elements(p_value) loop
      if nav_v2_private.nav_v2_intake_contains_forbidden_key_v1(v_child) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end;
$function$;

create or replace function nav_v2_private.nav_v2_intake_show_when_matches_v1(
  p_draft jsonb,
  p_show_when jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_key text;
  v_allowed jsonb;
  v_actual text;
begin
  if p_show_when is null or jsonb_typeof(p_show_when) <> 'object' then
    return true;
  end if;

  for v_key, v_allowed in select key, value from jsonb_each(p_show_when) loop
    v_actual := case v_key
      when 'representation' then coalesce(p_draft->>'representation', '')
      when 'request_type' then coalesce(p_draft->>'requestType', '')
      when 'object_type' then coalesce(p_draft->>'objectType', '')
      when 'stage' then coalesce(p_draft->>'stage', '')
      else ''
    end;
    if jsonb_typeof(v_allowed) = 'array'
       and jsonb_array_length(v_allowed) > 0
       and not exists (select 1 from jsonb_array_elements_text(v_allowed) item where item = v_actual) then
      return false;
    end if;
  end loop;

  return true;
end;
$function$;

create or replace function nav_v2_private.nav_v2_intake_rule_matches_v1(
  p_draft jsonb,
  p_rule jsonb,
  p_catalog jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog, nav_v2_private
as $function$
declare
  v_trigger jsonb := coalesce(p_rule->'trigger', '{}'::jsonb);
  v_kind text := coalesce(v_trigger->>'kind', '');
  v_key text := coalesce(v_trigger->>'key', '');
  v_actual text;
  v_question jsonb;
begin
  if v_kind = 'fact' then
    select question into v_question
    from jsonb_array_elements(coalesce(p_catalog->'fact_questions', '[]'::jsonb)) question
    where question->>'id' = v_key
    limit 1;
    if v_question is null
       or not nav_v2_private.nav_v2_intake_show_when_matches_v1(p_draft, v_question->'show_when') then
      return false;
    end if;
    v_actual := coalesce(p_draft #>> array['facts', v_key, 'value'], 'unknown');
  elsif v_kind = 'object_type' then
    v_actual := coalesce(p_draft->>'objectType', '');
  elsif v_kind = 'representation' then
    v_actual := coalesce(p_draft->>'representation', '');
  elsif v_kind = 'stage' then
    v_actual := coalesce(p_draft->>'stage', '');
  else
    return false;
  end if;

  return exists (
    select 1
    from jsonb_array_elements_text(coalesce(v_trigger->'values', '[]'::jsonb)) expected
    where expected = v_actual
  );
end;
$function$;

create or replace function nav_v2_private.nav_v2_prepare_intake_save_v1(p_result jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, nav_v2_private
as $function$
declare
  v_catalog jsonb := nav_v2_private.nav_v2_intake_catalog_v1();
  v_deal jsonb;
  v_draft jsonb;
  v_action text;
  v_representation text;
  v_request_type text;
  v_stage text;
  v_object_type text;
  v_object_reason text;
  v_urgency text;
  v_target_date text;
  v_next_action text;
  v_lawyer_request text;
  v_requested_decision text;
  v_matched_rules jsonb;
  v_primary_lawyer_rule jsonb;
  v_lawyer_needed boolean;
  v_broker_needed boolean;
  v_accompanied_sides jsonb := '[]'::jsonb;
  v_documents jsonb := '[]'::jsonb;
  v_skipped_documents jsonb := '[]'::jsonb;
  v_task_candidates jsonb := '[]'::jsonb;
  v_confirmed_facts jsonb := '[]'::jsonb;
  v_reported_facts jsonb := '[]'::jsonb;
  v_unknown_facts jsonb := '[]'::jsonb;
  v_passport_documents jsonb;
  v_risk_flags jsonb;
  v_legal_passport jsonb;
  v_work_plan jsonb;
  v_draft_missing jsonb := '[]'::jsonb;
  v_card_missing jsonb := '[]'::jsonb;
  v_handoff_missing jsonb := '[]'::jsonb;
  v_handoff_critical jsonb := '[]'::jsonb;
  v_handoff_state text;
  v_allowed boolean := false;
  v_prepared_deal jsonb;
  v_prepared_payload jsonb;
  v_key text;
  v_fact jsonb;
  v_document jsonb;
  v_definition jsonb;
begin
  if p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'Некорректный intake payload: ожидался JSON-объект' using errcode = '22023';
  end if;
  if length(p_result::text) > 200000 then
    raise exception 'Некорректный intake payload: слишком большой payload' using errcode = '22023';
  end if;

  v_deal := p_result->'deal';
  if v_deal is null or jsonb_typeof(v_deal) <> 'object' then
    raise exception 'Некорректный intake payload: deal должен быть объектом' using errcode = '22023';
  end if;
  if coalesce((v_deal->>'intake_contract_version')::int, 0) <> 1 then
    raise exception 'Неподдерживаемая версия intake contract' using errcode = '22023';
  end if;
  if coalesce(v_deal->>'intake_catalog_version', '') <> coalesce(v_catalog->>'catalog_version', '') then
    raise exception 'Версия intake catalog не совпадает с серверной' using errcode = '22023';
  end if;

  v_draft := v_deal->'intake_draft';
  if v_draft is null or jsonb_typeof(v_draft) <> 'object' then
    raise exception 'Некорректный intake payload: intake_draft должен быть объектом' using errcode = '22023';
  end if;
  if nav_v2_private.nav_v2_intake_contains_forbidden_key_v1(v_draft)
     or nav_v2_private.nav_v2_intake_contains_forbidden_key_v1(v_deal->'legal_passport')
     or nav_v2_private.nav_v2_intake_contains_forbidden_key_v1(v_deal->'intake_work_plan') then
    raise exception 'Intake payload содержит запрещённые персональные или документные поля' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_object_keys(v_draft) key
    where key <> all(array[
      'requestType', 'representation', 'stage', 'objectType', 'objectAddress',
      'objectNotSelectedReason', 'cadastralNumberKnown', 'urgency', 'targetDate',
      'dateUnknown', 'leadSpnConfirmed', 'nextAction', 'lawyerRequestType',
      'requestedDecision', 'lawyerRequestConfirmed', 'lawyerQuestion',
      'documentsReviewed', 'facts', 'documents', 'depositRequired',
      'depositAmountKnown', 'depositConditionsKnown', 'settlementTerms',
      'expenseTerms', 'partnerSide', 'accompaniedSides'
    ])
  ) then
    raise exception 'Intake draft содержит неизвестное поле' using errcode = '22023';
  end if;

  v_action := coalesce(v_deal->>'intake_action', 'draft');
  if v_action <> all(array['draft', 'self', 'lawyer', 'broker']) then
    raise exception 'Некорректное intake action' using errcode = '22023';
  end if;

  v_request_type := btrim(coalesce(v_draft->>'requestType', ''));
  v_representation := btrim(coalesce(v_draft->>'representation', ''));
  v_stage := btrim(coalesce(v_draft->>'stage', ''));
  v_object_type := btrim(coalesce(v_draft->>'objectType', ''));
  v_object_reason := btrim(coalesce(v_draft->>'objectNotSelectedReason', ''));
  v_urgency := btrim(coalesce(v_draft->>'urgency', ''));
  v_target_date := case when coalesce((v_draft->>'dateUnknown')::boolean, false) then '' else btrim(coalesce(v_draft->>'targetDate', '')) end;
  v_next_action := btrim(coalesce(v_draft->>'nextAction', ''));

  if v_request_type <> '' and not exists (select 1 from jsonb_array_elements(v_catalog->'request_types') item where item->>'id' = v_request_type) then
    raise exception 'Некорректный режим подготовки' using errcode = '22023';
  end if;
  if v_representation <> '' and not exists (select 1 from jsonb_array_elements(v_catalog->'representations') item where item->>'id' = v_representation) then
    raise exception 'Некорректная модель сопровождения' using errcode = '22023';
  end if;
  if v_stage <> '' and not exists (select 1 from jsonb_array_elements(v_catalog->'stages') item where item->>'id' = v_stage) then
    raise exception 'Некорректная стадия' using errcode = '22023';
  end if;
  if v_object_type <> '' and not exists (select 1 from jsonb_array_elements(v_catalog->'object_types') item where item->>'id' = v_object_type) then
    raise exception 'Некорректный тип объекта' using errcode = '22023';
  end if;
  if v_urgency <> '' and v_urgency <> all(array['normal', 'urgent', 'critical']) then
    raise exception 'Некорректная срочность' using errcode = '22023';
  end if;
  if v_target_date <> '' and v_target_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Некорректная ближайшая дата' using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(v_draft->'facts'), 'object') <> 'object' then
    raise exception 'facts должен быть объектом' using errcode = '22023';
  end if;
  for v_key, v_fact in select key, value from jsonb_each(coalesce(v_draft->'facts', '{}'::jsonb)) loop
    if not exists (select 1 from jsonb_array_elements(v_catalog->'fact_questions') item where item->>'id' = v_key) then
      raise exception 'Неизвестный intake fact: %', v_key using errcode = '22023';
    end if;
    if jsonb_typeof(v_fact) <> 'object'
       or coalesce(v_fact->>'value', 'unknown') <> all(array['yes', 'no', 'unknown', 'not_applicable'])
       or coalesce(v_fact->>'source', 'unchecked') <> all(array['document', 'client', 'unchecked']) then
      raise exception 'Некорректное значение intake fact: %', v_key using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_object_keys(v_fact) key where key <> all(array['value', 'source'])) then
      raise exception 'Intake fact содержит неизвестное поле: %', v_key using errcode = '22023';
    end if;
  end loop;

  if coalesce(jsonb_typeof(v_draft->'documents'), 'array') <> 'array' then
    raise exception 'documents должен быть массивом' using errcode = '22023';
  end if;
  for v_document in select value from jsonb_array_elements(coalesce(v_draft->'documents', '[]'::jsonb)) loop
    if jsonb_typeof(v_document) <> 'object'
       or coalesce(v_document->>'status', '') <> all(array['available', 'requested', 'missing', 'problem']) then
      raise exception 'Некорректный статус intake document' using errcode = '22023';
    end if;
    select item into v_definition
    from jsonb_array_elements(v_catalog->'document_types') item
    where item->>'id' = v_document->>'type'
    limit 1;
    if v_definition is null then
      raise exception 'Неизвестный тип intake document' using errcode = '22023';
    end if;
    if v_document ? 'title' and v_document->>'title' <> v_definition->>'title' then
      raise exception 'Название intake document не совпадает с каталогом' using errcode = '22023';
    end if;
    if v_document ? 'side' and v_document->>'side' <> v_definition->>'side' then
      raise exception 'Сторона intake document не совпадает с каталогом' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_object_keys(v_document) key where key <> all(array['type', 'title', 'side', 'status'])) then
      raise exception 'Intake document содержит неизвестное поле' using errcode = '22023';
    end if;
  end loop;

  select coalesce(jsonb_agg(rule order by
    case rule->>'risk_level' when 'red' then 4 when 'yellow' then 3 when 'info' then 2 when 'green' then 1 else 0 end desc,
    coalesce((rule->>'priority')::int, 0) desc,
    rule->>'id'
  ), '[]'::jsonb)
  into v_matched_rules
  from jsonb_array_elements(v_catalog->'rules') rule
  where nav_v2_private.nav_v2_intake_rule_matches_v1(v_draft, rule, v_catalog);

  select rule into v_primary_lawyer_rule
  from jsonb_array_elements(v_matched_rules) rule
  where rule->>'owner' = 'lawyer' and coalesce(rule->>'lawyer_request_type', '') <> ''
  limit 1;

  v_lawyer_needed := exists (select 1 from jsonb_array_elements(v_matched_rules) rule where rule->>'owner' = 'lawyer');
  v_broker_needed := exists (select 1 from jsonb_array_elements(v_matched_rules) rule where rule->>'owner' = 'broker');
  if exists (
    select 1 from jsonb_array_elements(v_matched_rules) rule
    where rule->>'owner' = 'broker' and rule->>'id' <> all(array['mortgage', 'military_mortgage'])
  ) then
    raise exception 'Broker scope нарушает mortgage-only contract' using errcode = '22023';
  end if;

  v_lawyer_request := btrim(coalesce(nullif(v_draft->>'lawyerRequestType', ''), v_primary_lawyer_rule->>'lawyer_request_type', ''));
  if v_lawyer_request <> '' and not exists (select 1 from jsonb_array_elements(v_catalog->'lawyer_request_types') item where item->>'id' = v_lawyer_request) then
    raise exception 'Некорректный тип запроса юристу' using errcode = '22023';
  end if;
  v_requested_decision := btrim(coalesce(nullif(v_draft->>'requestedDecision', ''), v_primary_lawyer_rule->>'expected_decision', ''));
  if v_action = 'lawyer'
     and coalesce((v_draft->>'lawyerRequestConfirmed')::boolean, false)
     and v_lawyer_request <> '' then
    v_lawyer_needed := true;
  end if;

  if jsonb_typeof(v_draft->'accompaniedSides') = 'array' then
    select coalesce(jsonb_agg(distinct side), '[]'::jsonb) into v_accompanied_sides
    from jsonb_array_elements_text(v_draft->'accompaniedSides') side
    where side in ('seller', 'buyer');
  elsif v_representation = 'seller' then
    v_accompanied_sides := '["seller"]'::jsonb;
  elsif v_representation = 'buyer' then
    v_accompanied_sides := '["buyer"]'::jsonb;
  elsif v_representation in ('one_spn_both', 'both') then
    v_accompanied_sides := '["seller","buyer"]'::jsonb;
  elsif v_representation = 'partner_agency' and v_draft->>'partnerSide' = 'seller' then
    v_accompanied_sides := '["seller"]'::jsonb;
  elsif v_representation = 'partner_agency' and v_draft->>'partnerSide' = 'buyer' then
    v_accompanied_sides := '["buyer"]'::jsonb;
  elsif v_representation = 'partner_agency' and v_draft->>'partnerSide' = 'both' then
    v_accompanied_sides := '["seller","buyer"]'::jsonb;
  end if;

  with required as (
    select distinct rule->>'id' as rule_id, document_id
    from jsonb_array_elements(v_matched_rules) rule
    cross join lateral jsonb_array_elements_text(coalesce(rule->'documents', '[]'::jsonb)) document_id
  ), grouped as (
    select document_id, jsonb_agg(rule_id order by rule_id) as rule_ids
    from required group by document_id
  ), definitions as (
    select item->>'id' as type, item->>'title' as title, item->>'side' as side
    from jsonb_array_elements(v_catalog->'document_types') item
  ), planned as (
    select d.*, g.rule_ids,
      (select doc->>'status' from jsonb_array_elements(coalesce(v_draft->'documents', '[]'::jsonb)) doc where doc->>'type' = d.type limit 1) as status,
      (d.side in ('object', 'deal') or exists (select 1 from jsonb_array_elements_text(v_accompanied_sides) side where side = d.side)) as included
    from grouped g join definitions d on d.type = g.document_id
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'type', type, 'title', title, 'side', side, 'status', status,
      'owner_role', case side when 'seller' then 'seller_spn' when 'buyer' then 'buyer_spn' else 'lead_spn' end,
      'assignment_state', 'needs_server_assignment', 'rule_ids', rule_ids
    ) order by type) filter (where included), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'type', type, 'title', title, 'side', side,
      'reason', 'side_not_accompanied', 'rule_ids', rule_ids
    ) order by type) filter (where not included), '[]'::jsonb)
  into v_documents, v_skipped_documents
  from planned;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', 'intake-rule:' || rule->>'id',
    'rule_id', rule->>'id',
    'owner_role', rule->>'owner',
    'assignment_state', 'needs_server_assignment',
    'action', case
      when rule->>'owner' = 'lawyer' then 'Рассмотреть запрос: ' || coalesce((select item->>'title' from jsonb_array_elements(v_catalog->'lawyer_request_types') item where item->>'id' = rule->>'lawyer_request_type' limit 1), rule->>'id') || '.'
      when rule->>'owner' = 'broker' then rule->>'broker_action'
      else rule->>'spn_action'
    end,
    'deadline_rule', case when v_target_date <> '' then 'target_date' when coalesce((rule->>'blocks_deposit')::boolean, false) then 'before_deposit' when coalesce((rule->>'blocks_deal')::boolean, false) then 'before_deal' else 'next_review' end,
    'deadline', nullif(v_target_date, ''),
    'evidence', case when jsonb_array_length(coalesce(rule->'documents', '[]'::jsonb)) > 0 then 'structured_document_statuses' when rule->>'owner' = 'broker' then 'mortgage_part_status' when rule->>'owner' = 'lawyer' then 'structured_legal_decision' else 'structured_condition_status' end,
    'expected_result', case when rule->>'owner' = 'lawyer' then rule->>'expected_decision' when rule->>'owner' = 'broker' then 'mortgage_ready_or_needs_information_or_not_ready' else 'agreed_or_open_question_with_owner_and_deadline' end,
    'creation_state', 'needs_server_assignment',
    'gate_impact', jsonb_build_object('blocks_deposit', coalesce((rule->>'blocks_deposit')::boolean, false), 'blocks_deal', coalesce((rule->>'blocks_deal')::boolean, false))
  ) order by rule->>'id'), '[]'::jsonb)
  into v_task_candidates
  from jsonb_array_elements(v_matched_rules) rule;

  with active_questions as (
    select question
    from jsonb_array_elements(v_catalog->'fact_questions') question
    where nav_v2_private.nav_v2_intake_show_when_matches_v1(v_draft, question->'show_when')
  ), facts as (
    select question->>'id' as id, question->>'title' as title,
      coalesce(v_draft #>> array['facts', question->>'id', 'value'], 'unknown') as value,
      coalesce(v_draft #>> array['facts', question->>'id', 'source'], 'unchecked') as source
    from active_questions
  )
  select
    coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'value', value) order by id) filter (where value in ('yes','no') and source = 'document'), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title, 'value', value) order by id) filter (where value in ('yes','no') and source = 'client'), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('id', id, 'title', title) order by id) filter (where value = 'unknown' or (value in ('yes','no') and source = 'unchecked')), '[]'::jsonb)
  into v_confirmed_facts, v_reported_facts, v_unknown_facts
  from facts;

  select jsonb_build_object(
    'available', coalesce(jsonb_agg(jsonb_build_object('type', item->>'type', 'title', item->>'title', 'side', item->>'side') order by item->>'type') filter (where item->>'status' = 'available'), '[]'::jsonb),
    'requested', coalesce(jsonb_agg(jsonb_build_object('type', item->>'type', 'title', item->>'title', 'side', item->>'side') order by item->>'type') filter (where item->>'status' = 'requested'), '[]'::jsonb),
    'missing', coalesce(jsonb_agg(jsonb_build_object('type', item->>'type', 'title', item->>'title', 'side', item->>'side') order by item->>'type') filter (where item->>'status' = 'missing'), '[]'::jsonb),
    'problem', coalesce(jsonb_agg(jsonb_build_object('type', item->>'type', 'title', item->>'title', 'side', item->>'side') order by item->>'type') filter (where item->>'status' = 'problem'), '[]'::jsonb)
  into v_passport_documents
  from jsonb_array_elements(v_documents) item;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rule->>'id', 'level', rule->>'risk_level',
    'blocks_deposit', coalesce((rule->>'blocks_deposit')::boolean, false),
    'blocks_deal', coalesce((rule->>'blocks_deal')::boolean, false),
    'owner', rule->>'owner', 'required_documents', coalesce(rule->'documents', '[]'::jsonb)
  ) order by rule->>'id'), '[]'::jsonb)
  into v_risk_flags
  from jsonb_array_elements(v_matched_rules) rule;

  if v_request_type = '' then v_draft_missing := v_draft_missing || '"request_type"'::jsonb; end if;
  if v_stage = '' then v_draft_missing := v_draft_missing || '"stage"'::jsonb; end if;
  if v_representation = '' then v_draft_missing := v_draft_missing || '"representation"'::jsonb; end if;
  if not (v_object_type <> '' and v_object_type <> 'not_selected') and v_object_reason = '' then v_draft_missing := v_draft_missing || '"object"'::jsonb; end if;

  v_card_missing := v_draft_missing;
  if coalesce((v_draft->>'leadSpnConfirmed')::boolean, false) is not true then v_card_missing := v_card_missing || '"lead_spn"'::jsonb; end if;
  if v_next_action = '' then v_card_missing := v_card_missing || '"next_action"'::jsonb; end if;
  if v_target_date = '' and coalesce((v_draft->>'dateUnknown')::boolean, false) is not true then v_card_missing := v_card_missing || '"target_date"'::jsonb; end if;

  if v_lawyer_request = '' then v_handoff_missing := v_handoff_missing || '"lawyer_request_type"'::jsonb; v_handoff_critical := v_handoff_critical || '"lawyer_request_type"'::jsonb; end if;
  if v_requested_decision = '' then v_handoff_missing := v_handoff_missing || '"requested_decision"'::jsonb; v_handoff_critical := v_handoff_critical || '"requested_decision"'::jsonb; end if;
  if coalesce((v_draft->>'lawyerRequestConfirmed')::boolean, false) is not true then v_handoff_missing := v_handoff_missing || '"lawyer_request_confirmation"'::jsonb; v_handoff_critical := v_handoff_critical || '"lawyer_request_confirmation"'::jsonb; end if;
  if v_urgency = '' and v_target_date = '' then v_handoff_missing := v_handoff_missing || '"urgency"'::jsonb; end if;
  if not (v_object_type <> '' and v_object_type <> 'not_selected') and v_object_reason = '' then v_handoff_missing := v_handoff_missing || '"object"'::jsonb; v_handoff_critical := v_handoff_critical || '"object"'::jsonb; end if;
  if v_representation = '' then v_handoff_missing := v_handoff_missing || '"representation"'::jsonb; v_handoff_critical := v_handoff_critical || '"representation"'::jsonb; end if;
  if jsonb_array_length(v_confirmed_facts) + jsonb_array_length(v_reported_facts) = 0 then v_handoff_missing := v_handoff_missing || '"known_facts"'::jsonb; end if;
  if exists (select 1 from jsonb_array_elements(v_documents) item where item->>'status' is null) then v_handoff_missing := v_handoff_missing || '"documents"'::jsonb; end if;
  if v_next_action = '' then v_handoff_missing := v_handoff_missing || '"next_action"'::jsonb; v_handoff_critical := v_handoff_critical || '"next_action"'::jsonb; end if;

  v_handoff_state := case
    when jsonb_array_length(v_handoff_missing) = 0 then 'ready'
    when v_urgency in ('urgent', 'critical') and jsonb_array_length(v_handoff_critical) = 0 then 'urgent_incomplete'
    else 'blocked'
  end;

  v_allowed := case v_action
    when 'draft' then jsonb_array_length(v_draft_missing) = 0
    when 'self' then jsonb_array_length(v_card_missing) = 0
    when 'lawyer' then v_lawyer_needed and v_handoff_state in ('ready', 'urgent_incomplete')
    when 'broker' then v_broker_needed and jsonb_array_length(v_card_missing) = 0
    else false
  end;

  v_legal_passport := jsonb_build_object(
    'version', 1,
    'catalog_version', v_catalog->>'catalog_version',
    'request_type', v_lawyer_request,
    'requested_decision', v_requested_decision,
    'urgency', v_urgency,
    'target_date', nullif(v_target_date, ''),
    'preparation_mode', v_request_type,
    'stage', v_stage,
    'representation_model', v_representation,
    'object', jsonb_build_object('type', v_object_type, 'address', btrim(coalesce(v_draft->>'objectAddress', '')), 'cadastral_number_known', coalesce(nullif(v_draft->>'cadastralNumberKnown', ''), 'unknown')),
    'confirmed_facts', v_confirmed_facts,
    'client_reported_facts', v_reported_facts,
    'unknown_facts', v_unknown_facts,
    'risk_flags', v_risk_flags,
    'documents', v_passport_documents,
    'settlements', jsonb_build_object('status', case coalesce(v_draft #>> '{facts,settlements_agreed,value}', 'unknown') when 'yes' then 'agreed' when 'no' then 'not_agreed' when 'not_applicable' then 'not_applicable' else 'unknown' end, 'known_terms', coalesce(v_draft->'settlementTerms', '[]'::jsonb)),
    'expenses', jsonb_build_object('status', case coalesce(v_draft #>> '{facts,expenses_agreed,value}', 'unknown') when 'yes' then 'agreed' when 'no' then 'not_agreed' when 'not_applicable' then 'not_applicable' else 'unknown' end, 'known_terms', coalesce(v_draft->'expenseTerms', '[]'::jsonb)),
    'deposit', jsonb_build_object('required', v_draft->'depositRequired', 'amount_known', v_draft->'depositAmountKnown', 'conditions_known', v_draft->'depositConditionsKnown'),
    'spn_next_action', v_next_action,
    'lawyer_question', btrim(coalesce(v_draft->>'lawyerQuestion', '')),
    'specialists', jsonb_build_object('lawyer', v_lawyer_needed, 'broker', v_broker_needed, 'broker_scope', case when v_broker_needed then 'mortgage_only' else 'not_required' end),
    'handoff_completeness', jsonb_build_object('state', v_handoff_state, 'missing', v_handoff_missing)
  );

  v_work_plan := jsonb_build_object(
    'version', 1,
    'catalog_version', v_catalog->>'catalog_version',
    'accompanied_sides', v_accompanied_sides,
    'document_candidates', v_documents,
    'skipped_documents', v_skipped_documents,
    'task_candidates', v_task_candidates,
    'ready_tasks', '[]'::jsonb,
    'assignment_source', 'server_required'
  );

  v_prepared_deal := (v_deal - 'legal_passport' - 'intake_work_plan')
    || jsonb_build_object('legal_passport', v_legal_passport, 'intake_work_plan', v_work_plan);
  v_prepared_payload := jsonb_set(p_result, '{deal}', v_prepared_deal, true);

  return jsonb_build_object(
    'adapter_version', 1,
    'contract_version', 1,
    'catalog_version', v_catalog->>'catalog_version',
    'catalog_sha256', nav_v2_private.nav_v2_intake_catalog_sha256_v1(),
    'repository_only', true,
    'writes_performed', false,
    'action', v_action,
    'allowed', v_allowed,
    'matched_rule_ids', coalesce((select jsonb_agg(rule->>'id' order by rule->>'id') from jsonb_array_elements(v_matched_rules) rule), '[]'::jsonb),
    'routing', jsonb_build_object('lawyer_needed', v_lawyer_needed, 'broker_needed', v_broker_needed, 'broker_scope', case when v_broker_needed then 'mortgage_only' else 'not_required' end),
    'gates', jsonb_build_object(
      'save_draft', jsonb_build_object('allowed', jsonb_array_length(v_draft_missing) = 0, 'missing', v_draft_missing),
      'form_card', jsonb_build_object('allowed', jsonb_array_length(v_card_missing) = 0, 'missing', v_card_missing),
      'handoff_lawyer', jsonb_build_object('allowed', v_handoff_state in ('ready', 'urgent_incomplete'), 'state', v_handoff_state, 'missing', v_handoff_missing)
    ),
    'legal_passport', v_legal_passport,
    'work_plan', v_work_plan,
    'prepared_payload', v_prepared_payload
  );
end;
$function$;

comment on function nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb) is
  'Repository-only pure adapter v1. Recomputes intake routing, legal passport and work plan from canonical catalog; performs no writes.';

revoke all on function nav_v2_private.nav_v2_intake_catalog_v1() from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_intake_catalog_sha256_v1() from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_intake_contains_forbidden_key_v1(jsonb) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_intake_show_when_matches_v1(jsonb, jsonb) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_intake_rule_matches_v1(jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb) from public, anon, authenticated;

grant execute on function nav_v2_private.nav_v2_intake_catalog_v1() to service_role;
grant execute on function nav_v2_private.nav_v2_intake_catalog_sha256_v1() to service_role;
grant execute on function nav_v2_private.nav_v2_intake_contains_forbidden_key_v1(jsonb) to service_role;
grant execute on function nav_v2_private.nav_v2_intake_show_when_matches_v1(jsonb, jsonb) to service_role;
grant execute on function nav_v2_private.nav_v2_intake_rule_matches_v1(jsonb, jsonb, jsonb) to service_role;
grant execute on function nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb) to service_role;
