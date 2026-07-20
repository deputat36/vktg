\set ON_ERROR_STOP on

drop function if exists harness.write_mapping(uuid,jsonb);
drop function if exists harness.rule_plan(text,text,text,text);
drop table if exists harness.intake_request_ledger;

drop table if exists public.nav_deal_events_v2 cascade;
drop table if exists public.nav_deal_tasks_v2 cascade;
drop table if exists public.nav_deal_risks_v2 cascade;
drop table if exists public.nav_deal_documents_v2 cascade;
drop table if exists public.nav_deal_participants_v2 cascade;
drop table if exists public.nav_deals_v2 cascade;
drop table if exists public.nav_user_profiles cascade;
drop table if exists auth.users cascade;

drop function if exists nav_v2_private.nav_v2_map_governed_intake_to_production_v1(jsonb);
drop function if exists nav_v2_private.nav_v2_map_intake_task_priority_v1(jsonb);
drop function if exists nav_v2_private.nav_v2_map_intake_task_type_v1(text);
drop function if exists nav_v2_private.nav_v2_map_intake_risk_level_v1(text);
drop function if exists nav_v2_private.nav_v2_map_intake_document_status_v1(text);
drop function if exists nav_v2_private.nav_v2_map_intake_document_side_v1(text);
drop function if exists nav_v2_private.nav_v2_guard_client_identifiers();
drop function if exists nav_v2_private.nav_v2_sanitize_client_deal_json(jsonb);
drop function if exists public.nav_v2_deal_quality_tasks_trigger();
drop function if exists public.nav_v2_set_auto_task_due_date();
drop function if exists harness.assert_true(boolean,text);

drop type if exists public.nav_v2_task_priority;
drop type if exists public.nav_v2_task_status;
drop type if exists public.nav_v2_side;
drop type if exists public.nav_v2_user_role;
drop type if exists public.nav_v2_risk_level;
drop type if exists public.nav_v2_deal_status;

drop schema if exists nav_v2_private cascade;
drop schema if exists harness cascade;
drop schema if exists auth cascade;
drop role if exists service_role;
drop role if exists authenticated;
drop role if exists anon;

select 'Navigator v2 production schema mapping rollback passed' as result;
