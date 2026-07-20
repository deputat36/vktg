\set ON_ERROR_STOP on

drop function if exists harness.write_mapping_special(uuid,jsonb);
drop function if exists harness.special_composite_mapping_plan(text);
drop function if exists harness.special_mapping_plan(text);
drop function if exists harness.mock_governed_intake_save_special_v1(jsonb,uuid,jsonb,boolean);
drop function if exists nav_v2_private.nav_v2_map_governed_intake_to_production_special_v1(jsonb);
drop function if exists nav_v2_private.nav_v2_build_governed_intake_write_plan_special_v1(jsonb,uuid,jsonb);
drop function if exists nav_v2_private.nav_v2_prepare_intake_legacy_save_special_v1(jsonb,uuid,jsonb);

do $assertions$
begin
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_map_governed_intake_to_production_special_v1(jsonb)') is null,'final mapper survived rollback');
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_build_governed_intake_write_plan_special_v1(jsonb,uuid,jsonb)') is null,'final governed builder survived rollback');
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_prepare_intake_legacy_save_special_v1(jsonb,uuid,jsonb)') is null,'final preview survived rollback');
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_map_governed_intake_to_production_wave2_v1(jsonb)') is not null,'final rollback removed wave2 mapper');
 perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_prepare_intake_legacy_save_wave2_v1(jsonb,uuid,jsonb)') is not null,'final rollback removed wave2 preview');
end;
$assertions$;

select 'Navigator v2 final special semantics integration rollback passed' as result;
