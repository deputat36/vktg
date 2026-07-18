\set ON_ERROR_STOP on

do $rollback_preflight$
begin
  perform harness.assert_true((select count(*) from public.nav_deals_v2) = 1, 'rollback found changed deal rows');
  perform harness.assert_true((select count(*) from harness.nav_v2_intake_mock_save_calls) <= 2, 'rollback found unexpected mock writes');
  perform harness.assert_true((select count(*) from harness.nav_v2_intake_mock_request_ledger) <= 2, 'rollback found unexpected ledger rows');
end;
$rollback_preflight$;

drop function if exists nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(jsonb, uuid, jsonb);
drop function if exists nav_v2_private.nav_v2_intake_legacy_markers_v1(jsonb, text);
drop function if exists nav_v2_private.nav_v2_intake_context_uuid_v1(jsonb, text, boolean);
drop function if exists nav_v2_private.nav_v2_intake_legacy_mode_v1(text);
drop function if exists harness.mock_legacy_save_v1(jsonb);
drop function if exists harness.intake_server_context(uuid, uuid);
drop table harness.nav_v2_intake_mock_request_ledger;
drop table harness.nav_v2_intake_mock_save_calls;
drop function nav_v2_private.nav_v2_sanitize_client_deal_json(jsonb);

do $integration_removed$
begin
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(jsonb,uuid,jsonb)') is null,
    'integration preview survived rollback'
  );
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_sanitize_client_deal_json(jsonb)') is null,
    'sanitizer snapshot survived rollback'
  );
  perform harness.assert_true((select count(*) from public.nav_deals_v2) = 1, 'rollback changed public marker rows');
end;
$integration_removed$;

select 'Navigator v2 intake save integration rollback passed' as result;
