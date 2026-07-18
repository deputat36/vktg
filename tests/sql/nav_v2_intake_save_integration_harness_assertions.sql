\set ON_ERROR_STOP on

create or replace function harness.intake_server_context(
  p_lawyer_id uuid default '62000000-0000-4000-8000-000000000003'::uuid,
  p_broker_id uuid default '62000000-0000-4000-8000-000000000004'::uuid
)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'verified_actor_id', '62000000-0000-4000-8000-000000000001',
    'verified_actor_role', 'spn',
    'lead_spn_id', '62000000-0000-4000-8000-000000000001',
    'seller_spn_id', '62000000-0000-4000-8000-000000000001',
    'buyer_spn_id', '62000000-0000-4000-8000-000000000001',
    'lawyer_id', p_lawyer_id,
    'broker_id', p_broker_id
  );
$$;

do $contract$
begin
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(jsonb,uuid,jsonb)') is not null,
    'intake save integration preview is missing'
  );
  perform harness.assert_true(
    not has_function_privilege('authenticated', 'nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(jsonb,uuid,jsonb)', 'EXECUTE'),
    'authenticated unexpectedly has direct integration execute'
  );
  perform harness.assert_true(
    has_function_privilege('service_role', 'nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(jsonb,uuid,jsonb)', 'EXECUTE'),
    'service role lacks integration execute'
  );
end;
$contract$;

do $scenarios$
declare
  p jsonb;
  preview jsonb;
  replay_preview jsonb;
  first_result jsonb;
  replay_result jsonb;
  second_result jsonb;
  failed boolean;
begin
  -- Exact request-type projection and an allowlisted payload for one-SPN-both.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"self"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,representation}', '"one_spn_both"'::jsonb, true);
  p := jsonb_set(p, '{deal,owner_id}', '"62000000-0000-4000-8000-000000000099"'::jsonb, true);
  p := jsonb_set(p, '{deal,lead_spn_id}', '"62000000-0000-4000-8000-000000000099"'::jsonb, true);
  p := jsonb_set(p, '{deal,sellerName}', '"Не должно сохраниться"'::jsonb, true);
  p := jsonb_set(p, '{deal,arbitrary_secret}', '"drop-me"'::jsonb, true);
  preview := nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(
    p,
    '61000000-0000-4000-8000-000000000001',
    harness.intake_server_context()
  );
  perform harness.assert_true(preview #>> '{legacy_payload,deal,preparationMode}' = 'consult', 'capture_situation did not project to consult');
  perform harness.assert_true(preview #>> '{legacy_payload,deal,representation}' = 'one_spn_both', 'representation was not preserved');
  perform harness.assert_true(not (preview #> '{legacy_payload,deal}' ? 'owner_id'), 'client owner_id survived allowlist');
  perform harness.assert_true(not (preview #> '{legacy_payload,deal}' ? 'lead_spn_id'), 'client lead_spn_id survived allowlist');
  perform harness.assert_true(not (preview #> '{legacy_payload,deal}' ? 'sellerName'), 'client identifier survived sanitizer');
  perform harness.assert_true(not (preview #> '{legacy_payload,deal}' ? 'arbitrary_secret'), 'unknown top-level key survived allowlist');
  perform harness.assert_true((preview #>> '{owner_resolution,legacy_actor_assignment_parity}')::boolean, 'one-SPN actor assignment should match legacy');
  perform harness.assert_true((preview #>> '{legacy_parity,document_scope_complete}')::boolean, 'both accompanied sides should match legacy baseline docs');
  perform harness.assert_true(not (preview #>> '{gates,production_call,allowed}')::boolean, 'repository preview enabled production call');
  perform harness.assert_true(preview #> '{gates,production_call,blockers}' @> '["production_request_ledger_missing"]'::jsonb, 'missing request ledger blocker disappeared');
  perform harness.assert_true(not (preview->>'writes_performed')::boolean, 'pure integration preview claims a write');

  -- Mortgage gets only a server-provided broker owner preview.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"broker"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,representation}', '"buyer"'::jsonb, true);
  p := harness.with_fact(p, 'mortgage', 'yes', 'client');
  p := harness.with_document(p, 'mortgage_approval_status', 'requested');
  preview := nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(
    p,
    '61000000-0000-4000-8000-000000000002',
    harness.intake_server_context()
  );
  perform harness.assert_true(preview #> '{legacy_payload,deal,payments}' @> '["mortgage"]'::jsonb, 'mortgage legacy marker is missing');
  perform harness.assert_true(
    exists (
      select 1 from jsonb_array_elements(preview #> '{owner_resolution,resolved_task_previews}') task
      where task->>'rule_id' = 'mortgage'
        and task->>'owner_role' = 'broker'
        and task->>'owner_id' = '62000000-0000-4000-8000-000000000004'
        and task->>'creation_state' = 'preview_only'
    ),
    'mortgage broker was not resolved from trusted context'
  );

  -- Missing broker assignment fails owner resolution but never accepts a client owner.
  preview := nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(
    p,
    '61000000-0000-4000-8000-000000000003',
    harness.intake_server_context(p_broker_id => null)
  );
  perform harness.assert_true(not (preview #>> '{owner_resolution,complete}')::boolean, 'missing broker assignment passed owner gate');
  perform harness.assert_true(preview #> '{owner_resolution,unresolved_roles}' @> '["broker"]'::jsonb, 'unresolved broker role is missing');
  perform harness.assert_true(not (preview #>> '{gates,mock_call,allowed}')::boolean, 'missing broker assignment reached mock call');

  -- Matcap remains lawyer work and never becomes a broker marker.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"lawyer"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,representation}', '"buyer"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,lawyerRequestConfirmed}', 'true'::jsonb, true);
  p := harness.with_fact(p, 'matcap', 'yes', 'document');
  p := harness.with_document(p, 'matcap_status', 'available');
  p := harness.with_document(p, 'share_allocation_plan', 'requested');
  preview := nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(
    p,
    '61000000-0000-4000-8000-000000000004',
    harness.intake_server_context()
  );
  perform harness.assert_true(preview #> '{legacy_payload,deal,payments}' @> '["matcap"]'::jsonb, 'matcap legacy marker is missing');
  perform harness.assert_true(not (preview #> '{legacy_payload,deal,payments}' @> '["mortgage"]'::jsonb), 'matcap created a mortgage marker');
  perform harness.assert_true(
    not exists (
      select 1 from jsonb_array_elements(preview #> '{owner_resolution,resolved_task_previews}') task
      where task->>'owner_role' = 'broker'
    ),
    'matcap leaked into broker owner resolution'
  );

  -- Unsupported legacy semantics and side scope are explicit STOP gates.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"lawyer"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,lawyerRequestConfirmed}', 'true'::jsonb, true);
  p := harness.with_fact(p, 'encumbrance', 'yes', 'document');
  p := harness.with_document(p, 'encumbrance_extract', 'available');
  p := harness.with_document(p, 'release_terms', 'requested');
  preview := nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(
    p,
    '61000000-0000-4000-8000-000000000005',
    harness.intake_server_context()
  );
  perform harness.assert_true(preview #> '{legacy_parity,unsupported_rule_ids}' @> '["encumbrance"]'::jsonb, 'unsupported encumbrance parity gap is missing');
  perform harness.assert_true(not (preview #>> '{legacy_parity,rule_projection_complete}')::boolean, 'unsupported legacy rule passed parity gate');
  perform harness.assert_true(not (preview #>> '{legacy_parity,document_scope_complete}')::boolean, 'seller-only legacy document scope passed');
  perform harness.assert_true(not (preview #>> '{gates,mock_call,allowed}')::boolean, 'legacy parity gap reached mock call');

  -- Legacy current-actor assignment cannot impersonate another lead SPN.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"self"'::jsonb, true);
  preview := nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(
    p,
    '61000000-0000-4000-8000-000000000006',
    jsonb_set(harness.intake_server_context(), '{lead_spn_id}', '"62000000-0000-4000-8000-000000000009"'::jsonb, true)
  );
  perform harness.assert_true(not (preview #>> '{owner_resolution,legacy_actor_assignment_parity}')::boolean, 'different lead SPN passed legacy actor parity');
  perform harness.assert_true(preview #> '{gates,production_call,blockers}' @> '["legacy_assigns_current_actor"]'::jsonb, 'legacy actor blocker is missing');
  perform harness.assert_true(not (preview #>> '{gates,mock_call,allowed}')::boolean, 'legacy actor mismatch reached mock call');

  -- The mock is the only business-write boundary and replays the exact result.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"self"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,representation}', '"one_spn_both"'::jsonb, true);
  preview := nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(
    p,
    '61000000-0000-4000-8000-000000000010',
    harness.intake_server_context()
  );
  first_result := harness.mock_legacy_save_v1(preview);
  replay_result := harness.mock_legacy_save_v1(preview);
  perform harness.assert_true(not (first_result->>'idempotent')::boolean, 'first mock save was marked as replay');
  perform harness.assert_true((replay_result->>'idempotent')::boolean, 'exact replay was not idempotent');
  perform harness.assert_true(first_result->>'id' = replay_result->>'id', 'exact replay returned another deal');
  perform harness.assert_true((select count(*) from harness.nav_v2_intake_mock_save_calls where client_request_id = '61000000-0000-4000-8000-000000000010') = 1, 'exact replay crossed business write boundary twice');

  -- The request ledger is scoped to the verified actor as well as the prepared payload.
  failed := false;
  begin
    replay_preview := nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(
      p,
      '61000000-0000-4000-8000-000000000010',
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(harness.intake_server_context(), '{verified_actor_id}', '"62000000-0000-4000-8000-000000000008"'::jsonb, true),
            '{lead_spn_id}', '"62000000-0000-4000-8000-000000000008"'::jsonb, true
          ),
          '{seller_spn_id}', '"62000000-0000-4000-8000-000000000008"'::jsonb, true
        ),
        '{buyer_spn_id}', '"62000000-0000-4000-8000-000000000008"'::jsonb, true
      )
    );
    perform harness.assert_true((replay_preview #>> '{gates,mock_call,allowed}')::boolean, 'alternate verified actor did not reach scoped replay check');
    perform harness.mock_legacy_save_v1(replay_preview);
  exception when sqlstate '22023' then failed := true;
  end;
  perform harness.assert_true(failed, 'same request ID accepted another verified actor');
  perform harness.assert_true((select count(*) from harness.nav_v2_intake_mock_save_calls where client_request_id = '61000000-0000-4000-8000-000000000010') = 1, 'actor mismatch created another business row');

  -- Same request ID with a changed payload fails closed and preserves the first result.
  failed := false;
  begin
    p := jsonb_set(p, '{deal,intake_draft,nextAction}', '"Другой безопасный шаг."'::jsonb, true);
    replay_preview := nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(
      p,
      '61000000-0000-4000-8000-000000000010',
      harness.intake_server_context()
    );
    perform harness.mock_legacy_save_v1(replay_preview);
  exception when sqlstate '22023' then failed := true;
  end;
  perform harness.assert_true(failed, 'same request ID accepted another payload');
  perform harness.assert_true((select count(*) from harness.nav_v2_intake_mock_save_calls where client_request_id = '61000000-0000-4000-8000-000000000010') = 1, 'changed replay created another business row');

  -- A new request ID creates one new mock business result.
  replay_preview := nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(
    p,
    '61000000-0000-4000-8000-000000000011',
    harness.intake_server_context()
  );
  second_result := harness.mock_legacy_save_v1(replay_preview);
  perform harness.assert_true(second_result->>'id' <> first_result->>'id', 'new request ID reused another result');

  -- Version mismatch and untrusted server context fail before the mock boundary.
  failed := false;
  begin
    p := jsonb_set(harness.base_intake(), '{deal,intake_catalog_version}', '"2099-01-01.1"'::jsonb, true);
    perform nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(
      p,
      '61000000-0000-4000-8000-000000000012',
      harness.intake_server_context()
    );
  exception when sqlstate '22023' then failed := true;
  end;
  perform harness.assert_true(failed, 'catalog mismatch reached integration preview');

  failed := false;
  begin
    perform nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(
      harness.base_intake(),
      '61000000-0000-4000-8000-000000000013',
      harness.intake_server_context() || '{"owner_id":"62000000-0000-4000-8000-000000000099"}'::jsonb
    );
  exception when sqlstate '22023' then failed := true;
  end;
  perform harness.assert_true(failed, 'unknown trusted-context key was accepted');

  failed := false;
  begin
    perform nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(
      harness.base_intake(), null, harness.intake_server_context()
    );
  exception when sqlstate '22023' then failed := true;
  end;
  perform harness.assert_true(failed, 'null request ID was accepted');
end;
$scenarios$;

do $no_production_writes$
begin
  perform harness.assert_true((select count(*) from public.nav_deals_v2) = 1, 'integration preview changed deal rows');
  perform harness.assert_true((select marker from public.nav_deals_v2 where id = 1) = 'before', 'integration preview changed deal marker');
  perform harness.assert_true((select count(*) from public.nav_deal_documents_v2) = 1, 'integration preview changed document rows');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2) = 1, 'integration preview changed task rows');
  perform harness.assert_true((select count(*) from public.nav_deal_risks_v2) = 1, 'integration preview changed risk rows');
  perform harness.assert_true((select count(*) from harness.nav_v2_intake_mock_save_calls) = 2, 'unexpected mock business-write count');
  perform harness.assert_true((select count(*) from harness.nav_v2_intake_mock_request_ledger) = 2, 'unexpected request-ledger count');
end;
$no_production_writes$;

select 'Navigator v2 intake save integration PostgreSQL 17 assertions passed' as result;
