create or replace function public.nav_v2_get_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
  v_role public.nav_v2_user_role;
  v_deals jsonb;
  v_tasks jsonb;
  v_summary jsonb;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  select jsonb_build_object('id', id, 'email', email, 'full_name', full_name, 'role', role), role
  into v_profile, v_role
  from public.nav_user_profiles
  where id = v_uid and is_active = true
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
        where p.deal_id = d.id
          and p.user_id = v_uid
      )
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
      count(*) filter (where level = 'red' and is_resolved = false) as red_risks_count
    from public.nav_deal_risks_v2
    where deal_id in (select id from visible_deals)
    group by deal_id
  ),
  doc_counts as (
    select deal_id, count(*) as missing_documents_count
    from public.nav_deal_documents_v2
    where is_required = true
      and status not in ('received','checked')
      and deal_id in (select id from visible_deals)
    group by deal_id
  ),
  enriched as (
    select d.*,
      coalesce(t.open_tasks_count, 0) as open_tasks_count,
      coalesce(r.red_risks_count, 0) as red_risks_count,
      coalesce(doc.missing_documents_count, 0) as missing_documents_count
    from visible_deals d
    left join task_counts t on t.deal_id = d.id
    left join risk_counts r on r.deal_id = d.id
    left join doc_counts doc on doc.deal_id = d.id
  )
  select jsonb_build_object(
    'total', count(*),
    'attention', count(*) filter (where risk_level = 'red' or has_children = true or expenses_agreed = false or settlements_agreed = false),
    'lawyer', count(*) filter (where lawyer_needed = true),
    'broker', count(*) filter (where broker_needed = true),
    'ready_for_deposit', count(*) filter (where readiness_deposit >= 80),
    'ready_for_deal', count(*) filter (where readiness_deal >= 80),
    'expenses_not_agreed', count(*) filter (where expenses_agreed = false),
    'settlements_not_agreed', count(*) filter (where settlements_agreed = false),
    'open_tasks', coalesce(sum(open_tasks_count), 0),
    'missing_documents', coalesce(sum(missing_documents_count), 0)
  ) into v_summary
  from enriched;

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
        where p.deal_id = d.id
          and p.user_id = v_uid
      )
    order by d.updated_at desc
    limit 40
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
      count(*) filter (where level = 'red' and is_resolved = false) as red_risks_count
    from public.nav_deal_risks_v2
    where deal_id in (select id from visible_deals)
    group by deal_id
  ),
  doc_counts as (
    select deal_id, count(*) as missing_documents_count
    from public.nav_deal_documents_v2
    where is_required = true
      and status not in ('received','checked')
      and deal_id in (select id from visible_deals)
    group by deal_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'title', d.title,
    'status', d.status,
    'risk_level', d.risk_level,
    'address', d.address,
    'object_type', d.object_type,
    'readiness_deposit', d.readiness_deposit,
    'readiness_deal', d.readiness_deal,
    'lawyer_needed', d.lawyer_needed,
    'broker_needed', d.broker_needed,
    'has_children', d.has_children,
    'has_mortgage', d.has_mortgage,
    'expenses_agreed', d.expenses_agreed,
    'settlements_agreed', d.settlements_agreed,
    'open_tasks_count', coalesce(t.open_tasks_count, 0),
    'red_risks_count', coalesce(r.red_risks_count, 0),
    'missing_documents_count', coalesce(doc.missing_documents_count, 0),
    'next_action', d.next_action,
    'updated_at', d.updated_at,
    'created_at', d.created_at
  ) order by d.updated_at desc), '[]'::jsonb)
  into v_deals
  from visible_deals d
  left join task_counts t on t.deal_id = d.id
  left join risk_counts r on r.deal_id = d.id
  left join doc_counts doc on doc.deal_id = d.id;

  with visible_tasks as (
    select t.id, t.deal_id, d.title as deal_title, t.title, t.description, t.assigned_role, t.priority, t.status, t.due_date, t.created_at
    from public.nav_deal_tasks_v2 t
    join public.nav_deals_v2 d on d.id = t.deal_id
    where t.status in ('open','in_progress')
      and (
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
          where p.deal_id = d.id
            and p.user_id = v_uid
        )
      )
    order by t.created_at desc
    limit 30
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'deal_id', t.deal_id,
    'deal_title', t.deal_title,
    'title', t.title,
    'description', t.description,
    'assigned_role', t.assigned_role,
    'priority', t.priority,
    'status', t.status,
    'due_date', t.due_date,
    'created_at', t.created_at
  ) order by t.created_at desc), '[]'::jsonb)
  into v_tasks
  from visible_tasks t;

  return jsonb_build_object(
    'profile', v_profile,
    'summary', coalesce(v_summary, '{}'::jsonb),
    'deals', coalesce(v_deals, '[]'::jsonb),
    'tasks', coalesce(v_tasks, '[]'::jsonb)
  );
end;
$function$;

create or replace function public.nav_v2_get_deals_list(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  select jsonb_build_object('id', id, 'email', email, 'full_name', full_name, 'role', role), role
  into v_profile, v_role
  from public.nav_user_profiles
  where id = v_uid and is_active = true
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
        where p.deal_id = d.id
          and p.user_id = v_uid
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
      and status not in ('received','checked')
      and deal_id in (select id from visible_deals)
    group by deal_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'title', d.title,
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
  left join public.nav_user_profiles bp on bp.id = d.buyer_spn_id
  left join public.nav_user_profiles sp on sp.id = d.seller_spn_id
  left join public.nav_user_profiles mp on mp.id = d.manager_id;

  return jsonb_build_object('profile', v_profile, 'items', v_items);
end;
$function$;

revoke all on function public.nav_v2_get_dashboard() from public;
revoke execute on function public.nav_v2_get_dashboard() from anon;
grant execute on function public.nav_v2_get_dashboard() to authenticated;
grant execute on function public.nav_v2_get_dashboard() to service_role;

revoke all on function public.nav_v2_get_deals_list(integer) from public;
revoke execute on function public.nav_v2_get_deals_list(integer) from anon;
grant execute on function public.nav_v2_get_deals_list(integer) to authenticated;
grant execute on function public.nav_v2_get_deals_list(integer) to service_role;
