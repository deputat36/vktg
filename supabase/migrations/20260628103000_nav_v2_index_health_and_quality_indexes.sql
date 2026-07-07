create index if not exists nav_deal_tasks_v2_auto_quality_counts_idx
  on public.nav_deal_tasks_v2 (source, status, priority)
  where source like 'auto_quality_%';

create unique index if not exists nav_deal_tasks_v2_open_auto_quality_unique_idx
  on public.nav_deal_tasks_v2 (deal_id, source)
  where source like 'auto_quality_%'
    and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status);

create index if not exists nav_deal_participants_v2_view_lookup_idx
  on public.nav_deal_participants_v2 (deal_id, user_id)
  where can_view is true;

create index if not exists nav_deal_participants_v2_edit_lookup_idx
  on public.nav_deal_participants_v2 (deal_id, user_id)
  where can_edit is true;

create or replace function public.nav_v2_get_index_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_expected jsonb;
  v_existing jsonb;
  v_missing_count int;
  v_invalid_count int;
  v_problem_count int;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  if not public.nav_v2_is_owner_or_admin(v_uid) then
    raise exception 'Проверка индексов доступна только owner/admin' using errcode = '42501';
  end if;

  with expected(index_name, table_name, purpose, severity) as (
    values
      ('nav_deal_tasks_v2_auto_quality_counts_idx', 'nav_deal_tasks_v2', 'Ускоряет агрегаты качества данных по auto_quality_* задачам', 'warning'),
      ('nav_deal_tasks_v2_open_auto_quality_unique_idx', 'nav_deal_tasks_v2', 'Предотвращает дубли открытых auto_quality задач и ускоряет sync-проверки', 'critical'),
      ('nav_deal_participants_v2_view_lookup_idx', 'nav_deal_participants_v2', 'Ускоряет RLS/RPC проверку can_view участника сделки', 'warning'),
      ('nav_deal_participants_v2_edit_lookup_idx', 'nav_deal_participants_v2', 'Ускоряет RLS/RPC проверку can_edit участника сделки', 'warning')
  ), index_state as (
    select
      e.index_name,
      e.table_name,
      e.purpose,
      e.severity,
      idx.oid is not null as exists_in_db,
      coalesce(i.indisvalid, false) as is_valid,
      coalesce(i.indisready, false) as is_ready,
      coalesce(i.indisunique, false) as is_unique,
      pg_get_indexdef(idx.oid) as indexdef
    from expected e
    left join pg_class idx on idx.oid = to_regclass('public.' || e.index_name)
    left join pg_index i on i.indexrelid = idx.oid
  )
  select
    coalesce(jsonb_agg(to_jsonb(index_state) order by table_name, index_name), '[]'::jsonb),
    count(*) filter (where exists_in_db is not true)::int,
    count(*) filter (where exists_in_db is true and is_valid is not true)::int
  into v_expected, v_missing_count, v_invalid_count
  from index_state;

  select coalesce(jsonb_agg(jsonb_build_object(
    'table_name', pi.tablename,
    'index_name', pi.indexname,
    'indexdef', pi.indexdef
  ) order by pi.tablename, pi.indexname), '[]'::jsonb)
  into v_existing
  from pg_indexes pi
  where pi.schemaname = 'public'
    and pi.tablename in ('nav_deal_tasks_v2', 'nav_deal_participants_v2', 'nav_deals_v2', 'nav_deal_documents_v2')
    and pi.indexname like 'nav\_%' escape '\';

  v_problem_count := coalesce(v_missing_count, 0) + coalesce(v_invalid_count, 0);

  return jsonb_build_object(
    'ok', v_problem_count = 0,
    'checked_at', now(),
    'expected_count', jsonb_array_length(v_expected),
    'missing_count', coalesce(v_missing_count, 0),
    'invalid_count', coalesce(v_invalid_count, 0),
    'problem_count', v_problem_count,
    'expected_indexes', v_expected,
    'existing_indexes', v_existing
  );
end;
$$;

revoke all on function public.nav_v2_get_index_health() from public;
revoke execute on function public.nav_v2_get_index_health() from anon;
grant execute on function public.nav_v2_get_index_health() to authenticated;

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
    select
      e.label,
      e.function_name,
      e.arguments,
      p.oid,
      p.oid::regprocedure::text as signature,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
      has_function_privilege('public', p.oid, 'EXECUTE') as public_can_execute
    from expected e
    left join pg_proc p on p.oid = to_regprocedure(
      'public.' || e.function_name || '(' || (
        select coalesce(string_agg(value #>> '{}', ', '), '')
        from jsonb_array_elements(e.arguments)
      ) || ')'
    )
  ), items as (
    select
      label,
      function_name,
      arguments,
      oid is not null as exists_in_db,
      signature,
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
  select
    coalesce(jsonb_agg(to_jsonb(items) order by label), '[]'::jsonb),
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
