create or replace function public.nav_v2_return_spn_rework(p_deal_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_body text := nullif(trim(coalesce(p_body, '')), '');
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  select role
  into v_role
  from public.nav_user_profiles
  where id = v_uid
    and is_active = true;

  if v_role is null then
    raise exception 'Профиль пользователя не найден или отключен' using errcode = '42501';
  end if;

  if v_role not in ('owner', 'admin', 'manager', 'lawyer') then
    raise exception 'Возврат СПН на доработку доступен только юристу, менеджеру, админу или владельцу' using errcode = '42501';
  end if;

  if v_body is null then
    raise exception 'Укажите причину возврата СПН на доработку';
  end if;

  if not public.nav_v2_can_edit_deal(p_deal_id, v_uid)
     and not (v_role = 'lawyer' and public.nav_v2_can_view_deal(p_deal_id, v_uid)) then
    raise exception 'Нет прав вернуть сделку на доработку' using errcode = '42501';
  end if;

  update public.nav_deals_v2
  set status = 'need_info'::public.nav_v2_deal_status
  where id = p_deal_id;

  if not found then
    raise exception 'Сделка не найдена' using errcode = 'P0002';
  end if;

  insert into public.nav_deal_comments_v2 (deal_id, author_id, author_role, body, visibility)
  values (p_deal_id, v_uid, v_role, v_body, 'team');

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    p_deal_id,
    v_uid,
    'returned_to_spn_rework',
    'Сделка возвращена СПН на доработку',
    jsonb_build_object('status', 'need_info', 'has_comment', true)
  );

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'status', 'need_info');
end;
$function$;

create or replace function public.nav_v2_submit_spn_rework(p_deal_id uuid, p_body text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_body text := nullif(trim(coalesce(p_body, '')), '');
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  select role
  into v_role
  from public.nav_user_profiles
  where id = v_uid
    and is_active = true;

  if v_role is null then
    raise exception 'Профиль пользователя не найден или отключен' using errcode = '42501';
  end if;

  if v_role not in ('owner', 'admin', 'manager', 'spn') then
    raise exception 'Отправить доработку на повторную проверку может СПН, менеджер, админ или владелец' using errcode = '42501';
  end if;

  if not public.nav_v2_can_edit_deal(p_deal_id, v_uid) then
    raise exception 'Нет прав отправить сделку на повторную проверку' using errcode = '42501';
  end if;

  update public.nav_deals_v2
  set status = 'need_lawyer'::public.nav_v2_deal_status
  where id = p_deal_id
    and status = 'need_info'::public.nav_v2_deal_status;

  if not found then
    raise exception 'Сделка не найдена или сейчас не находится в статусе «Нужно дозаполнить»' using errcode = 'P0002';
  end if;

  insert into public.nav_deal_comments_v2 (deal_id, author_id, author_role, body, visibility)
  values (
    p_deal_id,
    v_uid,
    v_role,
    coalesce(v_body, 'Заявка доработана. Прошу повторно проверить.'),
    'team'
  );

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    p_deal_id,
    v_uid,
    'spn_rework_submitted',
    'СПН отправил доработку на повторную проверку',
    jsonb_build_object('status', 'need_lawyer', 'has_comment', v_body is not null)
  );

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'status', 'need_lawyer');
end;
$function$;

revoke all on function public.nav_v2_return_spn_rework(uuid, text) from public;
revoke execute on function public.nav_v2_return_spn_rework(uuid, text) from anon;
grant execute on function public.nav_v2_return_spn_rework(uuid, text) to authenticated;
grant execute on function public.nav_v2_return_spn_rework(uuid, text) to service_role;

revoke all on function public.nav_v2_submit_spn_rework(uuid, text) from public;
revoke execute on function public.nav_v2_submit_spn_rework(uuid, text) from anon;
grant execute on function public.nav_v2_submit_spn_rework(uuid, text) to authenticated;
grant execute on function public.nav_v2_submit_spn_rework(uuid, text) to service_role;
