\set ON_ERROR_STOP on

do $concurrent_replay$
declare
  v_request_id constant uuid := '64000000-0000-4000-8000-000000000030';
  v_result jsonb;
begin
  perform harness.assert_true(
    (select count(*) from harness.nav_v2_governed_deals where client_request_id = v_request_id) = 1,
    'concurrent exact replay crossed the business-write boundary twice'
  );
  perform harness.assert_true(
    (select count(*) from nav_v2_private.nav_v2_intake_save_requests_v1 where client_request_id = v_request_id) = 1,
    'concurrent exact replay did not converge on one ledger row'
  );
  select result_payload into v_result
  from nav_v2_private.nav_v2_intake_save_requests_v1
  where client_request_id = v_request_id
    and state = 'completed'
    and replay_count = 1;
  perform harness.assert_true(v_result is not null, 'concurrent ledger did not complete with one replay');
  perform harness.assert_true(v_result->>'deal_id' = v_request_id::text, 'concurrent replay stored another deal result');
  perform harness.assert_true(
    (select count(*) from harness.nav_v2_governed_events where client_request_id = v_request_id) = 1,
    'concurrent exact replay created another event'
  );
  perform harness.assert_true((select count(*) from harness.nav_v2_governed_deals) = 5, 'unexpected total deal count after concurrency proof');
  perform harness.assert_true((select count(*) from nav_v2_private.nav_v2_intake_save_requests_v1) = 5, 'unexpected total ledger count after concurrency proof');
  perform harness.assert_true((select count(*) from public.nav_deals_v2) = 1, 'concurrency proof changed production-marker deals');
end;
$concurrent_replay$;

select 'Navigator v2 governed intake save PostgreSQL 17 concurrent replay assertions passed' as result;
