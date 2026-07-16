\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if coalesce(p_condition, false) is not true then
    raise exception '%', p_message;
  end if;
end;
$$;

create or replace function pg_temp.expect_error(p_sql text, p_message text)
returns void
language plpgsql
as $$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception '%', p_message;
end;
$$;

select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.nav_v2_initialize_corporate_documents(uuid,jsonb,uuid)', 'EXECUTE'),
  'authenticated unexpectedly has initialize RPC EXECUTE'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.nav_v2_update_corporate_document(uuid,jsonb,uuid)', 'EXECUTE'),
  'authenticated unexpectedly has update RPC EXECUTE'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.nav_v2_propose_corporate_document_outcome(uuid,text,text,uuid,uuid)', 'EXECUTE'),
  'authenticated unexpectedly has propose RPC EXECUTE'
);
select pg_temp.assert_true(
  not has_function_privilege('authenticated', 'public.nav_v2_decide_corporate_document_outcome(uuid,text,text,uuid)', 'EXECUTE'),
  'authenticated unexpectedly has decide RPC EXECUTE'
);
select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.nav_v2_initialize_corporate_documents(uuid,jsonb,uuid)', 'EXECUTE'),
  'service_role lacks initialize RPC EXECUTE'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.nav_deal_corporate_documents_v2', 'SELECT'),
  'authenticated unexpectedly has direct corporate document SELECT'
);
select pg_temp.assert_true(
  not has_table_privilege('authenticated', 'public.nav_deal_corporate_document_events_v2', 'SELECT'),
  'authenticated unexpectedly has direct corporate audit SELECT'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
create temporary table harness_values(key text primary key, value uuid);

with result as (
  select public.nav_v2_initialize_corporate_documents(
    '10000000-0000-4000-8000-000000000001',
    '[
      {"party_side":"seller","document_type":"service_agreement","is_required":true,"required_stage":"before_work","responsible_role":"spn","assigned_to":"00000000-0000-4000-8000-000000000004"},
      {"party_side":"seller","document_type":"completion_act","is_required":true,"required_stage":"after_deal","responsible_role":"spn","assigned_to":"00000000-0000-4000-8000-000000000004"}
    ]'::jsonb,
    '30000000-0000-4000-8000-000000000001'
  ) payload
)
select pg_temp.assert_true(
  (payload ->> 'created_count')::int = 2
  and payload ->> 'idempotent_replay' = 'false'
  and payload ->> 'legal_readiness_changed' = 'false'
  and payload ->> 'deal_status_changed' = 'false'
  and payload ->> 'automatic_task_created' = 'false',
  'seller SPN explicit initialization contract drifted'
) from result;

insert into harness_values(key, value)
select document_type, id
from public.nav_deal_corporate_documents_v2
where deal_id = '10000000-0000-4000-8000-000000000001'
  and party_side = 'seller';

with replay as (
  select public.nav_v2_initialize_corporate_documents(
    '10000000-0000-4000-8000-000000000001',
    '[{"party_side":"seller","document_type":"service_agreement"}]'::jsonb,
    '30000000-0000-4000-8000-000000000001'
  ) payload
)
select pg_temp.assert_true(
  payload ->> 'idempotent_replay' = 'true'
  and (select count(*) from public.nav_deal_corporate_documents_v2 where deal_id='10000000-0000-4000-8000-000000000001') = 2,
  'repeat initialize must replay without duplicate rows'
) from replay;

select pg_temp.expect_error(
  $$select public.nav_v2_initialize_corporate_documents(
    '10000000-0000-4000-8000-000000000001',
    '[{"party_side":"seller","document_type":"inspection_act","client_name":"DROP"}]'::jsonb,
    '30000000-0000-4000-8000-000000000002')$$,
  'unknown initialize field was not rejected'
);
select pg_temp.expect_error(
  $$select public.nav_v2_initialize_corporate_documents(
    '10000000-0000-4000-8000-000000000001',
    '[{"party_side":"buyer","document_type":"completion_act"}]'::jsonb,
    '30000000-0000-4000-8000-000000000003')$$,
  'seller SPN initialized buyer-side corporate document'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
with result as (
  select public.nav_v2_initialize_corporate_documents(
    '10000000-0000-4000-8000-000000000001',
    '[{"party_side":"buyer","document_type":"service_agreement","responsible_role":"spn","assigned_to":"00000000-0000-4000-8000-000000000005"}]'::jsonb,
    '30000000-0000-4000-8000-000000000004'
  ) payload
)
select pg_temp.assert_true((payload ->> 'created_count')::int = 1, 'manager failed to initialize buyer corporate document') from result;

select pg_temp.expect_error(
  $$select public.nav_v2_initialize_corporate_documents(
    '10000000-0000-4000-8000-000000000001',
    '[{"party_side":"seller","document_type":"inspection_act","responsible_role":"spn","assigned_to":"00000000-0000-4000-8000-000000000010"}]'::jsonb,
    '30000000-0000-4000-8000-000000000008')$$,
  'manager assigned seller corporate document to unrelated SPN'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', false);
select pg_temp.expect_error(
  $$select public.nav_v2_initialize_corporate_documents(
    '10000000-0000-4000-8000-000000000001',
    '[{"party_side":"seller","document_type":"inspection_act"}]'::jsonb,
    '30000000-0000-4000-8000-000000000005')$$,
  'lawyer initialized corporate documents'
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000007', false);
select pg_temp.expect_error(
  $$select public.nav_v2_initialize_corporate_documents(
    '10000000-0000-4000-8000-000000000001',
    '[{"party_side":"seller","document_type":"inspection_act"}]'::jsonb,
    '30000000-0000-4000-8000-000000000006')$$,
  'broker initialized corporate documents'
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000008', false);
select pg_temp.expect_error(
  $$select public.nav_v2_initialize_corporate_documents(
    '10000000-0000-4000-8000-000000000001',
    '[{"party_side":"seller","document_type":"inspection_act"}]'::jsonb,
    '30000000-0000-4000-8000-000000000007')$$,
  'viewer initialized corporate documents'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
select pg_temp.expect_error(
  format('select public.nav_v2_update_corporate_document(%L, %L::jsonb, %L)',
    (select value from harness_values where key='service_agreement'),
    '{"status":"prepared"}',
    '31000000-0000-4000-8000-000000000001'),
  'prepared without template evidence was accepted'
);

with result as (
  select public.nav_v2_update_corporate_document(
    (select value from harness_values where key='service_agreement'),
    '{"status":"prepared","template_code":"SERVICE_AGREEMENT","template_version":"2026-01"}'::jsonb,
    '31000000-0000-4000-8000-000000000002'
  ) payload
)
select pg_temp.assert_true(payload #>> '{document,status}' = 'prepared', 'prepared transition failed') from result;

select pg_temp.expect_error(
  format('select public.nav_v2_update_corporate_document(%L, %L::jsonb, %L)',
    (select value from harness_values where key='service_agreement'),
    '{"status":"sent_for_signature"}',
    '31000000-0000-4000-8000-000000000003'),
  'sent_for_signature without signing method was accepted'
);
with result as (
  select public.nav_v2_update_corporate_document(
    (select value from harness_values where key='service_agreement'),
    '{"status":"sent_for_signature","signing_method":"paper"}'::jsonb,
    '31000000-0000-4000-8000-000000000004'
  ) payload
)
select pg_temp.assert_true(payload #>> '{document,status}' = 'sent_for_signature', 'sent transition failed') from result;

select pg_temp.expect_error(
  format('select public.nav_v2_update_corporate_document(%L, %L::jsonb, %L)',
    (select value from harness_values where key='service_agreement'),
    '{"status":"signed"}',
    '31000000-0000-4000-8000-000000000005'),
  'signed without external evidence was accepted'
);
with result as (
  select public.nav_v2_update_corporate_document(
    (select value from harness_values where key='service_agreement'),
    '{"status":"signed","has_external_signature_reference":true}'::jsonb,
    '31000000-0000-4000-8000-000000000006'
  ) payload
)
select pg_temp.assert_true(
  payload #>> '{document,status}' = 'signed'
  and payload #>> '{document,is_complete}' = 'true',
  'signed transition or completion failed'
) from result;

select pg_temp.expect_error(
  format('select public.nav_v2_update_corporate_document(%L, %L::jsonb, %L)',
    (select value from harness_values where key='completion_act'),
    '{"status":"cancelled"}',
    '31000000-0000-4000-8000-000000000007'),
  'direct cancelled transition was accepted'
);
select pg_temp.expect_error(
  format('select public.nav_v2_update_corporate_document(%L, %L::jsonb, %L)',
    (select value from harness_values where key='completion_act'),
    '{"status":"problem","problem_note":"Позвонить +7 900 000-00-00"}',
    '31000000-0000-4000-8000-000000000008'),
  'phone in problem note was not rejected'
);

with proposed as (
  select public.nav_v2_propose_corporate_document_outcome(
    (select value from harness_values where key='completion_act'),
    'not_applicable',
    'Услуга не завершена в рамках этой карточки и акт не применяется.',
    null,
    '32000000-0000-4000-8000-000000000001'
  ) payload
)
select pg_temp.assert_true(
  payload #>> '{document,outcome_state}' = 'proposed'
  and payload ->> 'requires_confirmation' = 'true'
  and payload ->> 'is_complete' = 'false',
  'SPN exception proposal contract drifted'
) from proposed;

select pg_temp.expect_error(
  format('select public.nav_v2_decide_corporate_document_outcome(%L, %L, %L, %L)',
    (select value from harness_values where key='completion_act'),
    'confirmed', 'Подтверждаю исключение',
    '32000000-0000-4000-8000-000000000002'),
  'SPN confirmed own exception'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
with decided as (
  select public.nav_v2_decide_corporate_document_outcome(
    (select value from harness_values where key='completion_act'),
    'confirmed',
    'Подтверждено менеджером по процессной причине.',
    '32000000-0000-4000-8000-000000000003'
  ) payload
)
select pg_temp.assert_true(
  payload #>> '{document,outcome_state}' = 'confirmed'
  and payload ->> 'is_complete' = 'true'
  and payload ->> 'legal_readiness_changed' = 'false',
  'manager confirmation did not complete corporate exception'
) from decided;

with readiness as (
  select public.nav_v2_get_corporate_document_readiness('10000000-0000-4000-8000-000000000001') payload
)
select pg_temp.assert_true(
  payload ->> 'corporate_readiness_only' = 'true'
  and payload ->> 'legal_readiness_changed' = 'false'
  and payload ->> 'deal_status_changed' = 'false'
  and (payload #>> '{summary,complete}')::int = 2,
  'corporate readiness separation contract drifted'
) from readiness;

select pg_temp.assert_true(
  (select count(*) from public.nav_deal_corporate_document_events_v2) = 7,
  'unexpected corporate audit event count'
);
select pg_temp.assert_true(
  (select count(*) from public.nav_deal_documents_v2) = 0,
  'corporate mutation created legal/object document'
);
select pg_temp.assert_true(
  (select count(*) from public.nav_deal_tasks_v2) = 0,
  'corporate mutation created task'
);
select pg_temp.assert_true(
  (select count(*) from public.nav_deal_risks_v2) = 0,
  'corporate mutation created risk'
);
select pg_temp.assert_true(
  (select status from public.nav_deals_v2 where id='10000000-0000-4000-8000-000000000001') = 'draft',
  'corporate mutation changed deal status'
);

select 'PostgreSQL corporate document mutation assertions passed' as result;
