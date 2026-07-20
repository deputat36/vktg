\set ON_ERROR_STOP on

drop function if exists nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(jsonb,jsonb);
drop function if exists nav_v2_private.nav_v2_intake_semantics_wave1_spec_v1();

do $assertions$
begin
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(jsonb,jsonb)') is null,
    'wave1 qualifier survived rollback'
  );
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_intake_semantics_wave1_spec_v1()') is null,
    'wave1 spec survived rollback'
  );
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb)') is not null,
    'base intake adapter was removed by wave1 rollback'
  );
  perform harness.assert_true((select count(*) from public.nav_deals_v2)=1,'wave1 rollback changed marker deal rows');
  perform harness.assert_true((select count(*) from public.nav_deal_documents_v2)=1,'wave1 rollback changed marker document rows');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2)=1,'wave1 rollback changed marker task rows');
  perform harness.assert_true((select count(*) from public.nav_deal_risks_v2)=1,'wave1 rollback changed marker risk rows');
end;
$assertions$;

select 'Navigator v2 intake semantics wave1 rollback passed' as result;
