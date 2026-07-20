\set ON_ERROR_STOP on

drop trigger if exists nav_deals_v2_quality_tasks_aiu on public.nav_deals_v2;

do $rollback$
declare
  v_definition text;
begin
  select definition into v_definition from harness.quality_snapshot where object_name='sync';
  execute v_definition;
  select definition into v_definition from harness.quality_snapshot where object_name='trigger_function';
  execute v_definition;
  select definition into v_definition from harness.quality_snapshot where object_name='trigger';
  execute v_definition;
end;
$rollback$;

revoke execute on function public.nav_v2_sync_deal_quality_tasks(uuid) from public, anon, authenticated, service_role;
revoke execute on function public.nav_v2_deal_quality_tasks_trigger() from public, anon, authenticated, service_role;

drop function if exists nav_v2_private.nav_v2_quality_sync_task_v1(
  uuid, boolean, text, text, text, uuid, public.nav_v2_user_role,
  public.nav_v2_task_priority, text, integer
);

do $assertions$
declare
  v_sync_md5 text;
  v_trigger_fn_md5 text;
  v_trigger_md5 text;
begin
  v_sync_md5 := md5(pg_get_functiondef('public.nav_v2_sync_deal_quality_tasks(uuid)'::regprocedure));
  v_trigger_fn_md5 := md5(pg_get_functiondef('public.nav_v2_deal_quality_tasks_trigger()'::regprocedure));
  v_trigger_md5 := md5(pg_get_triggerdef((
    select oid from pg_trigger where tgname='nav_deals_v2_quality_tasks_aiu' and not tgisinternal
  ), true));

  perform harness.assert_true(
    v_sync_md5 = (select definition_md5 from harness.quality_snapshot where object_name='sync'),
    'quality sync function did not return to exact snapshot'
  );
  perform harness.assert_true(
    v_trigger_fn_md5 = (select definition_md5 from harness.quality_snapshot where object_name='trigger_function'),
    'quality trigger function did not return to exact snapshot'
  );
  perform harness.assert_true(
    v_trigger_md5 = (select definition_md5 from harness.quality_snapshot where object_name='trigger'),
    'quality trigger definition did not return to exact snapshot'
  );
  perform harness.assert_true(
    to_regprocedure('nav_v2_private.nav_v2_quality_sync_task_v1(uuid,boolean,text,text,text,uuid,nav_v2_user_role,nav_v2_task_priority,text,integer)') is null,
    'private quality helper survived rollback'
  );
end;
$assertions$;

select 'Navigator v2 privacy-aligned quality exact rollback passed' as result;
