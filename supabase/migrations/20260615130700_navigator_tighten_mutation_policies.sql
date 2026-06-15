drop policy if exists nav_v2_documents_write on public.nav_deal_documents_v2;
create policy nav_v2_documents_write on public.nav_deal_documents_v2
for all to authenticated
using (public.nav_v2_can_edit_deal(deal_id,auth.uid()))
with check (public.nav_v2_can_edit_deal(deal_id,auth.uid()));

drop policy if exists nav_v2_risks_write on public.nav_deal_risks_v2;
create policy nav_v2_risks_write on public.nav_deal_risks_v2
for all to authenticated
using (public.nav_v2_can_edit_deal(deal_id,auth.uid()))
with check (public.nav_v2_can_edit_deal(deal_id,auth.uid()));

drop policy if exists nav_v2_tasks_write on public.nav_deal_tasks_v2;
drop policy if exists nav_v2_events_insert on public.nav_deal_events_v2;
