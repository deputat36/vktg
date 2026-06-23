create or replace function public.nav_v2_can_change_task_status(p_task_id uuid, p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  with caller as (
    select auth.uid() as uid,
           coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role' as is_service_role
  ),
  caller_profile as (
    select public.nav_v2_my_role(p_uid) as role
  )
  select exists(
    select 1
    from public.nav_deal_tasks_v2 t
    cross join caller c
    cross join caller_profile cp
    where t.id = p_task_id
      and p_uid is not null
      and (
        p_uid = c.uid
        or c.is_service_role
        or public.nav_v2_is_owner_or_admin(c.uid)
      )
      and public.nav_v2_can_view_deal(t.deal_id, p_uid)
      and (
        c.is_service_role
        or public.nav_v2_is_owner_or_admin(p_uid)
        or (cp.role = 'manager'::public.nav_v2_user_role and public.nav_v2_can_edit_deal(t.deal_id, p_uid))
        or t.assigned_to = p_uid
        or (t.assigned_to is null and t.assigned_role = cp.role)
      )
  );
$function$;

revoke all on function public.nav_v2_can_change_task_status(uuid, uuid) from public, anon;
grant execute on function public.nav_v2_can_change_task_status(uuid, uuid) to authenticated, service_role;
