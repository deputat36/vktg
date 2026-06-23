create or replace function public.nav_v2_can_change_deal_status(
  p_deal_id uuid,
  p_status public.nav_v2_deal_status,
  p_uid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  with caller as (
    select auth.uid() as uid,
           coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role' as is_service_role
  ),
  caller_profile as (
    select public.nav_v2_my_role(p_uid) as role
  )
  select exists(
    select 1
    from caller c
    cross join caller_profile cp
    where p_uid is not null
      and p_status is not null
      and (
        p_uid = c.uid
        or c.is_service_role
        or public.nav_v2_is_owner_or_admin(c.uid)
      )
      and public.nav_v2_can_view_deal(p_deal_id, p_uid)
      and (
        c.is_service_role
        or public.nav_v2_is_owner_or_admin(p_uid)
        or (cp.role = 'manager'::public.nav_v2_user_role and public.nav_v2_can_edit_deal(p_deal_id, p_uid))
        or (
          public.nav_v2_can_edit_deal(p_deal_id, p_uid)
          and cp.role in ('spn'::public.nav_v2_user_role, 'lawyer'::public.nav_v2_user_role, 'broker'::public.nav_v2_user_role)
          and p_status in (
            'draft'::public.nav_v2_deal_status,
            'need_info'::public.nav_v2_deal_status,
            'need_lawyer'::public.nav_v2_deal_status,
            'need_broker'::public.nav_v2_deal_status,
            'need_documents'::public.nav_v2_deal_status,
            'ready_for_deposit'::public.nav_v2_deal_status,
            'preparing_deal'::public.nav_v2_deal_status,
            'ready_for_deal'::public.nav_v2_deal_status
          )
        )
      )
  );
$$;

revoke all on function public.nav_v2_can_change_deal_status(uuid, public.nav_v2_deal_status, uuid) from public, anon, authenticated;
grant execute on function public.nav_v2_can_change_deal_status(uuid, public.nav_v2_deal_status, uuid) to service_role;

create or replace function public.nav_v2_get_deal_status_options(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_is_service_role boolean := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role';
  v_statuses public.nav_v2_deal_status[] := array[
    'draft'::public.nav_v2_deal_status,
    'need_info'::public.nav_v2_deal_status,
    'need_lawyer'::public.nav_v2_deal_status,
    'need_broker'::public.nav_v2_deal_status,
    'need_documents'::public.nav_v2_deal_status,
    'ready_for_deposit'::public.nav_v2_deal_status,
    'deposit_done'::public.nav_v2_deal_status,
    'preparing_deal'::public.nav_v2_deal_status,
    'ready_for_deal'::public.nav_v2_deal_status,
    'registration'::public.nav_v2_deal_status,
    'registered'::public.nav_v2_deal_status,
    'closed'::public.nav_v2_deal_status,
    'cancelled'::public.nav_v2_deal_status
  ];
  v_labels jsonb := jsonb_build_object(
    'draft','Черновик',
    'need_info','Нужно дозаполнить',
    'need_lawyer','Юрист',
    'need_broker','Брокер',
    'need_documents','Нужны документы',
    'ready_for_deposit','Готова к задатку',
    'deposit_done','Задаток внесен',
    'preparing_deal','Подготовка к сделке',
    'ready_for_deal','Готова к сделке',
    'registration','На регистрации',
    'registered','Зарегистрирована',
    'closed','Закрыта',
    'cancelled','Отменена'
  );
begin
  if v_uid is null and not v_is_service_role then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if not v_is_service_role and not public.nav_v2_can_view_deal(p_deal_id, v_uid) then
    raise exception 'Нет доступа к сделке' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'deal_id', p_deal_id,
    'statuses', (
      select jsonb_agg(
        jsonb_build_object(
          'id', status_value::text,
          'title', v_labels ->> status_value::text,
          'allowed', case
            when v_is_service_role then true
            else public.nav_v2_can_change_deal_status(p_deal_id, status_value, v_uid)
          end
        )
        order by ord
      )
      from unnest(v_statuses) with ordinality as s(status_value, ord)
    )
  );
end;
$$;

revoke all on function public.nav_v2_get_deal_status_options(uuid) from public, anon;
grant execute on function public.nav_v2_get_deal_status_options(uuid) to authenticated, service_role;

create or replace function public.nav_v2_update_deal_status(p_deal_id uuid, p_status public.nav_v2_deal_status)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_old_status public.nav_v2_deal_status;
  v_problem_documents int := 0;
  v_overdue_documents int := 0;
  v_unresolved_required int := 0;
  v_blocking_reviews int := 0;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if p_status is null then
    raise exception 'Статус сделки обязателен';
  end if;

  if not public.nav_v2_can_edit_deal(p_deal_id, v_uid) then
    raise exception 'Нет прав менять статус сделки' using errcode = '42501';
  end if;

  if not public.nav_v2_can_change_deal_status(p_deal_id, p_status, v_uid) then
    raise exception 'Этот статус доступен только руководителю или ответственному управленцу сделки' using errcode = '42501';
  end if;

  select status
  into v_old_status
  from public.nav_deals_v2
  where id = p_deal_id
  for update;

  if v_old_status is null then
    raise exception 'Сделка не найдена' using errcode = 'P0002';
  end if;

  if p_status::text in ('ready_for_deposit','deposit_done','preparing_deal','ready_for_deal','registration','registered','closed') then
    select
      count(*) filter (where status = 'problem'),
      count(*) filter (where status = 'requested' and requested_at < now() - interval '3 days'),
      count(*) filter (
        where is_required
          and status not in ('received','checked')
          and (
            (p_status::text in ('ready_for_deposit','deposit_done') and required_for_deposit)
            or (p_status::text in ('preparing_deal','ready_for_deal','registration','registered','closed') and required_for_deal)
          )
      )
    into v_problem_documents, v_overdue_documents, v_unresolved_required
    from public.nav_deal_documents_v2
    where deal_id = p_deal_id;

    if p_status::text in ('ready_for_deposit','deposit_done') then
      select count(*)
      into v_blocking_reviews
      from public.nav_deal_reviews_v2
      where deal_id = p_deal_id
        and (decision = 'blocked' or blocks_deposit = true);
    else
      select count(*)
      into v_blocking_reviews
      from public.nav_deal_reviews_v2
      where deal_id = p_deal_id
        and (decision = 'blocked' or blocks_deal = true);
    end if;

    if coalesce(v_problem_documents, 0) > 0 then
      raise exception 'Нельзя поставить положительный статус: есть проблемные документы (%)', v_problem_documents using errcode = '23514';
    end if;

    if coalesce(v_overdue_documents, 0) > 0 then
      raise exception 'Нельзя поставить положительный статус: есть просроченные запрошенные документы (%)', v_overdue_documents using errcode = '23514';
    end if;

    if coalesce(v_unresolved_required, 0) > 0 then
      raise exception 'Нельзя поставить положительный статус: обязательные документы не закрыты (%)', v_unresolved_required using errcode = '23514';
    end if;

    if coalesce(v_blocking_reviews, 0) > 0 then
      raise exception 'Нельзя поставить положительный статус: есть блокирующие решения проверки (%)', v_blocking_reviews using errcode = '23514';
    end if;
  end if;

  update public.nav_deals_v2
  set status = p_status,
      updated_at = now()
  where id = p_deal_id;

  if v_old_status is distinct from p_status then
    insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
    values (
      p_deal_id,
      v_uid,
      'status_changed',
      'Статус сделки изменен',
      jsonb_build_object('old_status', v_old_status, 'status', p_status)
    );
  end if;

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'old_status', v_old_status, 'status', p_status);
end;
$$;

revoke all on function public.nav_v2_update_deal_status(uuid, public.nav_v2_deal_status) from public, anon;
grant execute on function public.nav_v2_update_deal_status(uuid, public.nav_v2_deal_status) to authenticated, service_role;
