create or replace function public.nav_v2_get_deals_list(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  where p.id = v_uid and p.is_active = true
  limit 1;

  if v_role is null then
    raise exception 'Нет активного профиля CRM Навигатор сделок' using errcode = '42501';
  end if;

  with visible_deals as (
    select d.*
    from public.nav_deals_v2 d
    where
      v_role in ('admin', 'owner')
      or d.created_by = v_uid
      or d.seller_spn_id = v_uid
      or d.buyer_spn_id = v_uid
      or d.manager_id = v_uid
      or d.lawyer_id = v_uid
      or d.broker_id = v_uid
      or (v_role = 'lawyer' and d.lawyer_needed = true)
      or (v_role = 'broker' and d.broker_needed = true)
      or exists (
        select 1
        from public.nav_deal_participants_v2 p
        where p.deal_id = d.id and p.user_id = v_uid
      )
    order by d.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ),
  task_counts as (
    select deal_id, count(*) as open_tasks_count
    from public.nav_deal_tasks_v2
    where status in ('open', 'in_progress')
      and deal_id in (select id from visible_deals)
    group by deal_id
  ),
  risk_counts as (
    select deal_id,
      count(*) filter (where level = 'red' and is_resolved = false) as red_risks_count,
      count(*) filter (where level = 'yellow' and is_resolved = false) as yellow_risks_count
    from public.nav_deal_risks_v2
    where deal_id in (select id from visible_deals)
    group by deal_id
  ),
  doc_counts as (
    select deal_id, count(*) as missing_documents_count
    from public.nav_deal_documents_v2
    where is_required = true
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
  doc_activity as (
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
    'title', d.title,
    'display_title', case
      when d.title is null
        or d.title ilike '%Продавец не указан%'
        or d.title ilike '%Покупатель не указан%'
        or d.title ilike '%адрес не указан%'
      then concat_ws(' — ',
        case d.object_type
          when 'flat_mkd' then 'Квартира в МКД'
          when 'flat_ground' then 'Квартира на земле'
          when 'room' then 'Комната'
          when 'share' then 'Доля'
          when 'share_room' then 'Доля / комната'
          when 'house_land' then 'Дом с участком'
          when 'house' then 'Дом'
          when 'land' then 'Земельный участок'
          when 'new_building' then 'Новостройка'
          when 'commercial' then 'Коммерция'
          else 'Объект'
        end,
        coalesce(nullif(trim(d.address), ''), 'адрес уточняется')
      )
      else d.title
    end,
    'status', d.status,
    'risk_level', d.risk_level,
    'object_type', d.object_type,
    'address', d.address,
    'seller_name', d.seller_name,
    'buyer_name', d.buyer_name,
    'seller_phone', d.seller_phone,
    'buyer_phone', d.buyer_phone,
    'price_total', d.price_total,
    'readiness_deposit', d.readiness_deposit,
    'readiness_deal', d.readiness_deal,
    'lawyer_needed', d.lawyer_needed,
    'broker_needed', d.broker_needed,
    'has_children', d.has_children,
    'has_mortgage', d.has_mortgage,
    'expenses_agreed', d.expenses_agreed,
    'settlements_agreed', d.settlements_agreed,
    'next_action', d.next_action,
    'created_at', d.created_at,
    'updated_at', d.updated_at,
    'last_activity_at', greatest(
      d.updated_at,
      coalesce(ta.activity_at, '-infinity'::timestamptz),
      coalesce(da.activity_at, '-infinity'::timestamptz),
      coalesce(ca.activity_at, '-infinity'::timestamptz),
      coalesce(ea.activity_at, '-infinity'::timestamptz)
    ),
    'open_tasks_count', coalesce(t.open_tasks_count, 0),
    'red_risks_count', coalesce(r.red_risks_count, 0),
    'yellow_risks_count', coalesce(r.yellow_risks_count, 0),
    'missing_documents_count', coalesce(doc.missing_documents_count, 0),
    'buyer_spn', bp.full_name,
    'seller_spn', sp.full_name,
    'manager', mp.full_name
  ) order by d.updated_at desc), '[]'::jsonb)
  into v_items
  from visible_deals d
  left join task_counts t on t.deal_id = d.id
  left join risk_counts r on r.deal_id = d.id
  left join doc_counts doc on doc.deal_id = d.id
  left join task_activity ta on ta.deal_id = d.id
  left join doc_activity da on da.deal_id = d.id
  left join comment_activity ca on ca.deal_id = d.id
  left join event_activity ea on ea.deal_id = d.id
  left join public.nav_user_profiles bp on bp.id = d.buyer_spn_id
  left join public.nav_user_profiles sp on sp.id = d.seller_spn_id
  left join public.nav_user_profiles mp on mp.id = d.manager_id;

  return jsonb_build_object('profile', v_profile, 'items', v_items);
end;
$function$;
