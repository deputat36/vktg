drop function if exists public.nav_v2_get_legacy_task_review_pack(integer);

do $$
begin
  if to_regprocedure('public.nav_v2_get_legacy_task_review_pack(integer)') is not null then
    raise exception 'legacy task review function still exists after rollback';
  end if;
  if to_regprocedure('nav_v2_private.nav_v2_task_contract_catalog()') is null then
    raise exception 'bounded task catalog was removed by review rollback';
  end if;
  if not exists (
    select 1 from public.nav_deal_tasks_v2
    where id='20000000-0000-4000-8000-000000000001'
      and task_contract_version is null
      and task_type='operational_task'
  ) then
    raise exception 'legacy task was removed or changed by review rollback';
  end if;
  if exists (select 1 from public.nav_deal_tasks_v2 where task_contract_version = 2) then
    raise exception 'review rollback found unexpected bounded rows';
  end if;
end;
$$;

select 'PostgreSQL legacy task review rollback passed' as result;
