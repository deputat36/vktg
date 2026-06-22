create or replace function public.nav_v2_add_comment(p_deal_id uuid, p_body text, p_visibility text default 'team')
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_comment_id uuid;
  v_body text := trim(coalesce(p_body, ''));
  v_visibility text := lower(nullif(trim(coalesce(p_visibility, 'team')), ''));
  v_review_decision text;
  v_blocks_deposit boolean := false;
  v_blocks_deal boolean := false;
  v_review_id uuid;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if not public.nav_v2_can_view_deal(p_deal_id, v_uid) then
    raise exception 'Нет доступа к сделке' using errcode = '42501';
  end if;

  if nullif(v_body, '') is null then
    raise exception 'Комментарий не может быть пустым';
  end if;

  v_role := public.nav_v2_my_role(v_uid);

  if v_role is null then
    raise exception 'Профиль пользователя не найден или отключен' using errcode = '42501';
  end if;

  v_visibility := coalesce(v_visibility, 'team');
  if v_visibility not in ('team', 'private', 'public') then
    raise exception 'Недопустимая видимость комментария: %', v_visibility;
  end if;

  insert into public.nav_deal_comments_v2 (deal_id, author_id, author_role, visibility, body)
  values (p_deal_id, v_uid, v_role, v_visibility, v_body)
  returning id into v_comment_id;

  if v_role in ('lawyer', 'broker', 'manager', 'owner', 'admin') then
    if v_body ilike 'Юрист: первичная юридическая проверка выполнена.%' then
      v_review_decision := 'approved';
    elsif v_body ilike 'Юрист: для продолжения проверки нужны дополнительные документы.%' then
      v_review_decision := 'need_info';
      v_blocks_deal := true;
    elsif v_body ilike 'Юрист: выявлен юридический стоп-фактор.%' then
      v_review_decision := 'blocked';
      v_blocks_deposit := true;
      v_blocks_deal := true;
    elsif v_body ilike 'Юрист: карточка возвращена СПН на доработку.%' then
      v_review_decision := 'need_info';
      v_blocks_deal := true;
    end if;
  end if;

  if v_review_decision is not null then
    insert into public.nav_deal_reviews_v2 (
      deal_id, reviewer_id, reviewer_role, decision, body, blocks_deposit, blocks_deal
    ) values (
      p_deal_id, v_uid, v_role, v_review_decision, v_body, v_blocks_deposit, v_blocks_deal
    )
    returning id into v_review_id;
  end if;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    p_deal_id,
    v_uid,
    case when v_review_id is null then 'comment_added' else 'comment_added_with_review' end,
    case when v_review_id is null then 'Добавлен комментарий' else 'Добавлен комментарий и решение проверки' end,
    jsonb_build_object('comment_id', v_comment_id, 'visibility', v_visibility, 'review_id', v_review_id, 'review_decision', v_review_decision)
  );

  return jsonb_build_object('ok', true, 'comment_id', v_comment_id, 'visibility', v_visibility, 'review_id', v_review_id, 'review_decision', v_review_decision);
end;
$function$;

create or replace function public.nav_v2_get_deal_card(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_is_service_role boolean := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role';
  v_result jsonb;
begin
  if v_uid is null and not v_is_service_role then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if not v_is_service_role then
    select role
    into v_role
    from public.nav_user_profiles
    where id = v_uid
      and is_active = true
    limit 1;

    if v_role is null then
      raise exception 'Нет активного профиля CRM Навигатор сделок' using errcode = '42501';
    end if;

    if not public.nav_v2_can_view_deal(p_deal_id, v_uid) then
      raise exception 'Нет доступа к сделке' using errcode = '42501';
    end if;
  else
    v_role := 'owner'::public.nav_v2_user_role;
  end if;

  select jsonb_build_object(
    'deal', to_jsonb(d),
    'participants', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.nav_deal_participants_v2 p where p.deal_id = d.id), '[]'::jsonb),
    'risks', coalesce((select jsonb_agg(to_jsonb(r) order by r.level desc, r.created_at) from public.nav_deal_risks_v2 r where r.deal_id = d.id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(to_jsonb(doc) order by doc.required_for_deposit desc, doc.category, doc.title) from public.nav_deal_documents_v2 doc where doc.deal_id = d.id), '[]'::jsonb),
    'expenses', coalesce((select jsonb_agg(to_jsonb(e) order by e.side, e.category, e.title) from public.nav_deal_expenses_v2 e where e.deal_id = d.id), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) order by t.priority desc, t.created_at) from public.nav_deal_tasks_v2 t where t.deal_id = d.id), '[]'::jsonb),
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
$function$;

create or replace function public.nav_v2_update_task_status(p_task_id uuid, p_status public.nav_v2_task_status)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_deal_id uuid;
  v_title text;
  v_old_status public.nav_v2_task_status;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if p_status is null then
    raise exception 'Статус задачи обязателен';
  end if;

  if not public.nav_v2_can_change_task_status(p_task_id, v_uid) then
    raise exception 'Нет прав менять статус этой задачи' using errcode = '42501';
  end if;

  select deal_id, title, status
  into v_deal_id, v_title, v_old_status
  from public.nav_deal_tasks_v2
  where id = p_task_id
  for update;

  if v_deal_id is null then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;

  update public.nav_deal_tasks_v2
  set status = p_status,
      completed_by = case when p_status = 'done' then v_uid else null end,
      completed_at = case when p_status = 'done' then now() else null end,
      updated_at = now()
  where id = p_task_id;

  if v_old_status is distinct from p_status then
    insert into public.nav_deal_events_v2(deal_id, actor_id, event_type, event_title, event_data)
    values(
      v_deal_id,
      v_uid,
      'task_status_changed',
      'Статус задачи изменен',
      jsonb_build_object('task_id', p_task_id, 'title', v_title, 'old_status', v_old_status, 'status', p_status)
    );
  end if;

  return jsonb_build_object('ok', true, 'task_id', p_task_id, 'old_status', v_old_status, 'status', p_status);
end;
$function$;

revoke all on function public.nav_v2_add_comment(uuid, text, text) from public;
revoke execute on function public.nav_v2_add_comment(uuid, text, text) from anon;
grant execute on function public.nav_v2_add_comment(uuid, text, text) to authenticated;
grant execute on function public.nav_v2_add_comment(uuid, text, text) to service_role;

revoke all on function public.nav_v2_get_deal_card(uuid) from public;
revoke execute on function public.nav_v2_get_deal_card(uuid) from anon;
grant execute on function public.nav_v2_get_deal_card(uuid) to authenticated;
grant execute on function public.nav_v2_get_deal_card(uuid) to service_role;

revoke all on function public.nav_v2_update_task_status(uuid, public.nav_v2_task_status) from public;
revoke execute on function public.nav_v2_update_task_status(uuid, public.nav_v2_task_status) from anon;
grant execute on function public.nav_v2_update_task_status(uuid, public.nav_v2_task_status) to authenticated;
grant execute on function public.nav_v2_update_task_status(uuid, public.nav_v2_task_status) to service_role;
