\set ON_ERROR_STOP on

do $contract$
begin
  perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_prepare_intake_legacy_save_special_v1(jsonb,uuid,jsonb)') is not null,'final preview missing');
  perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_build_governed_intake_write_plan_special_v1(jsonb,uuid,jsonb)') is not null,'final governed builder missing');
  perform harness.assert_true(not has_function_privilege('authenticated','nav_v2_private.nav_v2_prepare_intake_legacy_save_special_v1(jsonb,uuid,jsonb)','EXECUTE'),'authenticated can execute final preview');
  perform harness.assert_true(has_function_privilege('service_role','nav_v2_private.nav_v2_prepare_intake_legacy_save_special_v1(jsonb,uuid,jsonb)','EXECUTE'),'service role lacks final preview');
end;
$contract$;

select 'Navigator v2 preview bundle final intake contract assertions passed' as result;
