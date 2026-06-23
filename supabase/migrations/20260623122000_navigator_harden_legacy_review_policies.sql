drop policy if exists nav_reviews_insert_reviewer on public.nav_deal_reviews;
drop policy if exists nav_reviews_select_by_deal_access on public.nav_deal_reviews;

create policy nav_reviews_select_by_deal_access
on public.nav_deal_reviews
for select
to authenticated
using (
  deal_id is not null
  and public.nav_can_view_deal(deal_id, (select auth.uid()))
);

create policy nav_reviews_insert_reviewer
on public.nav_deal_reviews
for insert
to authenticated
with check (
  deal_id is not null
  and reviewer_id = (select auth.uid())
  and public.nav_can_view_deal(deal_id, (select auth.uid()))
  and public.nav_current_role() = any (array['manager'::public.nav_user_role, 'admin'::public.nav_user_role, 'lawyer'::public.nav_user_role, 'broker'::public.nav_user_role])
);
