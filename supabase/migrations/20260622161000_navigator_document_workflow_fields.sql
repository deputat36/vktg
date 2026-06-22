alter table public.nav_deal_documents_v2
  add column if not exists assigned_to uuid references public.nav_user_profiles(id) on delete set null,
  add column if not exists responsible_role public.nav_v2_user_role,
  add column if not exists due_date date,
  add column if not exists status_note text,
  add column if not exists problem_note text,
  add column if not exists last_status_changed_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists nav_deal_documents_v2_assigned_to_idx
  on public.nav_deal_documents_v2(assigned_to)
  where assigned_to is not null;

create index if not exists nav_deal_documents_v2_responsible_role_status_idx
  on public.nav_deal_documents_v2(responsible_role, status)
  where responsible_role is not null;

create index if not exists nav_deal_documents_v2_due_status_idx
  on public.nav_deal_documents_v2(due_date, status)
  where due_date is not null and status not in ('checked');

update public.nav_deal_documents_v2
set responsible_role = case
    when category in ('mortgage') then 'broker'::public.nav_v2_user_role
    when category in ('children', 'matcap', 'title', 'deal') or required_for_deposit = true then 'lawyer'::public.nav_v2_user_role
    else 'spn'::public.nav_v2_user_role
  end,
  due_date = coalesce(
    due_date,
    case
      when status in ('needed', 'missing', 'requested', 'problem') then current_date + 3
      else null
    end
  ),
  updated_at = now()
where responsible_role is null
   or (due_date is null and status in ('needed', 'missing', 'requested', 'problem'));

create or replace function public.nav_v2_update_document_workflow(
  p_document_id uuid,
  p_status text default null,
  p_assigned_to uuid default null,
  p_responsible_role public.nav_v2_user_role default null,
  p_due_date date default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_deal_id uuid;
  v_title text;
  v_old_status text;
  v_new_status text;
  v_role public.nav_v2_user_role;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if p_status is not null and p_status not in ('needed', 'missing', 'requested', 'received', 'checked', 'problem') then
    raise exception 'Недопустимый статус документа';
  end if;

  select deal_id, title, status
  into v_deal_id, v_title, v_old_status
  from public.nav_deal_documents_v2
  where id = p_document_id;

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

  v_new_status := coalesce(p_status, v_old_status);

  update public.nav_deal_documents_v2
  set status = v_new_status,
      assigned_to = coalesce(p_assigned_to, assigned_to),
      responsible_role = coalesce(p_responsible_role, responsible_role),
      due_date = coalesce(p_due_date, due_date),
      status_note = coalesce(v_note, status_note),
      problem_note = case
        when v_new_status = 'problem' then coalesce(v_note, problem_note)
        when v_new_status in ('received', 'checked') then null
        else problem_note
      end,
      requested_at = case
        when v_new_status = 'requested' then coalesce(requested_at, now())
        when v_new_status in ('needed', 'missing') then null
        else requested_at
      end,
      checked_by = case when v_new_status in ('received', 'checked', 'problem') then v_uid else checked_by end,
      checked_at = case
        when v_new_status in ('received', 'checked', 'problem') then now()
        when v_new_status in ('needed', 'missing', 'requested') then null
        else checked_at
      end,
      last_status_changed_at = case when v_new_status is distinct from v_old_status then now() else last_status_changed_at end,
      resolved_at = case
        when v_new_status = 'checked' then now()
        when v_new_status in ('needed', 'missing', 'requested', 'problem') then null
        else resolved_at
      end,
      updated_at = now()
  where id = p_document_id;

  insert into public.nav_deal_events_v2 (
    deal_id, actor_id, event_type, event_title, event_data
  ) values (
    v_deal_id,
    v_uid,
    'document_workflow_updated',
    'Документ обновлен',
    jsonb_build_object(
      'document_id', p_document_id,
      'title', v_title,
      'old_status', v_old_status,
      'status', v_new_status,
      'assigned_to', p_assigned_to,
      'responsible_role', p_responsible_role,
      'due_date', p_due_date,
      'has_note', v_note is not null
    )
  );

  return jsonb_build_object('ok', true, 'document_id', p_document_id, 'status', v_new_status);
end;
$function$;

create or replace function public.nav_v2_update_document_status(p_document_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
begin
  return public.nav_v2_update_document_workflow(p_document_id, p_status, null, null, null, null);
end;
$function$;

revoke all on function public.nav_v2_update_document_workflow(uuid, text, uuid, public.nav_v2_user_role, date, text) from public;
revoke execute on function public.nav_v2_update_document_workflow(uuid, text, uuid, public.nav_v2_user_role, date, text) from anon;
grant execute on function public.nav_v2_update_document_workflow(uuid, text, uuid, public.nav_v2_user_role, date, text) to authenticated;
grant execute on function public.nav_v2_update_document_workflow(uuid, text, uuid, public.nav_v2_user_role, date, text) to service_role;

revoke all on function public.nav_v2_update_document_status(uuid, text) from public;
revoke execute on function public.nav_v2_update_document_status(uuid, text) from anon;
grant execute on function public.nav_v2_update_document_status(uuid, text) to authenticated;
grant execute on function public.nav_v2_update_document_status(uuid, text) to service_role;
