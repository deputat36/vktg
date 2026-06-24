create or replace function public.nav_v2_update_task_due_date(p_task_id uuid, p_due_date date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_deal_id uuid;
  v_title text;
  v_old_due_date date;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if p_due_date is not null and p_due_date < current_date then
    raise exception 'Срок задачи не может быть в прошлом';
  end if;

  if not public.nav_v2_can_change_task_status(p_task_id, v_uid) then
    raise exception 'Нет прав менять срок этой задачи' using errcode = '42501';
  end if;

  select deal_id, title, due_date
    into v_deal_id, v_title, v_old_due_date
  from public.nav_deal_tasks_v2
  where id = p_task_id
  for update;

  if v_deal_id is null then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;

  update public.nav_deal_tasks_v2
  set due_date = p_due_date, updated_at = now()
  where id = p_task_id;

  if v_old_due_date is distinct from p_due_date then
    insert into public.nav_deal_events_v2(deal_id, actor_id, event_type, event_title, event_data)
    values (
      v_deal_id,
      v_uid,
      'task_due_date_changed',
      case when p_due_date is null then 'Срок задачи снят' else 'Срок задачи изменен' end,
      jsonb_build_object('task_id', p_task_id, 'title', v_title, 'old_due_date', v_old_due_date, 'due_date', p_due_date)
    );
  end if;

  return jsonb_build_object('ok', true, 'task_id', p_task_id, 'old_due_date', v_old_due_date, 'due_date', p_due_date);
end;
$function$;

revoke all on function public.nav_v2_update_task_due_date(uuid, date) from public;
revoke all on function public.nav_v2_update_task_due_date(uuid, date) from anon;
grant execute on function public.nav_v2_update_task_due_date(uuid, date) to authenticated;
