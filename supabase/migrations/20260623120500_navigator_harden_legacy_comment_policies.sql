drop policy if exists nav_comments_insert_authenticated on public.nav_deal_comments;
drop policy if exists nav_comments_select_by_deal_access on public.nav_deal_comments;

create policy nav_comments_select_by_deal_access
on public.nav_deal_comments
for select
to authenticated
using (
  deal_id is not null
  and public.nav_can_view_deal(deal_id, (select auth.uid()))
);

create policy nav_comments_insert_by_deal_access
on public.nav_deal_comments
for insert
to authenticated
with check (
  deal_id is not null
  and user_id = (select auth.uid())
  and public.nav_can_view_deal(deal_id, (select auth.uid()))
);
