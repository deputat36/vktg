\set ON_ERROR_STOP on

drop function if exists harness.special_composite(text);
drop function if exists harness.special_house_land();
drop function if exists harness.special_flat_ground();
drop function if exists harness.special_partner_agency();
drop function if exists harness.special_legal_problem();
drop function if exists harness.special_owner_context(text);
drop function if exists nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(jsonb,jsonb);
drop function if exists nav_v2_private.nav_v2_intake_special_semantics_spec_v1();

do $assertions$
begin
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(jsonb,jsonb)') is null,'special qualifier survived rollback');
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_intake_special_semantics_spec_v1()') is null,'special spec survived rollback');
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_prepare_intake_save_v1(jsonb)') is not null,'special rollback removed base adapter');
 perform harness.assert_true((select count(*) from public.nav_deals_v2)=1,'special rollback changed marker deal rows');
 perform harness.assert_true((select count(*) from public.nav_deal_documents_v2)=1,'special rollback changed marker document rows');
 perform harness.assert_true((select count(*) from public.nav_deal_tasks_v2)=1,'special rollback changed marker task rows');
 perform harness.assert_true((select count(*) from public.nav_deal_risks_v2)=1,'special rollback changed marker risk rows');
end;
$assertions$;

select 'Navigator v2 special semantics qualification rollback passed' as result;
