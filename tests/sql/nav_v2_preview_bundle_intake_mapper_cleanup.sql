\set ON_ERROR_STOP on

drop function if exists nav_v2_private.nav_v2_map_governed_intake_to_production_v1(jsonb);
drop function if exists nav_v2_private.nav_v2_map_intake_task_priority_v1(jsonb);
drop function if exists nav_v2_private.nav_v2_map_intake_task_type_v1(text);
drop function if exists nav_v2_private.nav_v2_map_intake_risk_level_v1(text);
drop function if exists nav_v2_private.nav_v2_map_intake_document_status_v1(text);
drop function if exists nav_v2_private.nav_v2_map_intake_document_side_v1(text);

do $assertions$
begin
  if to_regprocedure('nav_v2_private.nav_v2_map_governed_intake_to_production_v1(jsonb)') is not null
     or to_regprocedure('nav_v2_private.nav_v2_map_intake_task_priority_v1(jsonb)') is not null
     or to_regprocedure('nav_v2_private.nav_v2_map_intake_task_type_v1(text)') is not null
     or to_regprocedure('nav_v2_private.nav_v2_map_intake_risk_level_v1(text)') is not null
     or to_regprocedure('nav_v2_private.nav_v2_map_intake_document_status_v1(text)') is not null
     or to_regprocedure('nav_v2_private.nav_v2_map_intake_document_side_v1(text)') is not null then
    raise exception 'intake production-schema mapper helpers remain after rehearsal cleanup';
  end if;
end;
$assertions$;

select 'Navigator v2 intake mapper rehearsal cleanup passed' as result;
