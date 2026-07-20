\set ON_ERROR_STOP on

drop function if exists harness.mock_governed_intake_save_wave2_v1(jsonb,uuid,jsonb,boolean);
drop function if exists harness.wave2_all_intake();
drop function if exists harness.wave2_intake(text,text);
drop function if exists nav_v2_private.nav_v2_map_governed_intake_to_production_wave2_v1(jsonb);
drop function if exists nav_v2_private.nav_v2_build_governed_intake_write_plan_wave2_v1(jsonb,uuid,jsonb);
drop function if exists nav_v2_private.nav_v2_prepare_intake_legacy_save_wave2_v1(jsonb,uuid,jsonb);

do $assertions$
begin
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_map_governed_intake_to_production_wave2_v1(jsonb)') is null,'wave2 mapper survived rollback');
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_build_governed_intake_write_plan_wave2_v1(jsonb,uuid,jsonb)') is null,'wave2 governed builder survived rollback');
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_prepare_intake_legacy_save_wave2_v1(jsonb,uuid,jsonb)') is null,'wave2 preview survived rollback');
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_prepare_intake_legacy_save_wave1_v1(jsonb,uuid,jsonb)') is not null,'wave2 rollback removed wave1 preview');
end;
$assertions$;

select 'Navigator v2 intake semantics wave2 integration overlay rollback passed' as result;
