\set ON_ERROR_STOP on

create or replace function harness.base_intake()
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'deal', jsonb_build_object(
      'intake_contract_version', 1,
      'intake_catalog_version', '2026-07-17.1',
      'intake_action', 'draft',
      'intake_draft', jsonb_build_object(
        'requestType', 'capture_situation',
        'representation', 'seller',
        'stage', 'object_chosen',
        'objectType', 'flat_mkd',
        'objectAddress', 'нейтральный ориентир',
        'cadastralNumberKnown', 'unknown',
        'urgency', 'normal',
        'targetDate', '2026-07-25',
        'dateUnknown', false,
        'leadSpnConfirmed', true,
        'nextAction', 'Уточнить безопасные статусы.',
        'lawyerRequestType', '',
        'requestedDecision', '',
        'lawyerRequestConfirmed', false,
        'lawyerQuestion', '',
        'documentsReviewed', true,
        'facts', '{}'::jsonb,
        'documents', '[]'::jsonb
      )
    )
  );
$$;

create or replace function harness.with_fact(p_payload jsonb, p_key text, p_value text, p_source text)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_set(
    p_payload,
    array['deal', 'intake_draft', 'facts', p_key],
    jsonb_build_object('value', p_value, 'source', p_source),
    true
  );
$$;

create or replace function harness.with_document(p_payload jsonb, p_type text, p_status text)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_set(
    p_payload,
    '{deal,intake_draft,documents}',
    coalesce(p_payload #> '{deal,intake_draft,documents}', '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('type', p_type, 'status', p_status)),
    true
  );
$$;

do $contract$
begin
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb)') is not null,
    'server adapter function is missing'
  );
  perform harness.assert_true(
    nav_v2_private.nav_v2_intake_catalog_v1()->>'catalog_version' = '2026-07-17.1',
    'rendered server catalog version differs'
  );
  perform harness.assert_true(
    jsonb_array_length(nav_v2_private.nav_v2_intake_catalog_v1()->'rules') = 25,
    'rendered server rule catalog is incomplete'
  );
  perform harness.assert_true(
    length(nav_v2_private.nav_v2_intake_catalog_sha256_v1()) = 64,
    'rendered catalog SHA-256 is invalid'
  );
  perform harness.assert_true(
    not has_schema_privilege('authenticated', 'nav_v2_private', 'USAGE'),
    'authenticated unexpectedly has private schema usage'
  );
  perform harness.assert_true(
    not has_function_privilege('authenticated', 'nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb)', 'EXECUTE'),
    'authenticated unexpectedly has direct adapter execute'
  );
  perform harness.assert_true(
    has_function_privilege('service_role', 'nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb)', 'EXECUTE'),
    'service role lacks adapter execute'
  );
end;
$contract$;

do $scenarios$
declare
  p jsonb;
  r jsonb;
  failed boolean;
begin
  -- Simple self-service draft/card: no automatic specialist and no generated backlog.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"self"'::jsonb, true);
  r := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  perform harness.assert_true((r->>'allowed')::boolean, 'simple self-service card was blocked');
  perform harness.assert_true(jsonb_array_length(r->'matched_rule_ids') = 0, 'simple card received unrelated rules');
  perform harness.assert_true(not (r #>> '{routing,lawyer_needed}')::boolean, 'simple card routed to lawyer');
  perform harness.assert_true(not (r #>> '{routing,broker_needed}')::boolean, 'simple card routed to broker');
  perform harness.assert_true(jsonb_array_length(r #> '{work_plan,task_candidates}') = 0, 'simple card received generic tasks');
  perform harness.assert_true((r->>'writes_performed')::boolean is false, 'adapter claims a write');

  -- Mortgage routes only the mortgage part to broker.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"broker"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,representation}', '"buyer"'::jsonb, true);
  p := harness.with_fact(p, 'mortgage', 'yes', 'client');
  p := harness.with_document(p, 'mortgage_approval_status', 'requested');
  r := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  perform harness.assert_true((r->>'allowed')::boolean, 'mortgage broker action was blocked');
  perform harness.assert_true((r #>> '{routing,broker_needed}')::boolean, 'mortgage did not route to broker');
  perform harness.assert_true(not (r #>> '{routing,lawyer_needed}')::boolean, 'mortgage-only draft routed to lawyer');
  perform harness.assert_true(r #>> '{routing,broker_scope}' = 'mortgage_only', 'broker scope expanded beyond mortgage');
  perform harness.assert_true(r->'matched_rule_ids' @> '["mortgage"]'::jsonb, 'mortgage rule is missing');
  perform harness.assert_true(jsonb_array_length(r #> '{work_plan,ready_tasks}') = 0, 'client draft created an assigned task');

  -- Mortgage + matcap remains split: broker receives mortgage, lawyer receives child-money rule.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"lawyer"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,representation}', '"buyer"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,lawyerRequestConfirmed}', 'true'::jsonb, true);
  p := harness.with_fact(p, 'mortgage', 'yes', 'client');
  p := harness.with_fact(p, 'matcap', 'yes', 'document');
  p := harness.with_document(p, 'mortgage_approval_status', 'requested');
  p := harness.with_document(p, 'matcap_status', 'available');
  p := harness.with_document(p, 'share_allocation_plan', 'requested');
  r := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  perform harness.assert_true((r->>'allowed')::boolean, 'mortgage + matcap lawyer handoff was blocked');
  perform harness.assert_true((r #>> '{routing,broker_needed}')::boolean, 'mortgage part lost broker route');
  perform harness.assert_true((r #>> '{routing,lawyer_needed}')::boolean, 'matcap part lost lawyer route');
  perform harness.assert_true(r->'matched_rule_ids' @> '["mortgage","matcap"]'::jsonb, 'split rules are incomplete');
  perform harness.assert_true(
    (select count(*) from jsonb_array_elements(r #> '{work_plan,task_candidates}') task where task->>'owner_role' = 'broker' and task->>'rule_id' = 'mortgage') = 1,
    'broker did not receive exactly the mortgage task candidate'
  );
  perform harness.assert_true(
    not exists (select 1 from jsonb_array_elements(r #> '{work_plan,task_candidates}') task where task->>'owner_role' = 'broker' and task->>'rule_id' = 'matcap'),
    'matcap leaked into broker task scope'
  );

  -- Matcap without mortgage never creates broker route.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"lawyer"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,representation}', '"buyer"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,lawyerRequestConfirmed}', 'true'::jsonb, true);
  p := harness.with_fact(p, 'mortgage', 'no', 'client');
  p := harness.with_fact(p, 'matcap', 'yes', 'document');
  p := harness.with_document(p, 'matcap_status', 'available');
  p := harness.with_document(p, 'share_allocation_plan', 'requested');
  r := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  perform harness.assert_true(not (r #>> '{routing,broker_needed}')::boolean, 'matcap without mortgage routed to broker');
  perform harness.assert_true((r #>> '{routing,lawyer_needed}')::boolean, 'matcap without mortgage lost lawyer route');

  -- Seller-side documents stay seller/deal scoped; buyer child document is absent.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"lawyer"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,lawyerRequestConfirmed}', 'true'::jsonb, true);
  p := harness.with_fact(p, 'minor_seller', 'yes', 'client');
  p := harness.with_document(p, 'guardianship_permission', 'requested');
  p := harness.with_document(p, 'child_ownership_status', 'available');
  r := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  perform harness.assert_true(
    exists (select 1 from jsonb_array_elements(r #> '{work_plan,document_candidates}') doc where doc->>'type' = 'child_ownership_status' and doc->>'side' = 'seller'),
    'seller child ownership document is missing'
  );
  perform harness.assert_true(
    not exists (select 1 from jsonb_array_elements(r #> '{work_plan,document_candidates}') doc where doc->>'type' = 'child_purchase_basis'),
    'buyer child document appeared in seller-only case'
  );

  -- Partner side is never guessed; seller POA document is skipped until the accompanied side is explicit.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"lawyer"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,representation}', '"partner_agency"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,lawyerRequestConfirmed}', 'true'::jsonb, true);
  p := harness.with_fact(p, 'power_of_attorney', 'yes', 'client');
  p := harness.with_document(p, 'partner_responsibility_note', 'requested');
  r := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  perform harness.assert_true(
    exists (select 1 from jsonb_array_elements(r #> '{work_plan,skipped_documents}') doc where doc->>'type' = 'power_of_attorney' and doc->>'reason' = 'side_not_accompanied'),
    'partner deal silently assumed a seller side'
  );
  perform harness.assert_true(
    exists (select 1 from jsonb_array_elements(r #> '{work_plan,document_candidates}') doc where doc->>'type' = 'partner_responsibility_note' and doc->>'side' = 'deal'),
    'partner deal-level document is missing'
  );

  -- Client passport/work-plan previews are ignored and replaced by server recomputation.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"lawyer"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,representation}', '"buyer"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,lawyerRequestConfirmed}', 'true'::jsonb, true);
  p := harness.with_fact(p, 'matcap', 'yes', 'document');
  p := harness.with_document(p, 'matcap_status', 'available');
  p := harness.with_document(p, 'share_allocation_plan', 'requested');
  p := jsonb_set(p, '{deal,legal_passport}', '{"version":1,"specialists":{"broker":true,"broker_scope":"all_funding"}}'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_work_plan}', '{"ready_tasks":[{"owner_role":"broker","rule_id":"matcap"}]}'::jsonb, true);
  r := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  perform harness.assert_true(not (r #>> '{routing,broker_needed}')::boolean, 'spoofed client passport enabled broker');
  perform harness.assert_true(jsonb_array_length(r #> '{work_plan,ready_tasks}') = 0, 'spoofed client work plan created ready task');
  perform harness.assert_true(not (r #>> '{prepared_payload,deal,legal_passport,specialists,broker}')::boolean, 'prepared payload retained spoofed broker route');

  -- Manual confirmed legal request is allowed even when no automatic rule matched.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"lawyer"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,lawyerRequestType}', '"check_document_package"'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,requestedDecision}', '"Перечислить недостающие безопасные статусы."'::jsonb, true);
  p := jsonb_set(p, '{deal,intake_draft,lawyerRequestConfirmed}', 'true'::jsonb, true);
  p := harness.with_fact(p, 'encumbrance', 'no', 'document');
  r := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  perform harness.assert_true((r #>> '{routing,lawyer_needed}')::boolean, 'confirmed manual lawyer request was ignored');
  perform harness.assert_true((r->>'allowed')::boolean, 'complete manual lawyer request was blocked');

  -- Broker action without mortgage is rejected by gate rather than trusted.
  p := jsonb_set(harness.base_intake(), '{deal,intake_action}', '"broker"'::jsonb, true);
  r := nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  perform harness.assert_true(not (r->>'allowed')::boolean, 'broker action without mortgage was accepted');

  -- Version, unknown keys and forbidden identifiers fail closed.
  failed := false;
  begin
    p := jsonb_set(harness.base_intake(), '{deal,intake_catalog_version}', '"2099-01-01.1"'::jsonb, true);
    perform nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  exception when sqlstate '22023' then failed := true;
  end;
  perform harness.assert_true(failed, 'catalog version mismatch was accepted');

  failed := false;
  begin
    p := jsonb_set(harness.base_intake(), '{deal,intake_draft,unexpected}', 'true'::jsonb, true);
    perform nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  exception when sqlstate '22023' then failed := true;
  end;
  perform harness.assert_true(failed, 'unknown draft key was accepted');

  failed := false;
  begin
    p := jsonb_set(harness.base_intake(), '{deal,intake_draft,sellerPhone}', '"+7 900 000-00-00"'::jsonb, true);
    perform nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  exception when sqlstate '22023' then failed := true;
  end;
  perform harness.assert_true(failed, 'forbidden phone key was accepted');

  failed := false;
  begin
    p := harness.with_document(harness.base_intake(), 'mortgage_approval_status', 'requested');
    p := jsonb_set(p, '{deal,intake_draft,documents,0,allowed_link}', '"https://example.test/file?token=secret"'::jsonb, true);
    perform nav_v2_private.nav_v2_prepare_intake_save_v1(p);
  exception when sqlstate '22023' then failed := true;
  end;
  perform harness.assert_true(failed, 'client document link was accepted');
end;
$scenarios$;

do $no_writes$
begin
  perform harness.assert_true((select count(*) from public.nav_deals_v2) = 1, 'adapter changed deal count');
  perform harness.assert_true((select marker from public.nav_deals_v2 where id = 1) = 'before', 'adapter changed deal marker');
  perform harness.assert_true((select count(*) from public.nav_deal_documents_v2) = 1, 'adapter changed document count');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2) = 1, 'adapter changed task count');
  perform harness.assert_true((select count(*) from public.nav_deal_risks_v2) = 1, 'adapter changed risk count');
end;
$no_writes$;

select 'Navigator v2 intake server adapter PostgreSQL 17 assertions passed' as result;
