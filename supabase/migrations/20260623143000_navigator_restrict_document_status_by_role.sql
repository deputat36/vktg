create or replace function public.nav_v2_can_change_document_status(
  p_document_id uuid,
  p_status text default null,
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
  doc as (
    select d.id, d.deal_id, d.responsible_role, d.assigned_to, d.status
    from public.nav_deal_documents_v2 d
    where d.id = p_document_id
  ),
  caller_profile as (
    select public.nav_v2_my_role(p_uid) as role
  )
  select exists(
    select 1
    from doc d
    cross join caller c
    cross join caller_profile cp
    where p_uid is not null
      and (
        p_uid = c.uid
        or c.is_service_role
        or public.nav_v2_is_owner_or_admin(c.uid)
      )
      and public.nav_v2_can_view_deal(d.deal_id, p_uid)
      and (
        c.is_service_role
        or public.nav_v2_is_owner_or_admin(p_uid)
        or (cp.role = 'manager'::public.nav_v2_user_role and public.nav_v2_can_edit_deal(d.deal_id, p_uid))
        or d.assigned_to = p_uid
        or d.responsible_role = cp.role
        or (
          cp.role = 'spn'::public.nav_v2_user_role
          and public.nav_v2_can_edit_deal(d.deal_id, p_uid)
          and coalesce(p_status, d.status) in ('needed', 'missing', 'requested', 'received')
        )
        or (
          cp.role in ('lawyer'::public.nav_v2_user_role, 'broker'::public.nav_v2_user_role)
          and coalesce(p_status, d.status) in ('needed', 'missing', 'requested', 'received', 'checked', 'problem')
        )
      )
  );
$$;

revoke all on function public.nav_v2_can_change_document_status(uuid, text, uuid) from public, anon;
grant execute on function public.nav_v2_can_change_document_status(uuid, text, uuid) to authenticated, service_role;

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
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_deal_id uuid;
  v_title text;
  v_old_status text;
  v_new_status text;
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
  where id = p_document_id
  for update;

  if v_deal_id is null then
    raise exception 'Документ не найден' using errcode = 'P0002';
  end if;

  v_new_status := coalesce(p_status, v_old_status);

  if not public.nav_v2_can_change_document_status(p_document_id, v_new_status, v_uid) then
    raise exception 'Нет прав менять статус этого документа. Отметьте получение документа или передайте проверку ответственному специалисту.' using errcode = '42501';
  end if;

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
$$;

revoke all on function public.nav_v2_update_document_workflow(uuid, text, uuid, public.nav_v2_user_role, date, text) from public, anon;
grant execute on function public.nav_v2_update_document_workflow(uuid, text, uuid, public.nav_v2_user_role, date, text) to authenticated, service_role;

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
    'documents', coalesce((
      select jsonb_agg(
        to_jsonb(doc) || jsonb_build_object(
          'can_change_status', case
            when v_is_service_role then true
            else public.nav_v2_can_change_document_status(doc.id, doc.status, v_uid)
          end,
          'can_mark_received', case
            when v_is_service_role then true
            else public.nav_v2_can_change_document_status(doc.id, 'received', v_uid)
          end,
          'can_mark_checked', case
            when v_is_service_role then true
            else public.nav_v2_can_change_document_status(doc.id, 'checked', v_uid)
          end,
          'can_mark_problem', case
            when v_is_service_role then true
            else public.nav_v2_can_change_document_status(doc.id, 'problem', v_uid)
          end
        )
        order by doc.required_for_deposit desc, doc.category, doc.title
      )
      from public.nav_deal_documents_v2 doc
      where doc.deal_id = d.id
    ), '[]'::jsonb),
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
