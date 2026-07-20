\set ON_ERROR_STOP on

do $normalize_wave1_harness$
begin
 if to_regclass('harness.nav_v2_governed_events') is not null
    and to_regclass('nav_v2_private.nav_v2_intake_save_requests_v1') is not null then
  execute 'truncate table harness.nav_v2_governed_events, harness.nav_v2_governed_tasks, harness.nav_v2_governed_risks, harness.nav_v2_governed_documents, harness.nav_v2_governed_participants, harness.nav_v2_governed_deals, nav_v2_private.nav_v2_intake_save_requests_v1';
 end if;
end;
$normalize_wave1_harness$;

drop function if exists nav_v2_private.nav_v2_map_governed_intake_to_production_wave1_v1(jsonb);
drop function if exists nav_v2_private.nav_v2_build_governed_intake_write_plan_wave1_v1(jsonb,uuid,jsonb);
drop function if exists nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(jsonb,uuid,jsonb);

do $assertions$
begin
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_map_governed_intake_to_production_wave1_v1(jsonb)') is null,'wave1 mapper survived rollback');
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_build_governed_intake_write_plan_wave1_v1(jsonb,uuid,jsonb)') is null,'wave1 governed builder survived rollback');
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(jsonb,uuid,jsonb)') is null,'wave1 preview survived rollback');
 if to_regclass('harness.nav_v2_governed_deals') is not null then
  perform harness.assert_true((select count(*) from harness.nav_v2_governed_deals)=0,'wave1 rollback left shadow deals');
 end if;
 if to_regclass('nav_v2_private.nav_v2_intake_save_requests_v1') is not null then
  perform harness.assert_true((select count(*) from nav_v2_private.nav_v2_intake_save_requests_v1)=0,'wave1 rollback left ledger rows');
 end if;
end;
$assertions$;

select 'Navigator v2 intake semantics wave1 integration overlay rollback passed' as result;
