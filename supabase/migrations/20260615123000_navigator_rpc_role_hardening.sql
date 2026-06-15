-- Усиливает внутренние проверки доступа в рабочих RPC Навигатора.
-- Миграция синхронизирует GitHub с уже применённой конфигурацией Supabase.

create or replace function public.nav_v2_add_document(
  p_deal_id uuid,
  p_side public.nav_v2_side,
  p_category text,
  p_title text,
  p_required_for_deposit boolean default false,
  p_required_for_deal boolean default true,
  p_description text default null,
  p_source_hint text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if not public.nav_v2_can_edit_deal(p_deal_id, v_uid) then
    raise exception 'Нет прав менять документы сделки' using errcode = '42501';
  end if;

  insert into public.nav_deal_documents_v2 (
    deal_id,
    side,
    category,
    title,
    required_for_deposit,
    required_for_deal,
    description,
    source_hint
  ) values (
    p_deal_id,
    p_side,
    p_category,
    p_title,
    p_required_for_deposit,
    p_required_for_deal,
    p_description,
    p_source_hint
  );
end;
$$;

create or replace function public.nav_v2_add_expense(
  p_deal_id uuid,
  p_side public.nav_v2_side,
  p_category text,
  p_title text,
  p_amount numeric default null,
  p_payer text default null,
  p_is_agreed boolean default false,
  p_required_before_deposit boolean default false,
  p_required_before_deal boolean default true,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if not public.nav_v2_can_edit_deal(p_deal_id, v_uid) then
    raise exception 'Нет прав менять расходы сделки' using errcode = '42501';
  end if;

  insert into public.nav_deal_expenses_v2 (
    deal_id,
    side,
    category,
    title,
    amount,
    payer,
    is_agreed,
    is_required_before_deposit,
    is_required_before_deal,
    comment
  ) values (
    p_deal_id,
    p_side,
    p_category,
    p_title,
    p_amount,
    p_payer,
    p_is_agreed,
    p_required_before_deposit,
    p_required_before_deal,
    p_comment
  );
end;
$$;

create or replace function public.nav_v2_add_risk(
  p_deal_id uuid,
  p_level public.nav_v2_risk_level,
  p_category text,
  p_title text,
  p_description text,
  p_recommendation text,
  p_blocks_deposit boolean default false,
  p_blocks_deal boolean default false,
  p_assigned_role public.nav_v2_user_role default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if not public.nav_v2_can_edit_deal(p_deal_id, v_uid) then
    raise exception 'Нет прав менять риски сделки' using errcode = '42501';
  end if;

  insert into public.nav_deal_risks_v2 (
    deal_id,
    level,
    category,
    title,
    description,
    recommendation,
    blocks_deposit,
    blocks_deal,
    assigned_role
  ) values (
    p_deal_id,
    p_level,
    p_category,
    p_title,
    p_description,
    p_recommendation,
    p_blocks_deposit,
    p_blocks_deal,
    p_assigned_role
  );
end;
$$;

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
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if not public.nav_v2_can_edit_deal(p_deal_id, v_uid) then
    raise exception 'Нет прав менять задачи сделки' using errcode = '42501';
  end if;

  insert into public.nav_deal_tasks_v2 (
    deal_id,
    title,
    description,
    assigned_role,
    priority,
    source,
    created_by
  ) values (
    p_deal_id,
    p_title,
    p_description,
    p_assigned_role,
    p_priority,
    p_source,
    v_uid
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
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deal_id uuid;
  v_title text;
  v_assigned_to uuid;
  v_assigned_role public.nav_v2_user_role;
  v_my_role public.nav_v2_user_role;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  select deal_id, title, assigned_to, assigned_role
  into v_deal_id, v_title, v_assigned_to, v_assigned_role
  from public.nav_deal_tasks_v2
  where id = p_task_id;

  if v_deal_id is null then
    raise exception 'Задача не найдена';
  end if;

  if not public.nav_v2_can_view_deal(v_deal_id, v_uid) then
    raise exception 'Нет доступа к задаче' using errcode = '42501';
  end if;

  v_my_role := public.nav_v2_my_role(v_uid);

  if not public.nav_v2_can_edit_deal(v_deal_id, v_uid)
     and v_assigned_to is distinct from v_uid
     and v_assigned_role is distinct from v_my_role then
    raise exception 'Нет прав менять статус этой задачи' using errcode = '42501';
  end if;

  update public.nav_deal_tasks_v2
  set status = p_status,
      completed_by = case when p_status = 'done' then v_uid else null end,
      completed_at = case when p_status = 'done' then now() else null end
  where id = p_task_id;

  insert into public.nav_deal_events_v2 (
    deal_id,
    actor_id,
    event_type,
    event_title,
    event_data
  ) values (
    v_deal_id,
    v_uid,
    'task_status_changed',
    'Статус задачи изменен',
    jsonb_build_object('task_id', p_task_id, 'title', v_title, 'status', p_status)
  );

  return jsonb_build_object('ok', true, 'task_id', p_task_id, 'status', p_status);
end;
$$;

create or replace function public.nav_v2_update_document_status(
  p_document_id uuid,
  p_status text
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
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if p_status not in ('needed', 'received', 'checked') then
    raise exception 'Недопустимый статус документа';
  end if;

  select deal_id, title
  into v_deal_id, v_title
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

  update public.nav_deal_documents_v2
  set status = p_status,
      checked_by = case when p_status in ('received', 'checked') then v_uid else checked_by end,
      checked_at = case when p_status in ('received', 'checked') then now() else checked_at end
  where id = p_document_id;

  insert into public.nav_deal_events_v2 (
    deal_id,
    actor_id,
    event_type,
    event_title,
    event_data
  ) values (
    v_deal_id,
    v_uid,
    'document_status_changed',
    'Статус документа изменен',
    jsonb_build_object('document_id', p_document_id, 'title', v_title, 'status', p_status)
  );

  return jsonb_build_object('ok', true, 'document_id', p_document_id, 'status', p_status);
end;
$$;

-- Закрываем прямые обходные пути через таблицы. Изменения должны идти через защищённые RPC.
drop policy if exists nav_v2_documents_write on public.nav_deal_documents_v2;
create policy nav_v2_documents_write
on public.nav_deal_documents_v2
for all
to authenticated
using (public.nav_v2_can_edit_deal(deal_id, auth.uid()))
with check (public.nav_v2_can_edit_deal(deal_id, auth.uid()));

drop policy if exists nav_v2_risks_write on public.nav_deal_risks_v2;
create policy nav_v2_risks_write
on public.nav_deal_risks_v2
for all
to authenticated
using (public.nav_v2_can_edit_deal(deal_id, auth.uid()))
with check (public.nav_v2_can_edit_deal(deal_id, auth.uid()));

drop policy if exists nav_v2_tasks_write on public.nav_deal_tasks_v2;
drop policy if exists nav_v2_events_insert on public.nav_deal_events_v2;

revoke insert, update, delete on public.nav_deal_tasks_v2 from authenticated, anon;
revoke insert on public.nav_deal_events_v2 from authenticated, anon;
