drop policy if exists nav_tasks_insert_by_deal_access on public.nav_deal_tasks;
drop policy if exists nav_tasks_select_by_deal_access on public.nav_deal_tasks;
drop policy if exists nav_tasks_update_by_deal_access on public.nav_deal_tasks;

create policy nav_tasks_select_by_deal_access
on public.nav_deal_tasks
for select
to authenticated
using (
  deal_id is not null
  and public.nav_can_view_deal(deal_id, (select auth.uid()))
);

create policy nav_tasks_insert_by_deal_access
on public.nav_deal_tasks
for insert
to authenticated
with check (
  deal_id is not null
  and created_by = (select auth.uid())
  and public.nav_can_edit_deal(deal_id, (select auth.uid()))
);

create policy nav_tasks_update_by_deal_access
on public.nav_deal_tasks
for update
to authenticated
using (
  deal_id is not null
  and public.nav_can_edit_deal(deal_id, (select auth.uid()))
)
with check (
  deal_id is not null
  and public.nav_can_edit_deal(deal_id, (select auth.uid()))
);
