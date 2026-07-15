begin;

create or replace function public.nav_v2_link_user_by_email(
  p_email text,
  p_full_name text,
  p_role public.nav_v2_user_role default 'spn'::public.nav_v2_user_role,
  p_manager_id uuid default null::uuid,
  p_phone text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_target_id uuid;
  v_email text := lower(trim(p_email));
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if not nav_v2_private.nav_v2_is_owner_or_admin(v_uid) then
    raise exception 'Только owner/admin может добавлять пользователей' using errcode = '42501';
  end if;

  if p_role = 'viewer'::public.nav_v2_user_role then
    raise exception 'Роль «Наблюдатель» больше не назначается. Выберите рабочую роль сотрудника.' using errcode = '22023';
  end if;

  if v_email is null or v_email = '' then
    raise exception 'Email обязателен';
  end if;

  select id into v_target_id
  from auth.users
  where lower(email) = v_email
  limit 1;

  if v_target_id is null then
    raise exception 'Пользователь с таким email не найден в Supabase Auth. Сначала создайте его в Authentication -> Users.';
  end if;

  insert into public.nav_user_profiles (id, email, full_name, phone, role, manager_id, is_active)
  values (v_target_id, v_email, coalesce(nullif(trim(p_full_name), ''), v_email), p_phone, p_role, p_manager_id, true)
  on conflict (id) do update
  set email = excluded.email,
      full_name = excluded.full_name,
      phone = excluded.phone,
      role = excluded.role,
      manager_id = excluded.manager_id,
      is_active = true;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (null, v_uid, 'user_linked', 'Пользователь подключен к CRM Навигатор сделок', jsonb_build_object('email', v_email, 'role', p_role));

  return jsonb_build_object('ok', true, 'id', v_target_id, 'email', v_email, 'role', p_role);
end;
$function$;

comment on function public.nav_v2_link_user_by_email(text, text, public.nav_v2_user_role, uuid, text)
is 'Owner/admin profile linking. New viewer assignments are retired; enum remains for compatibility.';

create or replace function public.nav_v2_update_user_profile(
  p_user_id uuid,
  p_full_name text,
  p_role public.nav_v2_user_role,
  p_manager_id uuid default null::uuid,
  p_phone text default null::text,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_current_role public.nav_v2_user_role;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if not nav_v2_private.nav_v2_is_owner_or_admin(v_uid) then
    raise exception 'Только owner/admin может менять пользователей' using errcode = '42501';
  end if;

  select role
  into v_current_role
  from public.nav_user_profiles
  where id = p_user_id;

  if not found then
    raise exception 'Профиль пользователя не найден';
  end if;

  if p_role = 'viewer'::public.nav_v2_user_role
     and not (v_current_role = 'viewer'::public.nav_v2_user_role and p_is_active = false) then
    raise exception 'Роль «Наблюдатель» больше не назначается. Выберите рабочую роль сотрудника.' using errcode = '22023';
  end if;

  update public.nav_user_profiles
  set full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
      phone = p_phone,
      role = p_role,
      manager_id = p_manager_id,
      is_active = p_is_active
  where id = p_user_id;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (null, v_uid, 'user_profile_updated', 'Профиль пользователя обновлен', jsonb_build_object('user_id', p_user_id, 'role', p_role, 'is_active', p_is_active));

  return jsonb_build_object('ok', true, 'id', p_user_id);
end;
$function$;

comment on function public.nav_v2_update_user_profile(uuid, text, public.nav_v2_user_role, uuid, text, boolean)
is 'Owner/admin profile update. Viewer may only be retained for deactivation of a legacy viewer profile.';

commit;
