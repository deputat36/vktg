\set ON_ERROR_STOP on

do $contract$
begin
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_build_governed_intake_write_plan_v1(jsonb,uuid,jsonb)') is not null,
    'governed write-plan function is missing'
  );
  perform harness.assert_true(
    to_regclass('nav_v2_private.nav_v2_intake_save_requests_v1') is not null,
    'governed request ledger is missing'
  );
  perform harness.assert_true(
    (select relrowsecurity from pg_class where oid = 'nav_v2_private.nav_v2_intake_save_requests_v1'::regclass),
    'governed request ledger does not have RLS enabled'
  );
  perform harness.assert_true(
    not has_table_privilege('authenticated', 'nav_v2_private.nav_v2_intake_save_requests_v1', 'SELECT'),
    'authenticated unexpectedly has ledger SELECT'
  );
  perform harness.assert_true(
    not has_function_privilege('authenticated', 'nav_v2_private.nav_v2_begin_intake_save_request_v1(jsonb)', 'EXECUTE'),
    'authenticated unexpectedly has direct ledger mutation execute'
  );
  perform harness.assert_true(
    has_function_privilege('service_role', 'nav_v2_private.nav_v2_begin_intake_save_request_v1(jsonb)', 'EXECUTE'),
    'service role lacks governed ledger execute'
  );
end;
$contract$;

do $scenarios$
declare
  p jsonb;
  plan jsonb;
  first_result jsonb;
  replay_result jsonb;
  failed boolean;
  manager_context jsonb;
begin
  -- A seller-only legal case replaces the generic legacy document scope.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"lawyer"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,lawyerRequestConfirmed}', 'true'::jsonb, true);
  p := harness.with_fact(p, 'minor_seller', 'yes', 'client');
  p := harness.with_document(p, 'guardianship_permission', 'requested');
  p := harness.with_document(p, 'child_ownership_status', 'available');
  plan := nav_v2_private.nav_v2_build_governed_intake_write_plan_v1(
    p,
    '64000000-0000-4000-8000-000000000001',
    harness.governed_intake_server_context()
  );
  perform harness.assert_true((plan->>'allowed')::boolean, 'seller-only governed plan retained the legacy document-scope STOP');
  perform harness.assert_true((plan->>'replaces_legacy_document_scope')::boolean, 'document-scope replacement marker is missing');
  perform harness.assert_true(
    not exists (select 1 from jsonb_array_elements(plan->'documents') doc where doc->>'side' = 'buyer'),
    'seller-only governed plan created a buyer-side document'
  );
  perform harness.assert_true(
    exists (
      select 1 from jsonb_array_elements(plan->'documents') doc
      where doc->>'type' = 'child_ownership_status'
        and doc->>'side' = 'seller'
        and doc->>'owner_id' = '63000000-0000-4000-8000-000000000001'
        and doc->>'assignment_state' = 'resolved_server'
    ),
    'seller-side document was not assigned from trusted context'
  );
  perform harness.mock_governed_intake_save_v1(
    p,
    '64000000-0000-4000-8000-000000000001',
    harness.governed_intake_server_context()
  );
  perform harness.assert_true(
    not exists (
      select 1 from harness.nav_v2_governed_documents
      where client_request_id = '64000000-0000-4000-8000-000000000001'
        and side = 'buyer'
    ),
    'seller-only mock write crossed the side boundary'
  );

  -- A verified manager may create while another SPN owns the deal and seller side.
  manager_context := harness.governed_intake_server_context(
    p_actor_id => '63000000-0000-4000-8000-000000000010',
    p_actor_role => 'manager',
    p_lead_spn_id => '63000000-0000-4000-8000-000000000011',
    p_seller_spn_id => '63000000-0000-4000-8000-000000000011',
    p_buyer_spn_id => null
  );
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"self"'::jsonb, true);
  plan := nav_v2_private.nav_v2_build_governed_intake_write_plan_v1(
    p,
    '64000000-0000-4000-8000-000000000002',
    manager_context
  );
  perform harness.assert_true((plan->>'allowed')::boolean, 'owner-aware plan retained the legacy current-actor STOP');
  perform harness.assert_true((plan->>'replaces_legacy_actor_assignment')::boolean, 'actor-assignment replacement marker is missing');
  perform harness.assert_true(plan #>> '{deal,created_by}' = '63000000-0000-4000-8000-000000000010', 'verified manager was not preserved as creator');
  perform harness.assert_true(plan #>> '{deal,lead_spn_id}' = '63000000-0000-4000-8000-000000000011', 'trusted lead SPN was not preserved');
  perform harness.mock_governed_intake_save_v1(
    p,
    '64000000-0000-4000-8000-000000000002',
    manager_context
  );
  perform harness.assert_true(
    exists (
      select 1 from harness.nav_v2_governed_participants
      where client_request_id = '64000000-0000-4000-8000-000000000002'
        and user_id = '63000000-0000-4000-8000-000000000010'
        and role_in_deal = 'verified_creator'
    ),
    'verified creator participant is missing'
  );
  perform harness.assert_true(
    exists (
      select 1 from harness.nav_v2_governed_participants
      where client_request_id = '64000000-0000-4000-8000-000000000002'
        and user_id = '63000000-0000-4000-8000-000000000011'
        and role_in_deal = 'lead_spn'
    ),
    'explicit lead SPN participant is missing'
  );

  -- Unsupported legacy semantics remain a hard fail-closed gate.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"lawyer"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,lawyerRequestConfirmed}', 'true'::jsonb, true);
  p := harness.with_fact(p, 'encumbrance', 'yes', 'document');
  p := harness.with_document(p, 'encumbrance_extract', 'available');
  p := harness.with_document(p, 'release_terms', 'requested');
  plan := nav_v2_private.nav_v2_build_governed_intake_write_plan_v1(
    p,
    '64000000-0000-4000-8000-000000000003',
    harness.governed_intake_server_context()
  );
  perform harness.assert_true(not (plan->>'allowed')::boolean, 'unsupported encumbrance semantics reached governed write');
  perform harness.assert_true(plan->'unsupported_rule_ids' @> '["encumbrance"]'::jsonb, 'unsupported encumbrance gap is missing');
  perform harness.assert_true(plan->'blockers' @> '["unsupported_rule_semantics"]'::jsonb, 'unsupported-rule blocker is missing');
  perform harness.assert_true(
    not exists (select 1 from nav_v2_private.nav_v2_intake_save_requests_v1 where client_request_id = '64000000-0000-4000-8000-000000000003'),
    'blocked unsupported rule created a request-ledger row'
  );

  -- Missing broker owner blocks a mortgage write plan.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"broker"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,representation}', '"buyer"'::jsonb, true);
  p := harness.with_fact(p, 'mortgage', 'yes', 'client');
  p := harness.with_document(p, 'mortgage_approval_status', 'requested');
  plan := nav_v2_private.nav_v2_build_governed_intake_write_plan_v1(
    p,
    '64000000-0000-4000-8000-000000000004',
    harness.governed_intake_server_context(p_broker_id => null)
  );
  perform harness.assert_true(not (plan->>'allowed')::boolean, 'mortgage plan accepted an unresolved broker');
  perform harness.assert_true(plan->'blockers' @> '["owner_resolution_incomplete"]'::jsonb, 'missing broker owner blocker is absent');

  -- Exact replay returns the committed result and crosses business rows once.
  p := harness.concurrent_intake();
  first_result := harness.mock_governed_intake_save_v1(
    p,
    '64000000-0000-4000-8000-000000000010',
    harness.governed_intake_server_context()
  );
  replay_result := harness.mock_governed_intake_save_v1(
    p,
    '64000000-0000-4000-8000-000000000010',
    harness.governed_intake_server_context()
  );
  perform harness.assert_true(not (first_result->>'idempotent')::boolean, 'first governed save was marked as replay');
  perform harness.assert_true((replay_result->>'idempotent')::boolean, 'exact governed replay was not idempotent');
  perform harness.assert_true(first_result->>'deal_id' = replay_result->>'deal_id', 'exact governed replay returned another deal');
  perform harness.assert_true(
    (select count(*) from harness.nav_v2_governed_deals where client_request_id = '64000000-0000-4000-8000-000000000010') = 1,
    'exact replay crossed the business-write boundary twice'
  );

  -- The request UUID is bound to both verified actor and recomputed payload.
  failed := false;
  begin
    perform harness.mock_governed_intake_save_v1(
      p,
      '64000000-0000-4000-8000-000000000010',
      harness.governed_intake_server_context(
        p_actor_id => '63000000-0000-4000-8000-000000000020',
        p_lead_spn_id => '63000000-0000-4000-8000-000000000020',
        p_seller_spn_id => '63000000-0000-4000-8000-000000000020',
        p_buyer_spn_id => '63000000-0000-4000-8000-000000000020'
      )
    );
  exception when sqlstate '22023' then failed := true;
  end;
  perform harness.assert_true(failed, 'same request UUID accepted another verified actor');

  failed := false;
  begin
    p := jsonb_set(p, '{deal,intake_draft,nextAction}', '"Изменённый безопасный шаг."'::jsonb, true);
    perform harness.mock_governed_intake_save_v1(
      p,
      '64000000-0000-4000-8000-000000000010',
      harness.governed_intake_server_context()
    );
  exception when sqlstate '22023' then failed := true;
  end;
  perform harness.assert_true(failed, 'same request UUID accepted another payload');

  -- A statement failure after business inserts rolls ledger and rows back together; retry then succeeds.
  p := harness.concurrent_intake();
  failed := false;
  begin
    perform harness.mock_governed_intake_save_v1(
      p,
      '64000000-0000-4000-8000-000000000020',
      harness.governed_intake_server_context(),
      p_fail_after_rows => true
    );
  exception when sqlstate '40001' then failed := true;
  end;
  perform harness.assert_true(failed, 'fault injection after shadow rows did not fail');
  perform harness.assert_true(
    not exists (select 1 from nav_v2_private.nav_v2_intake_save_requests_v1 where client_request_id = '64000000-0000-4000-8000-000000000020'),
    'failed save left a request-ledger row'
  );
  perform harness.assert_true(
    not exists (select 1 from harness.nav_v2_governed_deals where client_request_id = '64000000-0000-4000-8000-000000000020'),
    'failed save left a shadow business row'
  );
  first_result := harness.mock_governed_intake_save_v1(
    p,
    '64000000-0000-4000-8000-000000000020',
    harness.governed_intake_server_context()
  );
  perform harness.assert_true(not (first_result->>'idempotent')::boolean, 'retry after full rollback was not a first execution');

  -- The deferred constraint prevents committing a reusable stranded started state.
  plan := nav_v2_private.nav_v2_build_governed_intake_write_plan_v1(
    p,
    '64000000-0000-4000-8000-000000000021',
    harness.governed_intake_server_context()
  );
  failed := false;
  begin
    perform nav_v2_private.nav_v2_begin_intake_save_request_v1(plan);
    set constraints nav_v2_private.nav_v2_intake_save_request_must_complete_v1 immediate;
  exception when sqlstate '23514' then failed := true;
  end;
  perform harness.assert_true(failed, 'stranded started ledger state passed the deferred constraint');
  perform harness.assert_true(
    not exists (select 1 from nav_v2_private.nav_v2_intake_save_requests_v1 where client_request_id = '64000000-0000-4000-8000-000000000021'),
    'stranded started ledger state survived rollback'
  );
end;
$scenarios$;

do $no_production_writes$
begin
  perform harness.assert_true((select count(*) from public.nav_deals_v2) = 1, 'governed harness changed production-marker deal rows');
  perform harness.assert_true((select marker from public.nav_deals_v2 where id = 1) = 'before', 'governed harness changed production-marker deal');
  perform harness.assert_true((select count(*) from public.nav_deal_documents_v2) = 1, 'governed harness changed production-marker documents');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2) = 1, 'governed harness changed production-marker tasks');
  perform harness.assert_true((select count(*) from public.nav_deal_risks_v2) = 1, 'governed harness changed production-marker risks');
  perform harness.assert_true((select count(*) from harness.nav_v2_governed_deals) = 4, 'unexpected sequential governed deal count');
  perform harness.assert_true((select count(*) from nav_v2_private.nav_v2_intake_save_requests_v1) = 4, 'unexpected sequential governed ledger count');
end;
$no_production_writes$;

select 'Navigator v2 governed intake save PostgreSQL 17 sequential assertions passed' as result;
