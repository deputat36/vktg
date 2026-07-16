\set ON_ERROR_STOP on

create schema harness;

create or replace function harness.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
set search_path = pg_catalog
as $$
begin
  if coalesce(p_condition, false) is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$$;

do $ddl$
begin
  perform harness.assert_true(
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'nav_consultations_v2'
        and column_name = 'client_request_id' and data_type = 'uuid'
    ),
    'client_request_id column is missing'
  );
  perform harness.assert_true(
    exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'nav_consultations_v2'
        and column_name = 'conversion_mode' and data_type = 'text'
    ),
    'conversion_mode column is missing'
  );
  perform harness.assert_true(
    to_regclass('public.nav_consultations_creator_request_unique_idx') is not null,
    'idempotency index is missing'
  );
  perform harness.assert_true(
    to_regprocedure('public.nav_v2_decide_consultation(uuid,text,text)') is null,
    'legacy three-argument decide RPC still exists'
  );
  perform harness.assert_true(
    to_regprocedure('public.nav_v2_decide_consultation(uuid,text,text,text)') is not null,
    'hardened four-argument decide RPC is missing'
  );
  perform harness.assert_true(
    (select relrowsecurity from pg_class where oid = 'public.nav_consultations_v2'::regclass),
    'consultations RLS is not enabled'
  );
  perform harness.assert_true(
    (select relrowsecurity from pg_class where oid = 'public.nav_consultation_messages_v2'::regclass),
    'messages RLS is not enabled'
  );
  perform harness.assert_true(
    not has_table_privilege('authenticated', 'public.nav_consultations_v2', 'SELECT'),
    'authenticated unexpectedly has direct consultation table access'
  );
  perform harness.assert_true(
    not has_table_privilege('authenticated', 'public.nav_consultation_messages_v2', 'SELECT'),
    'authenticated unexpectedly has direct message table access'
  );
  perform harness.assert_true(
    not has_function_privilege('authenticated', 'public.nav_v2_create_consultation(jsonb)', 'EXECUTE'),
    'authenticated unexpectedly has create RPC EXECUTE'
  );
  perform harness.assert_true(
    not has_function_privilege('authenticated', 'public.nav_v2_get_consultation_queue(integer)', 'EXECUTE'),
    'authenticated unexpectedly has queue RPC EXECUTE'
  );
  perform harness.assert_true(
    not has_function_privilege('authenticated', 'public.nav_v2_decide_consultation(uuid,text,text,text)', 'EXECUTE'),
    'authenticated unexpectedly has decide RPC EXECUTE'
  );
  perform harness.assert_true(
    has_function_privilege('service_role', 'public.nav_v2_create_consultation(jsonb)', 'EXECUTE'),
    'service_role lacks create RPC EXECUTE for isolated harness'
  );
  perform harness.assert_true(
    has_function_privilege('service_role', 'public.nav_v2_decide_consultation(uuid,text,text,text)', 'EXECUTE'),
    'service_role lacks decide RPC EXECUTE for isolated harness'
  );
end;
$ddl$;

do $lifecycle$
declare
  c_spn_a uuid;
  c_spn_b uuid;
  c_convert uuid;
  r jsonb;
  repeated jsonb;
  q jsonb;
  detail jsonb;
  conversion jsonb;
  failed boolean;
begin
  -- SPN A creates a matcap consultation. Broker must not be routed.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000020', false);
  r := public.nav_v2_create_consultation(jsonb_build_object(
    'client_request_id', '10000000-0000-4000-8000-000000000001',
    'question', 'нужно проверить условия использования материнского капитала до задатка',
    'safe_reference', 'северный микрорайон, кирпичный дом',
    'request_type', 'deposit_precheck',
    'representation_model', 'buyer',
    'object_type', 'flat',
    'stage', 'deposit_soon',
    'funding_sources', jsonb_build_array('matcap'),
    'circumstances', jsonb_build_array('child_money'),
    'planned_event_date', (current_date + 3)::text,
    'has_external_documents', true
  ));
  c_spn_a := (r ->> 'consultation_id')::uuid;
  perform harness.assert_true((r ->> 'idempotent')::boolean is false, 'first create must not be idempotent');
  perform harness.assert_true((r #>> '{route,broker_parallel}')::boolean is false, 'matcap without mortgage routed to broker');

  repeated := public.nav_v2_create_consultation(jsonb_build_object(
    'client_request_id', '10000000-0000-4000-8000-000000000001',
    'question', 'нужно проверить условия использования материнского капитала до задатка',
    'safe_reference', 'северный микрорайон, кирпичный дом',
    'request_type', 'deposit_precheck',
    'representation_model', 'buyer',
    'object_type', 'flat',
    'stage', 'deposit_soon',
    'funding_sources', jsonb_build_array('matcap'),
    'circumstances', jsonb_build_array('child_money'),
    'planned_event_date', (current_date + 3)::text,
    'has_external_documents', true
  ));
  perform harness.assert_true((repeated ->> 'idempotent')::boolean, 'repeat create must be idempotent');
  perform harness.assert_true((repeated ->> 'consultation_id')::uuid = c_spn_a, 'repeat create returned another consultation');
  perform harness.assert_true(
    (select count(*) from public.nav_consultations_v2 where created_by = '00000000-0000-4000-8000-000000000020') = 1,
    'idempotent create inserted a duplicate consultation'
  );
  perform harness.assert_true(
    (select count(*) from public.nav_consultation_messages_v2 where consultation_id = c_spn_a and message_type = 'question') = 1,
    'idempotent create inserted a duplicate question message'
  );

  -- Unknown keys and obvious identifiers are rejected server-side.
  failed := false;
  begin
    perform public.nav_v2_create_consultation(jsonb_build_object(
      'client_request_id', '10000000-0000-4000-8000-000000000002',
      'question', 'нужно проверить документы до встречи с участниками сделки',
      'safe_reference', 'район центра, вторичный рынок',
      'client_phone', '+7 900 000-00-00'
    ));
  exception when sqlstate '22023' then failed := true;
  end;
  perform harness.assert_true(failed, 'unknown payload key was not rejected');

  failed := false;
  begin
    perform public.nav_v2_create_consultation(jsonb_build_object(
      'client_request_id', '10000000-0000-4000-8000-000000000003',
      'question', 'нужно проверить документы Иван Иванов перед планируемым задатком',
      'safe_reference', 'район центра, вторичный рынок'
    ));
  exception when sqlstate '22023' then failed := true;
  end;
  perform harness.assert_true(failed, 'possible full name was not rejected');

  failed := false;
  begin
    perform public.nav_v2_create_consultation(jsonb_build_object(
      'client_request_id', '10000000-0000-4000-8000-000000000004',
      'question', 'нужно проверить условия задатка по объекту вторичного рынка',
      'safe_reference', 'северный микрорайон, квартира 57'
    ));
  exception when sqlstate '22023' then failed := true;
  end;
  perform harness.assert_true(failed, 'unit-level address was not rejected');

  -- SPN B creates mortgage + matcap. Broker scope is mortgage-only and parallel.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000021', false);
  r := public.nav_v2_create_consultation(jsonb_build_object(
    'client_request_id', '20000000-0000-4000-8000-000000000001',
    'question', 'нужно разделить ипотечную консультацию и юридические условия маткапитала',
    'safe_reference', 'городская черта, дом с земельным участком',
    'request_type', 'legal_answer',
    'representation_model', 'buyer',
    'object_type', 'house_land',
    'stage', 'question',
    'funding_sources', jsonb_build_array('mortgage', 'matcap'),
    'circumstances', jsonb_build_array('child_money'),
    'has_external_documents', false
  ));
  c_spn_b := (r ->> 'consultation_id')::uuid;
  perform harness.assert_true((r #>> '{route,broker_parallel}')::boolean, 'mortgage did not create parallel broker scope');
  perform harness.assert_true(
    r #>> '{route,broker_scope}' = 'Ипотечная консультация, программа и одобрение',
    'broker scope expanded beyond mortgage consultation/program/approval'
  );

  -- SPNs list only their own active consultations.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000020', false);
  q := public.nav_v2_get_consultation_queue(100);
  perform harness.assert_true(jsonb_array_length(q -> 'items') = 1, 'SPN A queue contains another employee consultation');
  perform harness.assert_true((q #>> '{items,0,id}')::uuid = c_spn_a, 'SPN A queue returned wrong consultation');

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000021', false);
  q := public.nav_v2_get_consultation_queue(100);
  perform harness.assert_true(jsonb_array_length(q -> 'items') = 1, 'SPN B queue contains another employee consultation');
  perform harness.assert_true((q #>> '{items,0,id}')::uuid = c_spn_b, 'SPN B queue returned wrong consultation');

  -- Managers see only their teams.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000010', false);
  q := public.nav_v2_get_consultation_queue(100);
  perform harness.assert_true(jsonb_array_length(q -> 'items') = 1, 'Manager A queue scope is incorrect');
  perform harness.assert_true((q #>> '{items,0,id}')::uuid = c_spn_a, 'Manager A received another team consultation');

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000011', false);
  q := public.nav_v2_get_consultation_queue(100);
  perform harness.assert_true(jsonb_array_length(q -> 'items') = 1, 'Manager B queue scope is incorrect');
  perform harness.assert_true((q #>> '{items,0,id}')::uuid = c_spn_b, 'Manager B received another team consultation');

  -- Broker and viewer cannot access the legal list.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000040', false);
  failed := false;
  begin
    perform public.nav_v2_get_consultation_queue(100);
  exception when insufficient_privilege then failed := true;
  end;
  perform harness.assert_true(failed, 'broker accessed legal consultation queue');

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000041', false);
  failed := false;
  begin
    perform public.nav_v2_get_consultation_queue(100);
  exception when insufficient_privilege then failed := true;
  end;
  perform harness.assert_true(failed, 'viewer accessed consultation queue');

  -- Lawyer A asks for clarification; requester replies; lawyer answers.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000030', false);
  q := public.nav_v2_get_consultation_queue(100);
  perform harness.assert_true(jsonb_array_length(q -> 'items') = 2, 'unassigned lawyer did not receive both open consultations');
  r := public.nav_v2_decide_consultation(
    c_spn_a,
    'need_info',
    'уточните основание права и согласованный порядок расчётов до задатка',
    null
  );
  perform harness.assert_true(r ->> 'status' = 'need_info', 'need_info did not change status');

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000020', false);
  r := public.nav_v2_add_consultation_clarification(
    c_spn_a,
    'основание права наследство, порядок расчётов стороны пока согласовывают'
  );
  perform harness.assert_true(r ->> 'status' = 'new', 'clarification did not return consultation to new');

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000030', false);
  r := public.nav_v2_decide_consultation(
    c_spn_a,
    'answer',
    'до задатка необходимо проверить наследственные документы и письменно согласовать расчёты',
    null
  );
  perform harness.assert_true(r ->> 'status' = 'answered', 'answer did not change status');

  -- Another unassigned lawyer cannot open the historical answered card by UUID.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000031', false);
  failed := false;
  begin
    perform public.nav_v2_get_consultation(c_spn_a);
  exception when insufficient_privilege then failed := true;
  end;
  perform harness.assert_true(failed, 'unassigned lawyer opened an answered historical consultation');

  -- A separate consultation tests explicit conversion mode.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000020', false);
  r := public.nav_v2_create_consultation(jsonb_build_object(
    'client_request_id', '10000000-0000-4000-8000-000000000005',
    'question', 'нужно определить, требуется ли полная подготовка задатка по сложной схеме расчётов',
    'safe_reference', 'вторичный рынок, район автовокзала',
    'request_type', 'deposit_precheck',
    'representation_model', 'seller',
    'object_type', 'flat',
    'stage', 'deposit_soon',
    'funding_sources', jsonb_build_array('cash'),
    'circumstances', jsonb_build_array('after_registration')
  ));
  c_convert := (r ->> 'consultation_id')::uuid;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000030', false);
  failed := false;
  begin
    perform public.nav_v2_decide_consultation(
      c_convert,
      'convert_to_preparation',
      'нужна полная подготовка с проверкой расчётов и условий задатка',
      null
    );
  exception when others then
    if sqlstate = 'P0001' then failed := true; else raise; end if;
  end;
  perform harness.assert_true(failed, 'conversion without deposit/deal mode was accepted');

  failed := false;
  begin
    perform public.nav_v2_decide_consultation(
      c_convert,
      'answer',
      'можно использовать обычный ответ без полного процесса подготовки',
      'deal'
    );
  exception when others then
    if sqlstate = 'P0001' then failed := true; else raise; end if;
  end;
  perform harness.assert_true(failed, 'conversion_mode was accepted for ordinary answer');

  r := public.nav_v2_decide_consultation(
    c_convert,
    'convert_to_preparation',
    'нужна полная подготовка задатка с отдельной проверкой расчётов',
    'deposit'
  );
  conversion := r -> 'conversion_draft';
  perform harness.assert_true(r ->> 'status' = 'convert_to_preparation', 'conversion decision status mismatch');
  perform harness.assert_true(r ->> 'conversion_mode' = 'deposit', 'conversion response lost explicit mode');
  perform harness.assert_true(conversion ->> 'preparation_mode' = 'deposit', 'conversion draft did not preserve deposit mode');
  perform harness.assert_true((conversion ->> 'creates_deal')::boolean is false, 'conversion draft claims a deal was created');
  perform harness.assert_true((conversion ->> 'creates_backlog')::boolean is false, 'conversion draft claims backlog was created');

  -- Assigned lawyer retains detail access; other lawyer does not.
  detail := public.nav_v2_get_consultation(c_convert);
  perform harness.assert_true(detail #>> '{consultation,status}' = 'convert_to_preparation', 'assigned lawyer lost consultation detail');

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000031', false);
  failed := false;
  begin
    perform public.nav_v2_get_consultation(c_convert);
  exception when insufficient_privilege then failed := true;
  end;
  perform harness.assert_true(failed, 'other lawyer opened assigned conversion consultation');

  -- Owner can inspect all active consultations.
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
  q := public.nav_v2_get_consultation_queue(100);
  perform harness.assert_true(jsonb_array_length(q -> 'items') = 3, 'owner did not receive all active consultations');

  -- No deal/backlog side effects.
  perform harness.assert_true((select count(*) from public.nav_deals_v2) = 0, 'consultation lifecycle created a deal');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2) = 0, 'consultation lifecycle created a task');
  perform harness.assert_true((select count(*) from public.nav_deal_documents_v2) = 0, 'consultation lifecycle created a document');
  perform harness.assert_true((select count(*) from public.nav_deal_risks_v2) = 0, 'consultation lifecycle created a risk');
end;
$lifecycle$;

select 'Navigator v2 PostgreSQL consultation harness assertions passed' as result;
