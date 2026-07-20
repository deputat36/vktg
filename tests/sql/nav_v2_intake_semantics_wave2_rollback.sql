\set ON_ERROR_STOP on

drop function if exists harness.wave2_owner_context(text);
drop function if exists harness.wave2_with_document(jsonb,text,text);
drop function if exists harness.wave2_with_fact(jsonb,text,text);
drop function if exists harness.wave2_base_intake(text,text,text);
drop function if exists nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(jsonb,jsonb);
drop function if exists nav_v2_private.nav_v2_intake_semantics_wave2_spec_v1();

do $assertions$
begin
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_qualify_intake_semantics_wave2_v1(jsonb,jsonb)') is null,
    'wave2 qualifier survived rollback'
  );
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_intake_semantics_wave2_spec_v1()') is null,
    'wave2 spec survived rollback'
  );
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb)') is not null,
    'base intake adapter was removed by wave2 rollback'
  );
  perform harness.assert_true((select count(*) from public.nav_deals_v2)=1,'wave2 rollback changed marker deal rows');
  perform harness.assert_true((select count(*) from public.nav_deal_documents_v2)=1,'wave2 rollback changed marker document rows');
  perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2)=1,'wave2 rollback changed marker task rows');
  perform harness.assert_true((select count(*) from public.nav_deal_risks_v2)=1,'wave2 rollback changed marker risk rows');
end;
$assertions$;

select 'Navigator v2 intake semantics wave2 rollback passed' as result;
