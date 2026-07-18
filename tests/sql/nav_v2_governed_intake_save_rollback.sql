\set ON_ERROR_STOP on

do $rollback_preflight$
begin
  perform harness.assert_true((select count(*) from public.nav_deals_v2) = 1, 'governed rollback found changed production-marker deals');
  perform harness.assert_true((select marker from public.nav_deals_v2 where id = 1) = 'before', 'governed rollback found changed production marker');
  if to_regclass('harness.nav_v2_governed_deals') is not null then
    perform harness.assert_true((select count(*) from harness.nav_v2_governed_deals) <= 5, 'governed rollback found unexpected shadow deals');
  end if;
  if to_regclass('nav_v2_private.nav_v2_intake_save_requests_v1') is not null then
    perform harness.assert_true((select count(*) from nav_v2_private.nav_v2_intake_save_requests_v1) <= 5, 'governed rollback found unexpected ledger rows');
    perform harness.assert_true(
      not exists (select 1 from nav_v2_private.nav_v2_intake_save_requests_v1 where state = 'started'),
      'governed rollback found a stranded started request'
    );
  end if;
end;
$rollback_preflight$;

drop function if exists harness.mock_governed_intake_save_v1(jsonb, uuid, jsonb, boolean, numeric);
drop function if exists harness.concurrent_intake();
drop function if exists harness.governed_intake_server_context(uuid, text, uuid, uuid, uuid, uuid, uuid);
drop table if exists harness.nav_v2_governed_events;
drop table if exists harness.nav_v2_governed_tasks;
drop table if exists harness.nav_v2_governed_risks;
drop table if exists harness.nav_v2_governed_documents;
drop table if exists harness.nav_v2_governed_participants;
drop table if exists harness.nav_v2_governed_deals;

drop function if exists nav_v2_private.nav_v2_complete_intake_save_request_v1(uuid, uuid, text, jsonb);
drop function if exists nav_v2_private.nav_v2_begin_intake_save_request_v1(jsonb);
drop function if exists nav_v2_private.nav_v2_build_governed_intake_write_plan_v1(jsonb, uuid, jsonb);
do $drop_governed_trigger$
begin
  if to_regclass('nav_v2_private.nav_v2_intake_save_requests_v1') is not null then
    drop trigger if exists nav_v2_intake_save_request_must_complete_v1
      on nav_v2_private.nav_v2_intake_save_requests_v1;
  end if;
end;
$drop_governed_trigger$;
drop function if exists nav_v2_private.nav_v2_assert_intake_save_request_completed_v1();
drop function if exists nav_v2_private.nav_v2_intake_save_lock_key_v1(uuid);
drop table if exists nav_v2_private.nav_v2_intake_save_requests_v1;

do $governed_removed$
begin
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_build_governed_intake_write_plan_v1(jsonb,uuid,jsonb)') is null,
    'governed write plan survived rollback'
  );
  perform harness.assert_true(
    to_regclass('nav_v2_private.nav_v2_intake_save_requests_v1') is null,
    'governed request ledger survived rollback'
  );
  perform harness.assert_true((select count(*) from public.nav_deals_v2) = 1, 'governed rollback changed production-marker rows');
end;
$governed_removed$;

select 'Navigator v2 governed intake save overlay rollback passed' as result;
