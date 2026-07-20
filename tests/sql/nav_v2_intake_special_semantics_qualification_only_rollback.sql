\set ON_ERROR_STOP on

drop function if exists nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(jsonb,jsonb);
drop function if exists nav_v2_private.nav_v2_intake_special_semantics_spec_v1();

do $assertions$
begin
 if to_regprocedure('nav_v2_private.nav_v2_qualify_intake_special_semantics_v1(jsonb,jsonb)') is not null then
  raise exception 'special qualifier survived standalone rollback';
 end if;
 if to_regprocedure('nav_v2_private.nav_v2_intake_special_semantics_spec_v1()') is not null then
  raise exception 'special spec survived standalone rollback';
 end if;
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_map_governed_intake_to_production_wave2_v1(jsonb)') is not null,'special qualification rollback removed wave2 mapper');
end;
$assertions$;

select 'Navigator v2 special qualification standalone rollback passed' as result;
