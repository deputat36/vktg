create or replace function public.nav_v2_update_document_assignment(
  p_document_id uuid,
  p_assigned_to uuid default null,
  p_responsible_role public.nav_v2_user_role default null,
  p_due_date date default null,
  p_clear_assigned_to boolean default false,
  p_clear_due_date boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deal_id uuid;
  v_title text;
  v_role public.nav_v2_user_role;
  v_old_assigned_to uuid;
  v_old_responsible_role public.nav_v2_user_role;
  v_old_due_date date;
  v_new_assigned_to uuid;
  v_new_responsible_role public.nav_v2_user_role;
  v_new_due_date date;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  select deal_id, title, assigned_to, responsible_role, due_date
  into v_deal_id, v_title, v_old_assigned_to, v_old_responsible_role, v_old_due_date
  from public.nav_deal_documents_v2
  where id = p_document_id
  for update;

  if v_deal_id is null then
    raise exception 'Документ не найден';
  end if;

  if not public.nav_v2_can_view_deal(v_deal_id, v_uid) then
    raise exception 'Нет доступа к документам сделки' using errcode = '42501';
  end if;

  v_role := public.nav_v2_my_role(v_uid);

  if not public.nav_v2_can_edit_deal(v_deal_id, v_uid)
     and v_role not in ('lawyer', 'broker') then
    raise exception 'Нет прав менять документы сделки' using errcode = '42501';
  end if;

  if p_assigned_to is not null and not exists (
    select 1
    from public.nav_deal_participants_v2 p
    where p.deal_id = v_deal_id
      and p.user_id = p_assigned_to
  ) then
    raise exception 'Ответственный должен быть участником сделки';
  end if;

  v_new_assigned_to := case
    when p_clear_assigned_to then null
    when p_assigned_to is not null then p_assigned_to
    else v_old_assigned_to
  end;
  v_new_responsible_role := coalesce(p_responsible_role, v_old_responsible_role);
  v_new_due_date := case
    when p_clear_due_date then null
    when p_due_date is not null then p_due_date
    else v_old_due_date
  end;

  update public.nav_deal_documents_v2
  set assigned_to = v_new_assigned_to,
      responsible_role = v_new_responsible_role,
      due_date = v_new_due_date,
      updated_at = now()
  where id = p_document_id;

  if v_new_assigned_to is distinct from v_old_assigned_to
     or v_new_responsible_role is distinct from v_old_responsible_role
     or v_new_due_date is distinct from v_old_due_date then
    insert into public.nav_deal_events_v2 (
      deal_id, actor_id, event_type, event_title, event_data
    ) values (
      v_deal_id,
      v_uid,
      'document_assignment_updated',
      'Ответственный за документ обновлен',
      jsonb_build_object(
        'document_id', p_document_id,
        'title', v_title,
        'old_assigned_to', v_old_assigned_to,
        'assigned_to', v_new_assigned_to,
        'old_responsible_role', v_old_responsible_role,
        'responsible_role', v_new_responsible_role,
        'old_due_date', v_old_due_date,
        'due_date', v_new_due_date
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'document_id', p_document_id,
    'assigned_to', v_new_assigned_to,
    'responsible_role', v_new_responsible_role,
    'due_date', v_new_due_date
  );
end;
$$;

revoke all on function public.nav_v2_update_document_assignment(uuid, uuid, public.nav_v2_user_role, date, boolean, boolean) from public;
revoke all on function public.nav_v2_update_document_assignment(uuid, uuid, public.nav_v2_user_role, date, boolean, boolean) from anon;
grant execute on function public.nav_v2_update_document_assignment(uuid, uuid, public.nav_v2_user_role, date, boolean, boolean) to authenticated, service_role;
