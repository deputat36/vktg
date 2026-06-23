create or replace function public.nav_guard_legacy_profile_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_service boolean := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role';
  v_is_admin boolean := false;
begin
  if v_is_service then
    return new;
  end if;

  select exists (
    select 1
    from public.nav_profiles p
    where p.id = v_uid
      and p.is_active = true
      and p.role = 'admin'::public.nav_user_role
  ) into v_is_admin;

  if v_is_admin then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.id is distinct from v_uid then
      raise exception 'Нельзя создать профиль другого пользователя' using errcode = '42501';
    end if;

    if new.role is distinct from 'spn'::public.nav_user_role
       or coalesce(new.is_active, true) is distinct from true
       or new.manager_id is not null
       or new.email is not null then
      raise exception 'Роль, активность, менеджер и email назначаются только администратором' using errcode = '42501';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.id is distinct from new.id then
      raise exception 'Нельзя менять id профиля' using errcode = '42501';
    end if;

    if new.id is distinct from v_uid then
      raise exception 'Нельзя менять профиль другого пользователя' using errcode = '42501';
    end if;

    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.manager_id is distinct from old.manager_id
       or new.email is distinct from old.email then
      raise exception 'Роль, активность, менеджер и email изменяются только администратором' using errcode = '42501';
    end if;

    return new;
  end if;

  return new;
end;
$function$;

create or replace function public.nav_v2_guard_profile_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_service boolean := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role';
  v_is_owner_or_admin boolean := false;
begin
  if v_is_service then
    return new;
  end if;

  select exists (
    select 1
    from public.nav_user_profiles p
    where p.id = v_uid
      and p.is_active = true
      and p.role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role)
  ) into v_is_owner_or_admin;

  if v_is_owner_or_admin then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.id is distinct from v_uid then
      raise exception 'Нельзя создать профиль другого пользователя' using errcode = '42501';
    end if;

    if new.role is distinct from 'spn'::public.nav_v2_user_role
       or coalesce(new.is_active, true) is distinct from true
       or new.manager_id is not null
       or new.invited_by is not null then
      raise exception 'Роль, активность, менеджер и приглашение назначаются только owner/admin' using errcode = '42501';
    end if;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.id is distinct from new.id then
      raise exception 'Нельзя менять id профиля' using errcode = '42501';
    end if;

    if new.id is distinct from v_uid then
      raise exception 'Нельзя менять профиль другого пользователя' using errcode = '42501';
    end if;

    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.manager_id is distinct from old.manager_id
       or new.email is distinct from old.email
       or new.invited_by is distinct from old.invited_by then
      raise exception 'Роль, активность, менеджер, email и приглашение изменяются только owner/admin' using errcode = '42501';
    end if;

    return new;
  end if;

  return new;
end;
$function$;

drop trigger if exists nav_profiles_guard_self_escalation on public.nav_profiles;
create trigger nav_profiles_guard_self_escalation
before insert or update on public.nav_profiles
for each row execute function public.nav_guard_legacy_profile_self_escalation();

drop trigger if exists nav_v2_profiles_guard_self_escalation on public.nav_user_profiles;
create trigger nav_v2_profiles_guard_self_escalation
before insert or update on public.nav_user_profiles
for each row execute function public.nav_v2_guard_profile_self_escalation();

revoke all on function public.nav_guard_legacy_profile_self_escalation() from public;
revoke all on function public.nav_guard_legacy_profile_self_escalation() from anon;
revoke all on function public.nav_guard_legacy_profile_self_escalation() from authenticated;
grant execute on function public.nav_guard_legacy_profile_self_escalation() to service_role;

revoke all on function public.nav_v2_guard_profile_self_escalation() from public;
revoke all on function public.nav_v2_guard_profile_self_escalation() from anon;
revoke all on function public.nav_v2_guard_profile_self_escalation() from authenticated;
grant execute on function public.nav_v2_guard_profile_self_escalation() to service_role;
