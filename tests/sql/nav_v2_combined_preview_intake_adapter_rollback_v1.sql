\set ON_ERROR_STOP on

-- Combined-safe replacement for nav_v2_intake_adapter_harness_rollback.sql.
-- It removes only intake adapter objects and marker tables. Shared schemas, roles,
-- quality snapshots and bounded objects belong to the combined lifecycle and survive.

do $no_writes_before_rollback$
begin
  perform harness.assert_true((select count(*) from public.nav_deals_v2) = 1, 'rollback preflight found changed deal rows');
  perform harness.assert_true((select marker from public.nav_deals_v2 where id = 1) = 'before', 'rollback preflight found changed deal marker');
  perform harness.assert_true((select count(*) from public.nav_deal_documents_v2) = 1, 'rollback preflight found changed document rows');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2) = 1, 'rollback preflight found changed task rows');
  perform harness.assert_true((select count(*) from public.nav_deal_risks_v2) = 1, 'rollback preflight found changed risk rows');
end;
$no_writes_before_rollback$;

drop function if exists nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb);
drop function if exists nav_v2_private.nav_v2_intake_rule_matches_v1(jsonb, jsonb, jsonb);
drop function if exists nav_v2_private.nav_v2_intake_show_when_matches_v1(jsonb, jsonb);
drop function if exists nav_v2_private.nav_v2_intake_contains_forbidden_key_v1(jsonb);
drop function if exists nav_v2_private.nav_v2_intake_catalog_sha256_v1();
drop function if exists nav_v2_private.nav_v2_intake_catalog_v1();

do $adapter_removed$
begin
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb)') is null,
    'server adapter function survived combined rollback'
  );
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_intake_catalog_v1()') is null,
    'server catalog function survived combined rollback'
  );
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_quality_sync_task_v1(uuid,boolean,text,text,text,uuid,nav_v2_user_role,nav_v2_task_priority,text,integer)') is not null,
    'combined rollback removed privacy quality helper too early'
  );
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_task_contract_catalog()') is not null,
    'combined rollback removed bounded contract too early'
  );
  perform harness.assert_true(
    to_regclass('harness.quality_snapshot') is not null,
    'combined rollback removed quality snapshot'
  );
end;
$adapter_removed$;

drop table if exists public.nav_deal_risks_v2;
drop table if exists public.nav_deal_tasks_v2;
drop table if exists public.nav_deal_documents_v2;
drop table if exists public.nav_deals_v2;

select 'Navigator v2 combined-safe intake adapter rollback passed' as result;
