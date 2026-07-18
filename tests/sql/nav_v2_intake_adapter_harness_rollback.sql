\set ON_ERROR_STOP on

do $no_writes_before_rollback$
begin
  perform harness.assert_true((select count(*) from public.nav_deals_v2) = 1, 'rollback preflight found changed deal rows');
  perform harness.assert_true((select marker from public.nav_deals_v2 where id = 1) = 'before', 'rollback preflight found changed deal marker');
  perform harness.assert_true((select count(*) from public.nav_deal_documents_v2) = 1, 'rollback preflight found changed document rows');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2) = 1, 'rollback preflight found changed task rows');
  perform harness.assert_true((select count(*) from public.nav_deal_risks_v2) = 1, 'rollback preflight found changed risk rows');
end;
$no_writes_before_rollback$;

drop function nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb);
drop function nav_v2_private.nav_v2_intake_rule_matches_v1(jsonb, jsonb, jsonb);
drop function nav_v2_private.nav_v2_intake_show_when_matches_v1(jsonb, jsonb);
drop function nav_v2_private.nav_v2_intake_contains_forbidden_key_v1(jsonb);
drop function nav_v2_private.nav_v2_intake_catalog_sha256_v1();
drop function nav_v2_private.nav_v2_intake_catalog_v1();

do $adapter_removed$
begin
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb)') is null,
    'server adapter function survived rollback'
  );
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_intake_catalog_v1()') is null,
    'server catalog function survived rollback'
  );
end;
$adapter_removed$;

drop table public.nav_deal_risks_v2;
drop table public.nav_deal_tasks_v2;
drop table public.nav_deal_documents_v2;
drop table public.nav_deals_v2;
drop schema harness cascade;
drop schema nav_v2_private;
drop role service_role;
drop role authenticated;
drop role anon;

select 'Navigator v2 intake server adapter rollback passed' as result;
