-- Добавляет безопасную RPC-функцию возврата сделки СПН на доработку.
-- Функция уже применена в Supabase и синхронизируется с GitHub.

create or replace function public.nav_v2_return_spn_rework(
  p_deal_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_user_role;
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

  if not public.nav_v2_can_edit_deal(p_deal_id, v_uid) then
    raise exception 'Нет прав вернуть сделку на доработку' using errcode = '42501';
  end if;

  update public.nav_deals_v2
  set status = 'need_info'::public.nav_v2_deal_status
  where id = p_deal_id;

  if not found then
    raise exception 'Сделка не найдена' using errcode = 'P0002';
  end if;

  insert into public.nav_deal_comments_v2 (deal_id, author_id, body, visibility)
  values (p_deal_id, v_uid, nullif(trim(coalesce(p_body, '')), ''), 'team');

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    p_deal_id,
    v_uid,
    'returned_to_spn_rework',
    'Сделка возвращена СПН на доработку',
    jsonb_build_object('status', 'need_info', 'has_comment', nullif(trim(coalesce(p_body, '')), '') is not null)
  );

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'status', 'need_info');
end;
$$;

grant execute on function public.nav_v2_return_spn_rework(uuid, text) to authenticated;

comment on function public.nav_v2_return_spn_rework(uuid, text)
is 'Safely returns a Navigator v2 deal to SPN rework with a team comment. Allowed roles: owner, admin, manager, lawyer.';
