\set ON_ERROR_STOP on

drop function if exists nav_v2_private.nav_v2_plan_legacy_quality_cleanup_v1();
drop function if exists nav_v2_private.nav_v2_classify_legacy_quality_task_v1(text,text,text,boolean,boolean,boolean,boolean);

do $assertions$
declare
  v_before harness.before_snapshot%rowtype;
  v_after_deals bigint;
  v_after_tasks bigint;
  v_after_hash text;
begin
  select * into v_before from harness.before_snapshot;
  select count(*) into v_after_deals from public.nav_deals_v2;
  select count(*), md5(coalesce(string_agg(id::text||':'||status::text||':'||coalesce(source,''),'|' order by id),''))
  into v_after_tasks, v_after_hash from public.nav_deal_tasks_v2;

  perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_plan_legacy_quality_cleanup_v1()') is null, 'planner survived rollback');
  perform harness.assert_true(to_regprocedure('nav_v2_private.nav_v2_classify_legacy_quality_task_v1(text,text,text,boolean,boolean,boolean,boolean)') is null, 'classifier survived rollback');
  perform harness.assert_true(v_after_deals=v_before.deal_count, 'rollback changed deal count');
  perform harness.assert_true(v_after_tasks=v_before.task_count, 'rollback changed task count');
  perform harness.assert_true(v_after_hash=v_before.task_hash, 'rollback changed task rows');
end;
$assertions$;

select 'Navigator v2 legacy quality cleanup planner rollback passed' as result;
