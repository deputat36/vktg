drop policy if exists nav_deal_events_select_authenticated on public.nav_deal_events;
drop policy if exists nav_deal_events_insert_authenticated on public.nav_deal_events;
drop policy if exists nav_deal_events_update_admin_manager on public.nav_deal_events;

create policy nav_deal_events_select_by_deal_access
on public.nav_deal_events
for select
to authenticated
using (
  (
    deal_id is not null
    and public.nav_can_view_deal(deal_id, (select auth.uid()))
  )
  or (
    deal_id is null
    and (
      user_id = (select auth.uid())
      or public.nav_is_admin()
    )
  )
);

create policy nav_deal_events_insert_by_deal_access
on public.nav_deal_events
for insert
to authenticated
with check (
  (
    user_id = (select auth.uid())
    or user_id is null
  )
  and (
    (
      deal_id is not null
      and public.nav_can_view_deal(deal_id, (select auth.uid()))
    )
    or (
      deal_id is null
      and user_id = (select auth.uid())
    )
  )
);

create policy nav_deal_events_update_admin_manager_by_deal_access
on public.nav_deal_events
for update
to authenticated
using (
  (
    public.nav_is_admin()
    or public.nav_current_role() = 'manager'::public.nav_user_role
  )
  and (
    deal_id is null
    or public.nav_can_view_deal(deal_id, (select auth.uid()))
  )
)
with check (
  (
    public.nav_is_admin()
    or public.nav_current_role() = 'manager'::public.nav_user_role
  )
  and (
    deal_id is null
    or public.nav_can_view_deal(deal_id, (select auth.uid()))
  )
);
