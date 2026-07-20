\set ON_ERROR_STOP on

drop function if exists nav_v2_private.nav_v2_map_governed_intake_to_production_wave1_v1(jsonb);
drop function if exists nav_v2_private.nav_v2_build_governed_intake_write_plan_wave1_v1(jsonb,uuid,jsonb);
drop function if exists nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(jsonb,uuid,jsonb);

do $assertions$
begin
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_map_governed_intake_to_production_wave1_v1(jsonb)') is null,'wave1 mapper survived rollback');
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_build_governed_intake_write_plan_wave1_v1(jsonb,uuid,jsonb)') is null,'wave1 governed builder survived rollback');
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(jsonb,uuid,jsonb)') is null,'wave1 preview survived rollback');
end;
$assertions$;

select 'Navigator v2 intake semantics wave1 integration overlay rollback passed' as result;
