\set ON_ERROR_STOP on

drop function if exists nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(jsonb,jsonb);
drop function if exists nav_v2_private.nav_v2_intake_semantics_wave1_spec_v1();

do $assertions$
begin
 if to_regprocedure('nav_v2_private.nav_v2_qualify_intake_semantics_wave1_v1(jsonb,jsonb)') is not null then
  raise exception 'wave1 qualifier survived standalone rollback';
 end if;
 if to_regprocedure('nav_v2_private.nav_v2_intake_semantics_wave1_spec_v1()') is not null then
  raise exception 'wave1 spec survived standalone rollback';
 end if;
end;
$assertions$;

select 'Navigator v2 wave1 qualification standalone rollback passed' as result;
