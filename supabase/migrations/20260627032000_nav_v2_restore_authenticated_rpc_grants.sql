-- Restore authenticated access to Navigator v2 client RPC functions.
-- Some CREATE OR REPLACE FUNCTION migrations can drop explicit function grants.
-- Keep anon closed; app access is for authenticated users only.

grant execute on function public.nav_v2_get_my_profile() to authenticated;
grant execute on function public.nav_v2_get_dashboard() to authenticated;
grant execute on function public.nav_v2_get_deals_list(integer) to authenticated;
grant execute on function public.nav_v2_get_deal_card(uuid) to authenticated;
grant execute on function public.nav_v2_get_deal_card_lite(uuid) to authenticated;
grant execute on function public.nav_v2_get_deal_responsibility_snapshot(uuid) to authenticated;
grant execute on function public.nav_v2_get_deal_status_options(uuid) to authenticated;
grant execute on function public.nav_v2_get_handoff_scores(jsonb) to authenticated;
grant execute on function public.nav_v2_get_lawyer_queue(integer) to authenticated;
grant execute on function public.nav_v2_get_lawyer_review_summary() to authenticated;
grant execute on function public.nav_v2_list_users() to authenticated;
grant execute on function public.nav_v2_get_access_audit() to authenticated;

grant execute on function public.nav_v2_save_wizard_result(jsonb) to authenticated;
grant execute on function public.nav_v2_add_comment(uuid, text, text) to authenticated;
grant execute on function public.nav_v2_add_deal_review(uuid, text, text, boolean, boolean) to authenticated;
grant execute on function public.nav_v2_add_document(uuid, nav_v2_side, text, text, boolean, boolean, text, text) to authenticated;
grant execute on function public.nav_v2_add_expense(uuid, nav_v2_side, text, text, numeric, text, boolean, boolean, boolean, text) to authenticated;
grant execute on function public.nav_v2_add_risk(uuid, nav_v2_risk_level, text, text, text, text, boolean, boolean, nav_v2_user_role) to authenticated;
grant execute on function public.nav_v2_add_task(uuid, text, text, nav_v2_user_role, nav_v2_task_priority, text) to authenticated;

grant execute on function public.nav_v2_update_deal_status(uuid, nav_v2_deal_status) to authenticated;
grant execute on function public.nav_v2_update_deal_parties(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.nav_v2_update_document_status(uuid, text) to authenticated;
grant execute on function public.nav_v2_update_document_assignment(uuid, uuid, nav_v2_user_role, date, boolean, boolean) to authenticated;
grant execute on function public.nav_v2_update_document_workflow(uuid, text, uuid, nav_v2_user_role, date, text) to authenticated;
grant execute on function public.nav_v2_update_task_status(uuid, nav_v2_task_status) to authenticated;
grant execute on function public.nav_v2_update_task_due_date(uuid, date) to authenticated;
grant execute on function public.nav_v2_update_user_profile(uuid, text, nav_v2_user_role, uuid, text, boolean) to authenticated;
grant execute on function public.nav_v2_link_user_by_email(text, text, nav_v2_user_role, uuid, text) to authenticated;

grant execute on function public.nav_v2_return_spn_rework(uuid, text) to authenticated;
grant execute on function public.nav_v2_submit_spn_rework(uuid, text) to authenticated;
