alter function public.nav_v2_clear_demo_data() rename to nav_v2_clear_demo_data_unchecked_20260622;
alter function public.nav_v2_seed_demo_data() rename to nav_v2_seed_demo_data_unchecked_20260622;

revoke all on function public.nav_v2_clear_demo_data_unchecked_20260622() from public;
revoke all on function public.nav_v2_clear_demo_data_unchecked_20260622() from anon;
revoke all on function public.nav_v2_clear_demo_data_unchecked_20260622() from authenticated;
grant execute on function public.nav_v2_clear_demo_data_unchecked_20260622() to service_role;

revoke all on function public.nav_v2_seed_demo_data_unchecked_20260622() from public;
revoke all on function public.nav_v2_seed_demo_data_unchecked_20260622() from anon;
revoke all on function public.nav_v2_seed_demo_data_unchecked_20260622() from authenticated;
grant execute on function public.nav_v2_seed_demo_data_unchecked_20260622() to service_role;

create or replace function public.nav_v2_clear_demo_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt_role text := nullif(current_setting('request.jwt.claim.role', true), '');
begin
  if coalesce(v_jwt_role, '') <> 'service_role' then
    if v_uid is null then
      raise exception 'Пользователь не авторизован' using errcode = '42501';
    end if;

    if not public.nav_v2_is_owner_or_admin(v_uid) then
      raise exception 'Only owner/admin can clear demo data' using errcode = '42501';
    end if;
  end if;

  return public.nav_v2_clear_demo_data_unchecked_20260622();
end;
$$;

create or replace function public.nav_v2_seed_demo_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt_role text := nullif(current_setting('request.jwt.claim.role', true), '');
begin
  if coalesce(v_jwt_role, '') <> 'service_role' then
    if v_uid is null then
      raise exception 'Пользователь не авторизован' using errcode = '42501';
    end if;

    if not public.nav_v2_is_owner_or_admin(v_uid) then
      raise exception 'Only owner/admin can seed demo data' using errcode = '42501';
    end if;
  end if;

  return public.nav_v2_seed_demo_data_unchecked_20260622();
end;
$$;

revoke all on function public.nav_v2_clear_demo_data() from public;
revoke execute on function public.nav_v2_clear_demo_data() from anon;
grant execute on function public.nav_v2_clear_demo_data() to authenticated;
grant execute on function public.nav_v2_clear_demo_data() to service_role;

revoke all on function public.nav_v2_seed_demo_data() from public;
revoke execute on function public.nav_v2_seed_demo_data() from anon;
grant execute on function public.nav_v2_seed_demo_data() to authenticated;
grant execute on function public.nav_v2_seed_demo_data() to service_role;
