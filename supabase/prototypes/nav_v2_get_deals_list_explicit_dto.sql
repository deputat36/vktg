-- REPOSITORY-ONLY PROTOTYPE.
-- Do not apply to production without authenticated role regression or an explicit owner decision.
-- Public signature, current role visibility and EXECUTE grants are intentionally unchanged.

create or replace function nav_v2_private.nav_v2_list_object_label(p_object_type text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case coalesce(nullif(trim(p_object_type), ''), '')
    when 'flat_mkd' then 'Квартира в МКД'
    when 'flat_ground' then 'Квартира на земле'
    when 'room' then 'Комната'
    when 'share' then 'Доля'
    when 'share_room' then 'Доля / комната'
    when 'house_land' then 'Дом с участком'
    when 'house' then 'Дом'
    when 'land' then 'Земельный участок'
    when 'new_building' then 'Новостройка'
    when 'commercial' then 'Коммерческий объект'
    else 'Объект'
  end;
$$;

create or replace function nav_v2_private.nav_v2_list_mask_address(p_address text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(trim(both ' ,;.-' from regexp_replace(
    coalesce(p_address, ''),
    '(,\s*|\s+)(кв(артира)?|оф(ис)?|пом(ещение)?|комн(ата)?|апарт(аменты)?)\.?\s*(№|#)?\s*[^,;]+.*$',
    '',
    'i'
  )), '');
$$;

create or replace function nav_v2_private.nav_v2_list_reference(
  p_deal_id uuid,
  p_object_type text,
  p_address text,
  p_is_demo boolean default false
)
returns text
language sql
immutable
set search_path = pg_catalog, nav_v2_private
as $$
  select concat(
    case when coalesce(p_is_demo, false) then 'ДЕМО: ' else '' end,
    nav_v2_private.nav_v2_list_object_label(p_object_type),
    ' — ',
    coalesce(nav_v2_private.nav_v2_list_mask_address(p_address), 'ориентир уточняется'),
    ' · ',
    upper(left(coalesce(p_deal_id::text, 'БЕЗ-КОДА'), 8))
  );
$$;

create or replace function nav_v2_private.nav_v2_list_next_action_label(
  p_status text,
  p_red_risks integer,
  p_overdue_tasks integer,
  p_missing_documents integer,
  p_lawyer_needed boolean,
  p_lawyer_name text,
  p_broker_needed boolean,
  p_broker_name text,
  p_expenses_agreed boolean,
  p_settlements_agreed boolean,
  p_readiness_deposit integer,
  p_has_recorded_action boolean
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when coalesce(p_status, '') = 'need_info'
      then 'Исправить карточку и повторно передать на проверку'
    when coalesce(p_red_risks, 0) > 0
      then 'Разобрать критические риски в карточке'
    when coalesce(p_overdue_tasks, 0) > 0
      then 'Закрыть просроченные задачи'
    when coalesce(p_missing_documents, 0) > 0
      then 'Собрать обязательные документы'
    when coalesce(p_lawyer_needed, false) and nullif(trim(p_lawyer_name), '') is null
      then 'Назначить юриста и передать материалы'
    when coalesce(p_broker_needed, false) and nullif(trim(p_broker_name), '') is null
      then 'Назначить ипотечного брокера для консультации и одобрения'
    when not coalesce(p_settlements_agreed, false)
      then 'Согласовать порядок расчётов'
    when not coalesce(p_expenses_agreed, false)
      then 'Согласовать расходы сторон'
    when coalesce(p_readiness_deposit, 0) >= 80
      then 'Проверить готовность к задатку'
    when coalesce(p_has_recorded_action, false)
      then 'Открыть карточку и выполнить зафиксированный следующий шаг'
    else 'Открыть карточку и определить ближайшее действие'
  end;
$$;

create or replace function public.nav_v2_get_deals_list(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private
as $$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
  v_role public.nav_v2_user_role;
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'full_name', p.full_name,
    'role', p.role,
    'phone', p.phone,
    'manager_id', p.manager_id,
    'manager_name', manager_profile.full_name
  ), p.role
  into v_profile, v_role
  from public.nav_user_profiles p
  left join public.nav_user_profiles manager_profile on manager_profile.id = p.manager_id
  where p.id = v_uid and p.is_active is true
  limit 1;

  if v_role is null then
    raise exception 'Нет активного профиля CRM Навигатор сделок' using errcode = '42501';
  end if;

  with visible_deals as (
    select
      d.id,
      d.created_by,
      d.manager_id,
      d.seller_spn_id,
      d.buyer_spn_id,
      d.lawyer_id,
      d.broker_id,
      d.status,
      d.risk_level,
      d.preparation_mode,
      d.object_type,
      d.address,
      d.price_total,
      d.readiness_deposit,
      d.readiness_deal,
      d.lawyer_needed,
      d.broker_needed,
      d.has_children,
      d.has_mortgage,
      d.expenses_agreed,
      d.settlements_agreed,
      d.next_action,
      d.created_at,
      d.updated_at,
      coalesce(
        (d.deal_summary ->> 'demo') = 'true',
        (d.wizard_snapshot ->> 'demo') = 'true',
        d.title like 'ДЕМО:%',
        false
      ) as is_demo
    from public.nav_deals_v2 d
    where
      v_role in ('admin', 'owner')
      or d.created_by = v_uid
      or d.seller_spn_id = v_uid
      or d.buyer_spn_id = v_uid
      or d.manager_id = v_uid
      or d.lawyer_id = v_uid
      or d.broker_id = v_uid
      or (v_role = 'lawyer' and d.lawyer_needed is true)
      or (v_role = 'broker' and d.broker_needed is true)
      or exists (
        select 1
        from public.nav_deal_participants_v2 participant
        where participant.deal_id = d.id
          and participant.user_id = v_uid
      )
    order by d.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ),
  task_counts as (
    select
      deal_id,
      count(*)::integer as open_tasks_count,
      count(*) filter (where due_date < current_date)::integer as overdue_tasks_count,
      min(due_date) as next_task_due_date
    from public.nav_deal_tasks_v2
    where status in ('open', 'in_progress')
      and deal_id in (select id from visible_deals)
    group by deal_id
  ),
  risk_counts as (
    select
      deal_id,
      count(*) filter (where level = 'red' and is_resolved is false)::integer as red_risks_count,
      count(*) filter (where level = 'yellow' and is_resolved is false)::integer as yellow_risks_count
    from public.nav_deal_risks_v2
    where deal_id in (select id from visible_deals)
    group by deal_id
  ),
  document_counts as (
    select
      deal_id,
      count(*)::integer as missing_documents_count
    from public.nav_deal_documents_v2
    where is_required is true
      and status not in ('received', 'checked')
      and deal_id in (select id from visible_deals)
    group by deal_id
  ),
  task_activity as (
    select deal_id, max(updated_at) as activity_at
    from public.nav_deal_tasks_v2
    where deal_id in (select id from visible_deals)
    group by deal_id
  ),
  document_activity as (
    select deal_id, max(updated_at) as activity_at
    from public.nav_deal_documents_v2
    where deal_id in (select id from visible_deals)
    group by deal_id
  ),
  comment_activity as (
    select deal_id, max(created_at) as activity_at
    from public.nav_deal_comments_v2
    where deal_id in (select id from visible_deals)
    group by deal_id
  ),
  event_activity as (
    select deal_id, max(created_at) as activity_at
    from public.nav_deal_events_v2
    where deal_id in (select id from visible_deals)
    group by deal_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'card_url', format('./deal-card-v2.html?id=%s', d.id),
    'title', nav_v2_private.nav_v2_list_reference(d.id, d.object_type, d.address, d.is_demo),
    'display_title', nav_v2_private.nav_v2_list_reference(d.id, d.object_type, d.address, d.is_demo),
    'status', d.status,
    'risk_level', d.risk_level,
    'preparation_mode', d.preparation_mode,
    'object_type', d.object_type,
    'address', nav_v2_private.nav_v2_list_mask_address(d.address),
    'price_total', d.price_total,
    'readiness_deposit', d.readiness_deposit,
    'readiness_deal', d.readiness_deal,
    'lawyer_needed', d.lawyer_needed,
    'broker_needed', d.broker_needed,
    'has_children', d.has_children,
    'has_mortgage', d.has_mortgage,
    'expenses_agreed', d.expenses_agreed,
    'settlements_agreed', d.settlements_agreed,
    'is_demo', d.is_demo,
    'created_by_current_user', d.created_by = v_uid,
    'has_recorded_next_action', nullif(trim(d.next_action), '') is not null,
    'next_action', nav_v2_private.nav_v2_list_next_action_label(
      d.status::text,
      coalesce(r.red_risks_count, 0),
      coalesce(t.overdue_tasks_count, 0),
      coalesce(doc.missing_documents_count, 0),
      d.lawyer_needed,
      lawyer_profile.full_name,
      d.broker_needed,
      broker_profile.full_name,
      d.expenses_agreed,
      d.settlements_agreed,
      d.readiness_deposit,
      nullif(trim(d.next_action), '') is not null
    ),
    'created_at', d.created_at,
    'updated_at', d.updated_at,
    'last_activity_at', greatest(
      d.updated_at,
      coalesce(task_activity.activity_at, '-infinity'::timestamptz),
      coalesce(document_activity.activity_at, '-infinity'::timestamptz),
      coalesce(comment_activity.activity_at, '-infinity'::timestamptz),
      coalesce(event_activity.activity_at, '-infinity'::timestamptz)
    ),
    'open_tasks_count', coalesce(t.open_tasks_count, 0),
    'overdue_tasks_count', coalesce(t.overdue_tasks_count, 0),
    'next_task_due_date', t.next_task_due_date,
    'red_risks_count', coalesce(r.red_risks_count, 0),
    'yellow_risks_count', coalesce(r.yellow_risks_count, 0),
    'missing_documents_count', coalesce(doc.missing_documents_count, 0),
    'buyer_spn', buyer_spn_profile.full_name,
    'seller_spn', seller_spn_profile.full_name,
    'manager', manager_profile.full_name,
    'lawyer', lawyer_profile.full_name,
    'broker', broker_profile.full_name
  ) order by d.updated_at desc), '[]'::jsonb)
  into v_items
  from visible_deals d
  left join task_counts t on t.deal_id = d.id
  left join risk_counts r on r.deal_id = d.id
  left join document_counts doc on doc.deal_id = d.id
  left join task_activity on task_activity.deal_id = d.id
  left join document_activity on document_activity.deal_id = d.id
  left join comment_activity on comment_activity.deal_id = d.id
  left join event_activity on event_activity.deal_id = d.id
  left join public.nav_user_profiles buyer_spn_profile on buyer_spn_profile.id = d.buyer_spn_id
  left join public.nav_user_profiles seller_spn_profile on seller_spn_profile.id = d.seller_spn_id
  left join public.nav_user_profiles manager_profile on manager_profile.id = d.manager_id
  left join public.nav_user_profiles lawyer_profile on lawyer_profile.id = d.lawyer_id
  left join public.nav_user_profiles broker_profile on broker_profile.id = d.broker_id;

  return jsonb_build_object(
    'profile', v_profile,
    'items', v_items,
    'dto_version', 1
  );
end;
$$;

-- Existing EXECUTE grants, ownership, public signature and production function are intentionally not changed by this prototype file.
