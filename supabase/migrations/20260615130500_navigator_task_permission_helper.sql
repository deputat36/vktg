create or replace function public.nav_v2_can_change_task_status(
  p_task_id uuid,
  p_uid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.nav_deal_tasks_v2 t
    where t.id = p_task_id
      and public.nav_v2_can_view_deal(t.deal_id, p_uid)
      and (
        public.nav_v2_can_edit_deal(t.deal_id, p_uid)
        or t.assigned_to = p_uid
        or t.assigned_role = public.nav_v2_my_role(p_uid)
      )
  );
$$;
