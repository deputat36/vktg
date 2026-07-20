\set ON_ERROR_STOP on

truncate table
  harness.nav_v2_governed_events,
  harness.nav_v2_governed_tasks,
  harness.nav_v2_governed_risks,
  harness.nav_v2_governed_documents,
  harness.nav_v2_governed_participants,
  harness.nav_v2_governed_deals,
  nav_v2_private.nav_v2_intake_save_requests_v1;

do $assertions$
begin
 perform harness.assert_true((select count(*) from harness.nav_v2_governed_deals)=0,'wave1 governed cleanup left shadow deals');
 perform harness.assert_true((select count(*) from nav_v2_private.nav_v2_intake_save_requests_v1)=0,'wave1 governed cleanup left ledger rows');
 perform harness.assert_true((select count(*) from public.nav_deals_v2)=1,'wave1 governed cleanup changed production marker rows');
end;
$assertions$;

select 'Navigator v2 wave1 synthetic governed rows normalized for base rollback' as result;
