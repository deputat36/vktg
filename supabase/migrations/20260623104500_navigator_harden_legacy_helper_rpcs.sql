create or replace function public.nav_user_role_of(p_uid uuid)
returns public.nav_user_role
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
    from public.nav_profiles p
    join caller c on c.uid = p.id
    where p.is_active = true
    limit 1
  )
  select case
    when p_uid is null then null::public.nav_user_role
    when (
      p_uid = (select uid from caller)
      or (select is_service_role from caller)
      or exists (select 1 from caller_profile where role = 'admin'::public.nav_user_role)
    ) then (
      select target.role
      from public.nav_profiles target
      where target.id = p_uid
        and target.is_active = true
      limit 1
    )
    else null::public.nav_user_role
  end;
$function$;

create or replace function public.nav_can_create_deal(p_uid uuid default auth.uid())
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
    from public.nav_profiles p
    join caller c on c.uid = p.id
    where p.is_active = true
    limit 1
  )
  select case
    when p_uid is null then false
    when not (
      p_uid = (select uid from caller)
      or (select is_service_role from caller)
      or exists (select 1 from caller_profile where role = 'admin'::public.nav_user_role)
    ) then false
    else coalesce((
      select true
      from public.nav_profiles p
      where p.id = p_uid
        and p.is_active = true
        and p.role in (
          'admin'::public.nav_user_role,
          'manager'::public.nav_user_role,
          'spn'::public.nav_user_role,
          'lawyer'::public.nav_user_role,
          'broker'::public.nav_user_role
        )
      limit 1
    ), false)
  end;
$function$;

create or replace function public.nav_can_view_deal(p_deal_id uuid, p_uid uuid default auth.uid())
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
    from public.nav_profiles p
    join caller c on c.uid = p.id
    where p.is_active = true
    limit 1
  )
  select case
    when p_uid is null then false
    when not (
      p_uid = (select uid from caller)
      or (select is_service_role from caller)
      or exists (select 1 from caller_profile where role = 'admin'::public.nav_user_role)
    ) then false
    else coalesce((
      select true
      from public.nav_deals d
      where d.id = p_deal_id
        and (
          exists (
            select 1
            from public.nav_profiles me
            where me.id = p_uid
              and me.is_active = true
              and me.role = 'admin'::public.nav_user_role
          )
          or d.created_by = p_uid
          or d.seller_spn_id = p_uid
          or d.buyer_spn_id = p_uid
          or d.preparation_owner_id = p_uid
          or d.documents_owner_id = p_uid
          or d.lawyer_id = p_uid
          or d.broker_id = p_uid
          or d.manager_id = p_uid
          or exists (
            select 1
            from public.nav_deal_participants p
            where p.deal_id = d.id
              and p.user_id = p_uid
              and p.can_view = true
          )
          or exists (
            select 1
            from public.nav_profiles me
            join public.nav_profiles spn on spn.id = d.created_by
            where me.id = p_uid
              and me.is_active = true
              and me.role = 'manager'::public.nav_user_role
              and spn.manager_id = me.id
          )
          or exists (
            select 1
            from public.nav_profiles me
            where me.id = p_uid
              and me.is_active = true
              and me.role = 'lawyer'::public.nav_user_role
              and d.lawyer_needed = true
          )
          or exists (
            select 1
            from public.nav_profiles me
            where me.id = p_uid
              and me.is_active = true
              and me.role = 'broker'::public.nav_user_role
              and d.broker_needed = true
          )
        )
      limit 1
    ), false)
  end;
$function$;

create or replace function public.nav_can_edit_deal(p_deal_id uuid, p_uid uuid default auth.uid())
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
    from public.nav_profiles p
    join caller c on c.uid = p.id
    where p.is_active = true
    limit 1
  )
  select case
    when p_uid is null then false
    when not (
      p_uid = (select uid from caller)
      or (select is_service_role from caller)
      or exists (select 1 from caller_profile where role = 'admin'::public.nav_user_role)
    ) then false
    else coalesce((
      select true
      from public.nav_deals d
      where d.id = p_deal_id
        and (
          exists (
            select 1
            from public.nav_profiles me
            where me.id = p_uid
              and me.is_active = true
              and me.role = 'admin'::public.nav_user_role
          )
          or d.created_by = p_uid
          or d.seller_spn_id = p_uid
          or d.buyer_spn_id = p_uid
          or d.preparation_owner_id = p_uid
          or d.documents_owner_id = p_uid
          or d.lawyer_id = p_uid
          or d.broker_id = p_uid
          or d.manager_id = p_uid
          or exists (
            select 1
            from public.nav_deal_participants p
            where p.deal_id = d.id
              and p.user_id = p_uid
              and p.can_edit = true
          )
          or exists (
            select 1
            from public.nav_profiles me
            join public.nav_profiles spn on spn.id = d.created_by
            where me.id = p_uid
              and me.is_active = true
              and me.role = 'manager'::public.nav_user_role
              and spn.manager_id = me.id
          )
          or exists (
            select 1
            from public.nav_profiles me
            where me.id = p_uid
              and me.is_active = true
              and me.role = 'lawyer'::public.nav_user_role
              and d.lawyer_needed = true
          )
          or exists (
            select 1
            from public.nav_profiles me
            where me.id = p_uid
              and me.is_active = true
              and me.role = 'broker'::public.nav_user_role
              and d.broker_needed = true
          )
        )
      limit 1
    ), false)
  end;
$function$;

revoke all on function public.nav_user_role_of(uuid) from public;
revoke all on function public.nav_user_role_of(uuid) from anon;
revoke all on function public.nav_user_role_of(uuid) from authenticated;
grant execute on function public.nav_user_role_of(uuid) to authenticated, service_role;

revoke all on function public.nav_can_create_deal(uuid) from public;
revoke all on function public.nav_can_create_deal(uuid) from anon;
revoke all on function public.nav_can_create_deal(uuid) from authenticated;
grant execute on function public.nav_can_create_deal(uuid) to authenticated, service_role;

revoke all on function public.nav_can_view_deal(uuid, uuid) from public;
revoke all on function public.nav_can_view_deal(uuid, uuid) from anon;
revoke all on function public.nav_can_view_deal(uuid, uuid) from authenticated;
grant execute on function public.nav_can_view_deal(uuid, uuid) to authenticated, service_role;

revoke all on function public.nav_can_edit_deal(uuid, uuid) from public;
revoke all on function public.nav_can_edit_deal(uuid, uuid) from anon;
revoke all on function public.nav_can_edit_deal(uuid, uuid) from authenticated;
grant execute on function public.nav_can_edit_deal(uuid, uuid) to authenticated, service_role;
