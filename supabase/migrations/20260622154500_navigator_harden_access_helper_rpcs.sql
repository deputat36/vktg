create or replace function public.nav_v2_can_view_deal(p_deal_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable security definer
set search_path = public
as $function$
  select coalesce((
    select true
    from public.nav_deals_v2 d
    where d.id = p_deal_id
      and p_uid is not null
      and (
        p_uid = auth.uid()
        or public.nav_v2_is_owner_or_admin(auth.uid())
        or coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role'
      )
      and (
        public.nav_v2_is_owner_or_admin(p_uid)
        or d.created_by = p_uid
        or d.manager_id = p_uid
        or d.seller_spn_id = p_uid
        or d.buyer_spn_id = p_uid
        or d.lawyer_id = p_uid
        or d.broker_id = p_uid
        or exists (
          select 1
          from public.nav_deal_participants_v2 p
          where p.deal_id = d.id
            and p.user_id = p_uid
            and p.can_view = true
        )
        or exists (
          select 1
          from public.nav_user_profiles me
          join public.nav_user_profiles spn on spn.manager_id = me.id
          where me.id = p_uid
            and me.is_active = true
            and me.role = 'manager'::public.nav_v2_user_role
            and (spn.id = d.seller_spn_id or spn.id = d.buyer_spn_id or spn.id = d.created_by)
        )
        or exists (
          select 1
          from public.nav_user_profiles me
          where me.id = p_uid
            and me.is_active = true
            and me.role = 'lawyer'::public.nav_v2_user_role
            and d.lawyer_needed = true
        )
        or exists (
          select 1
          from public.nav_user_profiles me
          where me.id = p_uid
            and me.is_active = true
            and me.role = 'broker'::public.nav_v2_user_role
            and d.broker_needed = true
        )
      )
    limit 1
  ), false);
$function$;

create or replace function public.nav_v2_can_edit_deal(p_deal_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable security definer
set search_path = public
as $function$
  select coalesce((
    select true
    from public.nav_deals_v2 d
    where d.id = p_deal_id
      and p_uid is not null
      and (
        p_uid = auth.uid()
        or public.nav_v2_is_owner_or_admin(auth.uid())
        or coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role'
      )
      and (
        public.nav_v2_is_owner_or_admin(p_uid)
        or d.created_by = p_uid
        or d.manager_id = p_uid
        or d.seller_spn_id = p_uid
        or d.buyer_spn_id = p_uid
        or exists (
          select 1
          from public.nav_deal_participants_v2 p
          where p.deal_id = d.id
            and p.user_id = p_uid
            and p.can_edit = true
        )
        or exists (
          select 1
          from public.nav_user_profiles me
          join public.nav_user_profiles spn on spn.manager_id = me.id
          where me.id = p_uid
            and me.is_active = true
            and me.role = 'manager'::public.nav_v2_user_role
            and (spn.id = d.seller_spn_id or spn.id = d.buyer_spn_id or spn.id = d.created_by)
        )
      )
    limit 1
  ), false);
$function$;

create or replace function public.nav_v2_can_change_task_status(p_task_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable security definer
set search_path = public
as $function$
 select exists(
  select 1 from public.nav_deal_tasks_v2 t
  where t.id = p_task_id
    and p_uid is not null
    and (
      p_uid = auth.uid()
      or public.nav_v2_is_owner_or_admin(auth.uid())
      or coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role'
    )
    and public.nav_v2_can_view_deal(t.deal_id, p_uid)
    and (public.nav_v2_can_edit_deal(t.deal_id, p_uid) or t.assigned_to = p_uid or t.assigned_role = public.nav_v2_my_role(p_uid))
 );
$function$;

revoke all on function public.nav_v2_can_view_deal(uuid, uuid) from public;
revoke execute on function public.nav_v2_can_view_deal(uuid, uuid) from anon;
grant execute on function public.nav_v2_can_view_deal(uuid, uuid) to authenticated;
grant execute on function public.nav_v2_can_view_deal(uuid, uuid) to service_role;

revoke all on function public.nav_v2_can_edit_deal(uuid, uuid) from public;
revoke execute on function public.nav_v2_can_edit_deal(uuid, uuid) from anon;
grant execute on function public.nav_v2_can_edit_deal(uuid, uuid) to authenticated;
grant execute on function public.nav_v2_can_edit_deal(uuid, uuid) to service_role;

revoke all on function public.nav_v2_can_change_task_status(uuid, uuid) from public;
revoke execute on function public.nav_v2_can_change_task_status(uuid, uuid) from anon;
grant execute on function public.nav_v2_can_change_task_status(uuid, uuid) to authenticated;
grant execute on function public.nav_v2_can_change_task_status(uuid, uuid) to service_role;
