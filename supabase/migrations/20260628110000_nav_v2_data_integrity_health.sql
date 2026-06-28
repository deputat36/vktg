create or replace function public.nav_v2_get_data_integrity_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_checks jsonb;
  v_problem_count int := 0;
  v_foreign_key_count int := 0;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  if not public.nav_v2_is_owner_or_admin(v_uid) then
    raise exception 'Проверка целостности данных доступна только owner/admin' using errcode = '42501';
  end if;

  select count(*)::int into v_foreign_key_count
  from pg_constraint con
  join pg_namespace n on n.oid = con.connamespace
  where con.contype = 'f'
    and n.nspname = 'public'
    and con.conrelid::regclass::text like 'nav\_%' escape '\'
    and con.conrelid::regclass::text not like 'leader\_%' escape '\'
    and con.conrelid::regclass::text not like 'parket\_%' escape '\';

  with checks(label, severity, count_value, sample) as (
    values
      ('participant_without_deal', 'critical', (select count(*)::int from public.nav_deal_participants_v2 p left join public.nav_deals_v2 d on d.id = p.deal_id where d.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select p.id, p.deal_id, p.user_id from public.nav_deal_participants_v2 p left join public.nav_deals_v2 d on d.id = p.deal_id where d.id is null limit 10) s)),
      ('participant_without_user_profile', 'warning', (select count(*)::int from public.nav_deal_participants_v2 p left join public.nav_user_profiles u on u.id = p.user_id where p.user_id is not null and u.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select p.id, p.deal_id, p.user_id from public.nav_deal_participants_v2 p left join public.nav_user_profiles u on u.id = p.user_id where p.user_id is not null and u.id is null limit 10) s)),
      ('document_without_deal', 'critical', (select count(*)::int from public.nav_deal_documents_v2 x left join public.nav_deals_v2 d on d.id = x.deal_id where d.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select x.id, x.deal_id, x.title from public.nav_deal_documents_v2 x left join public.nav_deals_v2 d on d.id = x.deal_id where d.id is null limit 10) s)),
      ('document_without_assignee_profile', 'warning', (select count(*)::int from public.nav_deal_documents_v2 x left join public.nav_user_profiles u on u.id = x.assigned_to where x.assigned_to is not null and u.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select x.id, x.deal_id, x.assigned_to, x.title from public.nav_deal_documents_v2 x left join public.nav_user_profiles u on u.id = x.assigned_to where x.assigned_to is not null and u.id is null limit 10) s)),
      ('task_without_deal', 'critical', (select count(*)::int from public.nav_deal_tasks_v2 x left join public.nav_deals_v2 d on d.id = x.deal_id where d.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select x.id, x.deal_id, x.title from public.nav_deal_tasks_v2 x left join public.nav_deals_v2 d on d.id = x.deal_id where d.id is null limit 10) s)),
      ('task_without_assignee_profile', 'warning', (select count(*)::int from public.nav_deal_tasks_v2 x left join public.nav_user_profiles u on u.id = x.assigned_to where x.assigned_to is not null and u.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select x.id, x.deal_id, x.assigned_to, x.title from public.nav_deal_tasks_v2 x left join public.nav_user_profiles u on u.id = x.assigned_to where x.assigned_to is not null and u.id is null limit 10) s)),
      ('risk_without_deal', 'critical', (select count(*)::int from public.nav_deal_risks_v2 x left join public.nav_deals_v2 d on d.id = x.deal_id where d.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select x.id, x.deal_id, x.title from public.nav_deal_risks_v2 x left join public.nav_deals_v2 d on d.id = x.deal_id where d.id is null limit 10) s)),
      ('review_without_deal', 'critical', (select count(*)::int from public.nav_deal_reviews_v2 x left join public.nav_deals_v2 d on d.id = x.deal_id where d.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select x.id, x.deal_id, x.reviewer_role from public.nav_deal_reviews_v2 x left join public.nav_deals_v2 d on d.id = x.deal_id where d.id is null limit 10) s)),
      ('comment_without_deal', 'critical', (select count(*)::int from public.nav_deal_comments_v2 x left join public.nav_deals_v2 d on d.id = x.deal_id where d.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select x.id, x.deal_id, x.author_id from public.nav_deal_comments_v2 x left join public.nav_deals_v2 d on d.id = x.deal_id where d.id is null limit 10) s)),
      ('event_without_deal', 'warning', (select count(*)::int from public.nav_deal_events_v2 x left join public.nav_deals_v2 d on d.id = x.deal_id where x.deal_id is not null and d.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select x.id, x.deal_id, x.event_type from public.nav_deal_events_v2 x left join public.nav_deals_v2 d on d.id = x.deal_id where x.deal_id is not null and d.id is null limit 10) s)),
      ('deal_without_created_by_auth_user', 'critical', (select count(*)::int from public.nav_deals_v2 d left join auth.users u on u.id = d.created_by where d.created_by is not null and u.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select d.id, d.title, d.created_by from public.nav_deals_v2 d left join auth.users u on u.id = d.created_by where d.created_by is not null and u.id is null limit 10) s)),
      ('deal_without_created_by_profile', 'warning', (select count(*)::int from public.nav_deals_v2 d left join public.nav_user_profiles u on u.id = d.created_by where d.created_by is not null and u.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select d.id, d.title, d.created_by from public.nav_deals_v2 d left join public.nav_user_profiles u on u.id = d.created_by where d.created_by is not null and u.id is null limit 10) s)),
      ('deal_without_manager_profile', 'warning', (select count(*)::int from public.nav_deals_v2 d left join public.nav_user_profiles u on u.id = d.manager_id where d.manager_id is not null and u.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select d.id, d.title, d.manager_id from public.nav_deals_v2 d left join public.nav_user_profiles u on u.id = d.manager_id where d.manager_id is not null and u.id is null limit 10) s)),
      ('deal_without_seller_spn_profile', 'warning', (select count(*)::int from public.nav_deals_v2 d left join public.nav_user_profiles u on u.id = d.seller_spn_id where d.seller_spn_id is not null and u.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select d.id, d.title, d.seller_spn_id from public.nav_deals_v2 d left join public.nav_user_profiles u on u.id = d.seller_spn_id where d.seller_spn_id is not null and u.id is null limit 10) s)),
      ('deal_without_buyer_spn_profile', 'warning', (select count(*)::int from public.nav_deals_v2 d left join public.nav_user_profiles u on u.id = d.buyer_spn_id where d.buyer_spn_id is not null and u.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select d.id, d.title, d.buyer_spn_id from public.nav_deals_v2 d left join public.nav_user_profiles u on u.id = d.buyer_spn_id where d.buyer_spn_id is not null and u.id is null limit 10) s)),
      ('deal_without_lawyer_profile', 'warning', (select count(*)::int from public.nav_deals_v2 d left join public.nav_user_profiles u on u.id = d.lawyer_id where d.lawyer_id is not null and u.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select d.id, d.title, d.lawyer_id from public.nav_deals_v2 d left join public.nav_user_profiles u on u.id = d.lawyer_id where d.lawyer_id is not null and u.id is null limit 10) s)),
      ('deal_without_broker_profile', 'warning', (select count(*)::int from public.nav_deals_v2 d left join public.nav_user_profiles u on u.id = d.broker_id where d.broker_id is not null and u.id is null), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select d.id, d.title, d.broker_id from public.nav_deals_v2 d left join public.nav_user_profiles u on u.id = d.broker_id where d.broker_id is not null and u.id is null limit 10) s)),
      ('duplicate_profile_email', 'warning', (select count(*)::int from (select lower(trim(email)) as email_key from public.nav_user_profiles where nullif(trim(email), '') is not null group by lower(trim(email)) having count(*) > 1) s), (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from (select lower(trim(email)) as email_key, count(*)::int as count from public.nav_user_profiles where nullif(trim(email), '') is not null group by lower(trim(email)) having count(*) > 1 limit 10) s))
  ), shaped as (
    select label, severity, count_value, sample, count_value > 0 as has_problem
    from checks
  )
  select
    coalesce(jsonb_agg(to_jsonb(shaped) order by severity, label), '[]'::jsonb),
    count(*) filter (where has_problem)::int
  into v_checks, v_problem_count
  from shaped;

  return jsonb_build_object(
    'ok', coalesce(v_problem_count, 0) = 0,
    'checked_at', now(),
    'foreign_key_count', v_foreign_key_count,
    'check_count', jsonb_array_length(v_checks),
    'problem_count', coalesce(v_problem_count, 0),
    'checks', v_checks,
    'problems', coalesce((select jsonb_agg(item) from jsonb_array_elements(v_checks) item where (item->>'has_problem')::boolean), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.nav_v2_get_data_integrity_health() from public;
revoke execute on function public.nav_v2_get_data_integrity_health() from anon;
grant execute on function public.nav_v2_get_data_integrity_health() to authenticated;

-- Keep grant health aware of this browser-callable owner/admin diagnostic RPC.
create or replace function public.nav_v2_get_rpc_grant_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_items jsonb;
  v_problem_count int;
  v_missing_authenticated_count int;
  v_anon_open_count int;
  v_public_open_count int;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  if not public.nav_v2_is_owner_or_admin(v_uid) then
    raise exception 'Проверка RPC доступна только owner/admin' using errcode = '42501';
  end if;

  with expected(label, function_name, arguments) as (
    values
      ('Profile', 'nav_v2_get_my_profile', '[]'::jsonb),
      ('Dashboard', 'nav_v2_get_dashboard', '[]'::jsonb),
      ('Deals list', 'nav_v2_get_deals_list', '["integer"]'::jsonb),
      ('Deal card', 'nav_v2_get_deal_card', '["uuid"]'::jsonb),
      ('Deal card lite', 'nav_v2_get_deal_card_lite', '["uuid"]'::jsonb),
      ('Deal status options', 'nav_v2_get_deal_status_options', '["uuid"]'::jsonb),
      ('Deal responsibility snapshot', 'nav_v2_get_deal_responsibility_snapshot', '["uuid"]'::jsonb),
      ('Lawyer queue', 'nav_v2_get_lawyer_queue', '["integer"]'::jsonb),
      ('Lawyer review summary', 'nav_v2_get_lawyer_review_summary', '[]'::jsonb),
      ('Handoff scores', 'nav_v2_get_handoff_scores', '["jsonb"]'::jsonb),
      ('Access audit', 'nav_v2_get_access_audit', '[]'::jsonb),
      ('User list', 'nav_v2_list_users', '[]'::jsonb),
      ('Link user by email', 'nav_v2_link_user_by_email', '["text", "text", "nav_v2_user_role", "uuid", "text"]'::jsonb),
      ('Update user profile', 'nav_v2_update_user_profile', '["uuid", "text", "nav_v2_user_role", "uuid", "text", "boolean"]'::jsonb),
      ('Save wizard result', 'nav_v2_save_wizard_result', '["jsonb"]'::jsonb),
      ('Update deal parties', 'nav_v2_update_deal_parties', '["uuid", "text", "text", "text", "text", "text"]'::jsonb),
      ('Update deal status', 'nav_v2_update_deal_status', '["uuid", "nav_v2_deal_status"]'::jsonb),
      ('Submit SPN rework', 'nav_v2_submit_spn_rework', '["uuid", "text"]'::jsonb),
      ('Return SPN rework', 'nav_v2_return_spn_rework', '["uuid", "text"]'::jsonb),
      ('Add comment', 'nav_v2_add_comment', '["uuid", "text", "text"]'::jsonb),
      ('Add document', 'nav_v2_add_document', '["uuid", "nav_v2_side", "text", "text", "boolean", "boolean", "text", "text"]'::jsonb),
      ('Update document status', 'nav_v2_update_document_status', '["uuid", "text"]'::jsonb),
      ('Update document assignment', 'nav_v2_update_document_assignment', '["uuid", "uuid", "nav_v2_user_role", "date", "boolean", "boolean"]'::jsonb),
      ('Update document workflow', 'nav_v2_update_document_workflow', '["uuid", "text", "uuid", "nav_v2_user_role", "date", "text"]'::jsonb),
      ('Add task', 'nav_v2_add_task', '["uuid", "text", "text", "nav_v2_user_role", "nav_v2_task_priority", "text"]'::jsonb),
      ('Update task status', 'nav_v2_update_task_status', '["uuid", "nav_v2_task_status"]'::jsonb),
      ('Update task due date', 'nav_v2_update_task_due_date', '["uuid", "date"]'::jsonb),
      ('Add risk', 'nav_v2_add_risk', '["uuid", "nav_v2_risk_level", "text", "text", "text", "text", "boolean", "boolean", "nav_v2_user_role"]'::jsonb),
      ('Add expense', 'nav_v2_add_expense', '["uuid", "nav_v2_side", "text", "text", "numeric", "text", "boolean", "boolean", "boolean", "text"]'::jsonb),
      ('Add deal review', 'nav_v2_add_deal_review', '["uuid", "text", "text", "boolean", "boolean"]'::jsonb),
      ('Deal access diagnostics', 'nav_v2_check_deal_access', '["text", "uuid"]'::jsonb),
      ('Data quality dashboard', 'nav_v2_get_data_quality_dashboard', '["integer"]'::jsonb),
      ('Data integrity health', 'nav_v2_get_data_integrity_health', '[]'::jsonb),
      ('RPC grant health', 'nav_v2_get_rpc_grant_health', '[]'::jsonb),
      ('Security hardening health', 'nav_v2_get_security_hardening_health', '[]'::jsonb),
      ('RLS policy health', 'nav_v2_get_rls_policy_health', '[]'::jsonb),
      ('Storage security', 'nav_v2_get_storage_security_health', '[]'::jsonb),
      ('Index health', 'nav_v2_get_index_health', '[]'::jsonb),
      ('Internal RPC lockdown health', 'nav_v2_get_internal_rpc_lockdown_health', '[]'::jsonb),
      ('Seed demo data', 'nav_v2_seed_demo_data', '[]'::jsonb),
      ('Clear demo data', 'nav_v2_clear_demo_data', '[]'::jsonb),
      ('Can view deal', 'nav_v2_can_view_deal', '["uuid", "uuid"]'::jsonb),
      ('Can edit deal', 'nav_v2_can_edit_deal', '["uuid", "uuid"]'::jsonb),
      ('My role', 'nav_v2_my_role', '["uuid"]'::jsonb),
      ('Is owner/admin', 'nav_v2_is_owner_or_admin', '["uuid"]'::jsonb),
      ('Is active user', 'nav_v2_is_active_user', '["uuid"]'::jsonb),
      ('JSONB has helper', 'nav_v2_jsonb_has', '["jsonb", "text"]'::jsonb)
  ), resolved as (
    select e.label, e.function_name, e.arguments, p.oid, p.oid::regprocedure::text as signature,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
      has_function_privilege('public', p.oid, 'EXECUTE') as public_can_execute
    from expected e
    left join pg_proc p on p.oid = to_regprocedure('public.' || e.function_name || '(' || (select coalesce(string_agg(value #>> '{}', ', '), '') from jsonb_array_elements(e.arguments)) || ')')
  ), items as (
    select label, function_name, arguments, oid is not null as exists_in_db, signature,
      coalesce(authenticated_can_execute, false) as authenticated_can_execute,
      coalesce(anon_can_execute, false) as anon_can_execute,
      coalesce(public_can_execute, false) as public_can_execute,
      case
        when oid is null then 'missing_function'
        when coalesce(authenticated_can_execute, false) is false then 'missing_authenticated_execute'
        when coalesce(anon_can_execute, false) is true then 'anon_execute_open'
        when coalesce(public_can_execute, false) is true then 'public_execute_open'
        else null
      end as problem
    from resolved
  )
  select coalesce(jsonb_agg(to_jsonb(items) order by label), '[]'::jsonb),
    count(*) filter (where problem is not null)::int,
    count(*) filter (where problem = 'missing_authenticated_execute')::int,
    count(*) filter (where problem = 'anon_execute_open')::int,
    count(*) filter (where problem = 'public_execute_open')::int
  into v_items, v_problem_count, v_missing_authenticated_count, v_anon_open_count, v_public_open_count
  from items;

  return jsonb_build_object(
    'ok', coalesce(v_problem_count, 0) = 0,
    'checked_at', now(),
    'items', v_items,
    'items_count', jsonb_array_length(v_items),
    'problem_count', coalesce(v_problem_count, 0),
    'missing_authenticated_count', coalesce(v_missing_authenticated_count, 0),
    'anon_open_count', coalesce(v_anon_open_count, 0),
    'public_open_count', coalesce(v_public_open_count, 0)
  );
end;
$$;

revoke all on function public.nav_v2_get_rpc_grant_health() from public;
revoke execute on function public.nav_v2_get_rpc_grant_health() from anon;
grant execute on function public.nav_v2_get_rpc_grant_health() to authenticated;
