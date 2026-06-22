create or replace function public.nav_v2_is_active_user(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  with caller as (
    select auth.uid() as uid,
           coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role' as is_service_role
  ),
  caller_profile as (
    select p.role
    from public.nav_user_profiles p
    join caller c on c.uid = p.id
    where p.is_active = true
    limit 1
  )
  select case
    when p_uid is null then false
    when (
      p_uid = (select uid from caller)
      or (select is_service_role from caller)
      or exists (select 1 from caller_profile where role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role))
    ) then coalesce((
      select true
      from public.nav_user_profiles target
      where target.id = p_uid
        and target.is_active = true
      limit 1
    ), false)
    else false
  end;
$function$;

create or replace function public.nav_v2_is_owner_or_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  with caller as (
    select auth.uid() as uid,
           coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role' as is_service_role
  ),
  caller_profile as (
    select p.role
    from public.nav_user_profiles p
    join caller c on c.uid = p.id
    where p.is_active = true
    limit 1
  )
  select case
    when p_uid is null then false
    when (
      p_uid = (select uid from caller)
      or (select is_service_role from caller)
      or exists (select 1 from caller_profile where role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role))
    ) then coalesce((
      select true
      from public.nav_user_profiles target
      where target.id = p_uid
        and target.is_active = true
        and target.role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role)
      limit 1
    ), false)
    else false
  end;
$function$;

create or replace function public.nav_v2_my_role(p_uid uuid default auth.uid())
returns public.nav_v2_user_role
language sql
stable
security definer
set search_path = public
as $function$
  with caller as (
    select auth.uid() as uid,
           coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role' as is_service_role
  ),
  caller_profile as (
    select p.role
    from public.nav_user_profiles p
    join caller c on c.uid = p.id
    where p.is_active = true
    limit 1
  )
  select case
    when p_uid is null then null::public.nav_v2_user_role
    when (
      p_uid = (select uid from caller)
      or (select is_service_role from caller)
      or exists (select 1 from caller_profile where role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role))
    ) then (
      select target.role
      from public.nav_user_profiles target
      where target.id = p_uid
        and target.is_active = true
      limit 1
    )
    else null::public.nav_v2_user_role
  end;
$function$;

revoke all on function public.nav_v2_is_active_user(uuid) from public;
revoke execute on function public.nav_v2_is_active_user(uuid) from anon;
grant execute on function public.nav_v2_is_active_user(uuid) to authenticated;
grant execute on function public.nav_v2_is_active_user(uuid) to service_role;

revoke all on function public.nav_v2_is_owner_or_admin(uuid) from public;
revoke execute on function public.nav_v2_is_owner_or_admin(uuid) from anon;
grant execute on function public.nav_v2_is_owner_or_admin(uuid) to authenticated;
grant execute on function public.nav_v2_is_owner_or_admin(uuid) to service_role;

revoke all on function public.nav_v2_my_role(uuid) from public;
revoke execute on function public.nav_v2_my_role(uuid) from anon;
grant execute on function public.nav_v2_my_role(uuid) to authenticated;
grant execute on function public.nav_v2_my_role(uuid) to service_role;
