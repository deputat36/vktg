create or replace function public.nav_v2_get_deal_card(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_profile jsonb := null;
  v_is_service_role boolean := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role';
  v_result jsonb;
begin
  if v_uid is null and not v_is_service_role then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if not v_is_service_role then
    select p.role,
      jsonb_build_object(
        'id', p.id,
        'email', p.email,
        'full_name', p.full_name,
        'role', p.role,
        'phone', p.phone,
        'manager_id', p.manager_id,
        'manager_name', manager_profile.full_name
      )
    into v_role, v_profile
    from public.nav_user_profiles p
    left join public.nav_user_profiles manager_profile on manager_profile.id = p.manager_id
    where p.id = v_uid
      and p.is_active = true
    limit 1;

    if v_role is null then
      raise exception 'Нет активного профиля CRM Навигатор сделок' using errcode = '42501';
    end if;

    if not public.nav_v2_can_view_deal(p_deal_id, v_uid) then
      raise exception 'Нет доступа к сделке' using errcode = '42501';
    end if;
  else
    v_role := 'owner'::public.nav_v2_user_role;
    v_profile := jsonb_build_object('role', v_role, 'full_name', 'service_role');
  end if;

  select jsonb_build_object(
    'profile', v_profile,
    'deal', to_jsonb(d) || jsonb_build_object(
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
      end
    ),
    'participants', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.nav_deal_participants_v2 p where p.deal_id = d.id), '[]'::jsonb),
    'risks', coalesce((select jsonb_agg(to_jsonb(r) order by r.level desc, r.created_at) from public.nav_deal_risks_v2 r where r.deal_id = d.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(doc) order by doc.required_for_deposit desc, doc.category, doc.title) from public.nav_deal_documents_v2 doc where doc.deal_id = d.id), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(to_jsonb(e) order by e.side, e.category, e.title) from public.nav_deal_expenses_v2 e where e.deal_id = d.id), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(
        to_jsonb(t) || jsonb_build_object(
          'can_change_status', case
            when v_is_service_role then true
            else public.nav_v2_can_change_task_status(t.id)
          end
        )
        order by t.priority desc, t.created_at
      )
      from public.nav_deal_tasks_v2 t
      where t.deal_id = d.id
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at desc)
      from (
        select c.*
        from public.nav_deal_comments_v2 c
        where c.deal_id = d.id
          and (
            v_is_service_role
            or v_role in ('owner', 'admin')
            or coalesce(c.visibility, 'team') <> 'private'
            or c.author_id = v_uid
          )
        order by c.created_at desc
        limit 50
      ) c
    ), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(to_jsonb(rv) order by rv.created_at desc) from public.nav_deal_reviews_v2 rv where rv.deal_id = d.id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(to_jsonb(ev) order by ev.created_at desc)
      from (
        select ev.*
        from public.nav_deal_events_v2 ev
        where ev.deal_id = d.id
        order by ev.created_at desc
        limit 50
      ) ev
    ), '[]'::jsonb)
  ) into v_result
  from public.nav_deals_v2 d
  where d.id = p_deal_id;

  if v_result is null then
    raise exception 'Сделка не найдена' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

revoke all on function public.nav_v2_get_deal_card(uuid) from public, anon;
grant execute on function public.nav_v2_get_deal_card(uuid) to authenticated, service_role;
