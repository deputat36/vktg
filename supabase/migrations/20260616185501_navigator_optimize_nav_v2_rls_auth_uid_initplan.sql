-- Optimize Navigator v2 RLS policies according to Supabase Advisor guidance.
-- Logic is unchanged: direct auth.uid() calls are wrapped as (select auth.uid())
-- so PostgreSQL can evaluate the JWT user id once per statement instead of once per row.
-- This migration only touches nav_v2_* / nav_user_profiles policies and does not touch leader_*.

alter policy nav_v2_answers_select on public.nav_deal_answers_v2
  using (nav_v2_can_view_deal(deal_id, (select auth.uid())));

alter policy nav_v2_answers_write on public.nav_deal_answers_v2
  using (nav_v2_can_edit_deal(deal_id, (select auth.uid())))
  with check (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

alter policy nav_v2_comments_select on public.nav_deal_comments_v2
  using (nav_v2_can_view_deal(deal_id, (select auth.uid())));

alter policy nav_v2_comments_insert on public.nav_deal_comments_v2
  with check (nav_v2_can_view_deal(deal_id, (select auth.uid())));

alter policy nav_v2_documents_select on public.nav_deal_documents_v2
  using (nav_v2_can_view_deal(deal_id, (select auth.uid())));

alter policy nav_v2_documents_write on public.nav_deal_documents_v2
  using (nav_v2_can_edit_deal(deal_id, (select auth.uid())))
  with check (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

alter policy nav_v2_events_select on public.nav_deal_events_v2
  using ((deal_id is null) or nav_v2_can_view_deal(deal_id, (select auth.uid())));

alter policy nav_v2_expenses_select on public.nav_deal_expenses_v2
  using (nav_v2_can_view_deal(deal_id, (select auth.uid())));

alter policy nav_v2_expenses_write on public.nav_deal_expenses_v2
  using (nav_v2_can_edit_deal(deal_id, (select auth.uid())))
  with check (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

alter policy nav_v2_participants_select on public.nav_deal_participants_v2
  using (nav_v2_can_view_deal(deal_id, (select auth.uid())) or user_id = (select auth.uid()));

alter policy nav_v2_participants_write on public.nav_deal_participants_v2
  using (nav_v2_can_edit_deal(deal_id, (select auth.uid())))
  with check (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

alter policy nav_v2_reviews_select on public.nav_deal_reviews_v2
  using (nav_v2_can_view_deal(deal_id, (select auth.uid())));

alter policy nav_v2_reviews_insert on public.nav_deal_reviews_v2
  with check (
    nav_v2_can_view_deal(deal_id, (select auth.uid()))
    and nav_v2_my_role((select auth.uid())) = any (array[
      'lawyer'::nav_v2_user_role,
      'broker'::nav_v2_user_role,
      'manager'::nav_v2_user_role,
      'owner'::nav_v2_user_role,
      'admin'::nav_v2_user_role
    ])
  );

alter policy nav_v2_risks_select on public.nav_deal_risks_v2
  using (nav_v2_can_view_deal(deal_id, (select auth.uid())));

alter policy nav_v2_risks_write on public.nav_deal_risks_v2
  using (nav_v2_can_edit_deal(deal_id, (select auth.uid())))
  with check (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

alter policy nav_v2_tasks_select on public.nav_deal_tasks_v2
  using (nav_v2_can_view_deal(deal_id, (select auth.uid())) or assigned_to = (select auth.uid()));

alter policy nav_v2_deals_select on public.nav_deals_v2
  using (nav_v2_can_view_deal(id, (select auth.uid())));

alter policy nav_v2_deals_insert on public.nav_deals_v2
  with check (nav_v2_is_active_user((select auth.uid())) and created_by = (select auth.uid()));

alter policy nav_v2_deals_update on public.nav_deals_v2
  using (nav_v2_can_edit_deal(id, (select auth.uid())))
  with check (nav_v2_can_edit_deal(id, (select auth.uid())));

alter policy nav_v2_profiles_insert_admin on public.nav_user_profiles
  with check (nav_v2_is_owner_or_admin((select auth.uid())) or id = (select auth.uid()));

alter policy nav_v2_profiles_update_admin_or_self on public.nav_user_profiles
  using (nav_v2_is_owner_or_admin((select auth.uid())) or id = (select auth.uid()))
  with check (nav_v2_is_owner_or_admin((select auth.uid())) or id = (select auth.uid()));

alter policy nav_v2_profiles_select on public.nav_user_profiles
  using (
    id = (select auth.uid())
    or nav_v2_is_owner_or_admin((select auth.uid()))
    or manager_id = (select auth.uid())
    or exists (
      select 1
      from public.nav_user_profiles me
      where me.id = (select auth.uid())
        and me.is_active = true
        and me.role = any (array[
          'manager'::nav_v2_user_role,
          'lawyer'::nav_v2_user_role,
          'broker'::nav_v2_user_role
        ])
    )
  );
