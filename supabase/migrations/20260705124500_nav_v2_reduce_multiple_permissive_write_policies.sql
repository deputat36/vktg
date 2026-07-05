-- Reduce Navigator v2 multiple permissive RLS policies reported by Supabase Performance Advisor.
--
-- Problem:
-- Older *_write policies were created without an explicit command, so PostgreSQL treats them as FOR ALL.
-- That makes them also apply to SELECT and creates duplicate permissive SELECT policies alongside *_select.
--
-- Fix:
-- Replace broad write policies with explicit INSERT / UPDATE / DELETE policies.
-- Access logic remains unchanged and still uses nav_v2_can_edit_deal(...).

-- nav_deal_answers_v2

drop policy if exists nav_v2_answers_write on public.nav_deal_answers_v2;

create policy nav_v2_answers_insert on public.nav_deal_answers_v2
  for insert to authenticated
  with check (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

create policy nav_v2_answers_update on public.nav_deal_answers_v2
  for update to authenticated
  using (nav_v2_can_edit_deal(deal_id, (select auth.uid())))
  with check (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

create policy nav_v2_answers_delete on public.nav_deal_answers_v2
  for delete to authenticated
  using (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

-- nav_deal_documents_v2

drop policy if exists nav_v2_documents_write on public.nav_deal_documents_v2;

create policy nav_v2_documents_insert on public.nav_deal_documents_v2
  for insert to authenticated
  with check (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

create policy nav_v2_documents_update on public.nav_deal_documents_v2
  for update to authenticated
  using (nav_v2_can_edit_deal(deal_id, (select auth.uid())))
  with check (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

create policy nav_v2_documents_delete on public.nav_deal_documents_v2
  for delete to authenticated
  using (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

-- nav_deal_expenses_v2

drop policy if exists nav_v2_expenses_write on public.nav_deal_expenses_v2;

create policy nav_v2_expenses_insert on public.nav_deal_expenses_v2
  for insert to authenticated
  with check (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

create policy nav_v2_expenses_update on public.nav_deal_expenses_v2
  for update to authenticated
  using (nav_v2_can_edit_deal(deal_id, (select auth.uid())))
  with check (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

create policy nav_v2_expenses_delete on public.nav_deal_expenses_v2
  for delete to authenticated
  using (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

-- nav_deal_participants_v2

drop policy if exists nav_v2_participants_write on public.nav_deal_participants_v2;

create policy nav_v2_participants_insert on public.nav_deal_participants_v2
  for insert to authenticated
  with check (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

create policy nav_v2_participants_update on public.nav_deal_participants_v2
  for update to authenticated
  using (nav_v2_can_edit_deal(deal_id, (select auth.uid())))
  with check (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

create policy nav_v2_participants_delete on public.nav_deal_participants_v2
  for delete to authenticated
  using (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

-- nav_deal_risks_v2

drop policy if exists nav_v2_risks_write on public.nav_deal_risks_v2;

create policy nav_v2_risks_insert on public.nav_deal_risks_v2
  for insert to authenticated
  with check (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

create policy nav_v2_risks_update on public.nav_deal_risks_v2
  for update to authenticated
  using (nav_v2_can_edit_deal(deal_id, (select auth.uid())))
  with check (nav_v2_can_edit_deal(deal_id, (select auth.uid())));

create policy nav_v2_risks_delete on public.nav_deal_risks_v2
  for delete to authenticated
  using (nav_v2_can_edit_deal(deal_id, (select auth.uid())));
