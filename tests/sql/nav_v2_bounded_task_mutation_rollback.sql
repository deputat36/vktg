-- Isolated rollback rehearsal for bounded task mutation overlay.
-- Synthetic contract-v2 rows are removed only in this ephemeral test database.

drop function if exists public.nav_v2_create_bounded_tasks(uuid, jsonb, uuid);
drop function if exists public.nav_v2_start_bounded_task(uuid, uuid);
drop function if exists public.nav_v2_complete_bounded_task(uuid, uuid, uuid);
drop function if exists public.nav_v2_set_bounded_task_active_outcome(uuid, text, text, date, uuid);
drop function if exists public.nav_v2_propose_bounded_task_terminal_outcome(uuid, text, text, uuid, uuid);
drop function if exists public.nav_v2_decide_bounded_task_terminal_outcome(uuid, text, uuid);

delete from public.nav_deal_tasks_v2 where task_contract_version = 2;

drop table if exists public.nav_deal_task_mutation_events_v2;

drop function if exists nav_v2_private.nav_v2_bounded_task_json(uuid);
drop function if exists nav_v2_private.nav_v2_bounded_task_replay(uuid, text);
drop function if exists nav_v2_private.nav_v2_bounded_task_subject_allowed(text, text);
drop function if exists nav_v2_private.nav_v2_bounded_task_reason_allowed(text, text);
drop function if exists nav_v2_private.nav_v2_can_operate_bounded_task(uuid, uuid);
drop function if exists nav_v2_private.nav_v2_can_decide_bounded_task(uuid, uuid);

drop index if exists public.nav_bounded_tasks_active_subject_owner_idx;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_subject_kind_check,
  drop constraint if exists nav_deal_tasks_v2_subject_required_check,
  drop constraint if exists nav_deal_tasks_v2_terminal_status_check,
  drop constraint if exists nav_deal_tasks_v2_completed_outcome_status_check,
  drop column if exists subject_kind,
  drop column if exists subject_reference_id,
  drop column if exists outcome_proposed_by,
  drop column if exists outcome_proposed_at,
  drop column if exists outcome_decided_by,
  drop column if exists outcome_decided_at;

alter table public.nav_deal_tasks_v2
  add constraint nav_deal_tasks_v2_task_type_check check (
    task_type is null or task_type in (
      'operational_task',
      'document_request',
      'quality_warning',
      'system_recommendation',
      'legal_blocker',
      'broker_task',
      'management_escalation'
    )
  );

create or replace function public.nav_v2_add_task(
  p_deal_id uuid,
  p_title text,
  p_description text default null,
  p_assigned_role public.nav_v2_user_role default null,
  p_priority public.nav_v2_task_priority default 'normal'::public.nav_v2_task_priority,
  p_source text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Пользователь не авторизован' using errcode = '42501'; end if;
  if not nav_v2_private.nav_v2_can_edit_deal(p_deal_id, v_uid) then
    raise exception 'Нет прав менять задачи сделки' using errcode = '42501';
  end if;

  insert into public.nav_deal_tasks_v2(
    deal_id, title, description, assigned_role, priority, source, created_by
  ) values (
    p_deal_id, p_title, p_description, p_assigned_role, p_priority, p_source, v_uid
  );
end;
$$;

create or replace function public.nav_v2_update_task_status(
  p_task_id uuid,
  p_status public.nav_v2_task_status
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_task public.nav_deal_tasks_v2%rowtype;
  v_role public.nav_v2_user_role;
begin
  if v_uid is null then raise exception 'Пользователь не авторизован' using errcode = '42501'; end if;

  select t.* into v_task
  from public.nav_deal_tasks_v2 t
  where t.id = p_task_id
  for update;
  if not found then raise exception 'Задача не найдена' using errcode = 'P0002'; end if;
  if not nav_v2_private.nav_v2_can_view_deal(v_task.deal_id, v_uid) then
    raise exception 'Нет доступа к задаче' using errcode = '42501';
  end if;

  select p.role into v_role from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true limit 1;

  if not nav_v2_private.nav_v2_can_edit_deal(v_task.deal_id, v_uid)
     and v_task.assigned_to is distinct from v_uid
     and v_task.assigned_role is distinct from v_role then
    raise exception 'Нет прав менять статус этой задачи' using errcode = '42501';
  end if;

  update public.nav_deal_tasks_v2
  set status = p_status,
      completed_by = case when p_status = 'done' then v_uid else null end,
      completed_at = case when p_status = 'done' then now() else null end,
      updated_at = now()
  where id = p_task_id;

  insert into public.nav_deal_events_v2(
    deal_id, actor_id, event_type, event_title, event_data
  ) values (
    v_task.deal_id, v_uid, 'task_status_changed', 'Статус задачи изменён',
    jsonb_build_object('task_id', p_task_id, 'status', p_status)
  );

  return jsonb_build_object('ok', true, 'task_id', p_task_id, 'status', p_status);
end;
$$;

revoke execute on function public.nav_v2_add_task(
  uuid, text, text, public.nav_v2_user_role, public.nav_v2_task_priority, text
) from public, anon;
revoke execute on function public.nav_v2_update_task_status(uuid, public.nav_v2_task_status)
  from public, anon;
grant execute on function public.nav_v2_add_task(
  uuid, text, text, public.nav_v2_user_role, public.nav_v2_task_priority, text
) to authenticated, service_role;
grant execute on function public.nav_v2_update_task_status(uuid, public.nav_v2_task_status)
  to authenticated, service_role;

do $$
begin
  if to_regclass('public.nav_deal_task_mutation_events_v2') is not null then
    raise exception 'task mutation event table still exists after rollback';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='nav_deal_tasks_v2' and column_name='subject_kind'
  ) then
    raise exception 'mutation-only subject columns still exist after rollback';
  end if;
  if not exists (
    select 1 from public.nav_deal_tasks_v2
    where id='20000000-0000-4000-8000-000000000001'
      and task_contract_version is null
      and task_type='operational_task'
  ) then
    raise exception 'legacy task was removed by mutation rollback';
  end if;
  if to_regprocedure('nav_v2_private.nav_v2_task_contract_catalog()') is null then
    raise exception 'base bounded task catalog was removed by mutation rollback';
  end if;
  if not has_function_privilege(
    'authenticated',
    'public.nav_v2_add_task(uuid,text,text,public.nav_v2_user_role,public.nav_v2_task_priority,text)',
    'EXECUTE'
  ) then
    raise exception 'legacy add_task grant was not restored';
  end if;
end;
$$;

select 'PostgreSQL bounded task mutation rollback passed' as result;
