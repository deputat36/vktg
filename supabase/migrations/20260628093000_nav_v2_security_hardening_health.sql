create or replace function public.nav_v2_get_security_hardening_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null or not public.nav_v2_is_owner_or_admin(v_uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with nav_tables as (
    select
      c.oid,
      n.nspname as schema_name,
      c.relname as table_name,
      c.relrowsecurity,
      c.relforcerowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and (
        c.relname like 'nav\_%' escape '\'
        or c.relname like 'nav\_v2\_%' escape '\'
      )
      and c.relname not like 'leader\_%' escape '\'
      and c.relname not like 'parket\_%' escape '\'
  ), table_grants as (
    select
      oid,
      has_table_privilege('anon', oid, 'select') as anon_select,
      has_table_privilege('anon', oid, 'insert') as anon_insert,
      has_table_privilege('anon', oid, 'update') as anon_update,
      has_table_privilege('anon', oid, 'delete') as anon_delete,
      has_table_privilege('public', oid, 'select') as public_select,
      has_table_privilege('public', oid, 'insert') as public_insert,
      has_table_privilege('public', oid, 'update') as public_update,
      has_table_privilege('public', oid, 'delete') as public_delete,
      has_table_privilege('authenticated', oid, 'select') as authenticated_select,
      has_table_privilege('authenticated', oid, 'insert') as authenticated_insert,
      has_table_privilege('authenticated', oid, 'update') as authenticated_update,
      has_table_privilege('authenticated', oid, 'delete') as authenticated_delete
    from nav_tables
  ), table_problems as (
    select
      table_name,
      relrowsecurity as rls_enabled,
      relforcerowsecurity as force_rls,
      jsonb_build_object(
        'select', anon_select,
        'insert', anon_insert,
        'update', anon_update,
        'delete', anon_delete
      ) as anon,
      jsonb_build_object(
        'select', public_select,
        'insert', public_insert,
        'update', public_update,
        'delete', public_delete
      ) as public,
      jsonb_build_object(
        'select', authenticated_select,
        'insert', authenticated_insert,
        'update', authenticated_update,
        'delete', authenticated_delete
      ) as authenticated
    from nav_tables
    join table_grants using (oid)
    where relrowsecurity is not true
       or anon_select or anon_insert or anon_update or anon_delete
       or public_select or public_insert or public_update or public_delete
  ), nav_functions as (
    select
      p.oid,
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_args,
      p.prosecdef as security_definer,
      lower(pg_get_functiondef(p.oid)) as function_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'nav\_%' escape '\'
      and p.proname not like 'leader\_%' escape '\'
      and p.proname not like 'parket\_%' escape '\'
  ), function_grants as (
    select
      oid,
      has_function_privilege('anon', oid, 'execute') as anon_execute,
      has_function_privilege('public', oid, 'execute') as public_execute,
      has_function_privilege('authenticated', oid, 'execute') as authenticated_execute,
      has_function_privilege('service_role', oid, 'execute') as service_role_execute
    from nav_functions
  ), function_problems as (
    select
      function_name,
      identity_args,
      security_definer,
      anon_execute,
      public_execute,
      authenticated_execute,
      service_role_execute,
      (function_def like '%auth.uid(%') as has_auth_uid_check,
      (function_def like '%nav_v2_is_owner_or_admin%' or function_def like '%nav_is_owner_or_admin%') as has_owner_admin_check
    from nav_functions
    join function_grants using (oid)
    where anon_execute or public_execute
  )
  select jsonb_build_object(
    'ok', (
      (select count(*) from table_problems) = 0
      and (select count(*) from function_problems) = 0
    ),
    'checked_at', now(),
    'tables', jsonb_build_object(
      'checked_count', (select count(*) from nav_tables),
      'rls_disabled_count', (select count(*) from nav_tables where relrowsecurity is not true),
      'anon_or_public_open_count', (
        select count(*)
        from table_grants
        where anon_select or anon_insert or anon_update or anon_delete
           or public_select or public_insert or public_update or public_delete
      ),
      'problems', coalesce((select jsonb_agg(to_jsonb(table_problems) order by table_name) from table_problems), '[]'::jsonb)
    ),
    'functions', jsonb_build_object(
      'checked_count', (select count(*) from nav_functions),
      'security_definer_count', (select count(*) from nav_functions where security_definer),
      'anon_or_public_open_count', (select count(*) from function_problems),
      'problems', coalesce((select jsonb_agg(to_jsonb(function_problems) order by function_name, identity_args) from function_problems), '[]'::jsonb)
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.nav_v2_get_security_hardening_health() from public;
revoke all on function public.nav_v2_get_security_hardening_health() from anon;
grant execute on function public.nav_v2_get_security_hardening_health() to authenticated;

drop function if exists public.nav_v2_get_rpc_grant_health();

create or replace function public.nav_v2_get_rpc_grant_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null or not public.nav_v2_is_owner_or_admin(v_uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with expected(function_name, identity_args, category) as (
    values
      ('nav_v2_add_comment', 'p_deal_id uuid, p_body text, p_visibility text', 'deal_api'),
      ('nav_v2_add_deal_comment', 'p_deal_id uuid, p_body text, p_visibility text', 'deal_api'),
      ('nav_v2_bulk_upsert_deal_participants', 'p_deal_id uuid, p_participants jsonb', 'deal_api'),
      ('nav_v2_check_deal_access', 'p_email text, p_deal_id uuid', 'diagnostics'),
      ('nav_v2_clear_demo_data', '', 'demo'),
      ('nav_v2_create_deal', 'p_payload jsonb', 'deal_api'),
      ('nav_v2_create_deal_from_message', 'p_message_id uuid', 'deal_api'),
      ('nav_v2_create_deal_task', 'p_deal_id uuid, p_assignee_id uuid, p_title text, p_due_date timestamp with time zone, p_priority text', 'deal_api'),
      ('nav_v2_create_doc_task', 'p_deal_id uuid, p_document_id uuid, p_title text, p_assignee_id uuid, p_due_date timestamp with time zone', 'deal_api'),
      ('nav_v2_delete_deal', 'p_deal_id uuid', 'deal_api'),
      ('nav_v2_get_access_overview', '', 'admin'),
      ('nav_v2_get_accessibility_dashboard', '', 'admin'),
      ('nav_v2_get_admin_metrics', '', 'admin'),
      ('nav_v2_get_admin_users', '', 'admin'),
      ('nav_v2_get_current_profile', '', 'core'),
      ('nav_v2_get_current_user_profile', '', 'core'),
      ('nav_v2_get_data_quality_dashboard', 'p_limit integer', 'admin'),
      ('nav_v2_get_deal_access_matrix', 'p_deal_id uuid', 'diagnostics'),
      ('nav_v2_get_deal_card', 'p_deal_id uuid', 'deal_api'),
      ('nav_v2_get_deal_card_lite', 'p_deal_id uuid', 'deal_api'),
      ('nav_v2_get_deal_card_status', 'p_deal_id uuid', 'diagnostics'),
      ('nav_v2_get_deal_documents_for_actor', 'p_deal_id uuid', 'deal_api'),
      ('nav_v2_get_deals', 'p_limit integer, p_offset integer, p_status text, p_role text, p_search text', 'deal_api'),
      ('nav_v2_get_inbox_summary', '', 'core'),
      ('nav_v2_get_message_detail', 'p_message_id uuid', 'core'),
      ('nav_v2_get_next_messages', 'p_limit integer', 'core'),
      ('nav_v2_get_role_dashboard', '', 'core'),
      ('nav_v2_get_rpc_grant_health', '', 'diagnostics'),
      ('nav_v2_get_security_hardening_health', '', 'diagnostics'),
      ('nav_v2_get_system_health', '', 'diagnostics'),
      ('nav_v2_list_deal_comments', 'p_deal_id uuid', 'deal_api'),
      ('nav_v2_mark_message_processed', 'p_message_id uuid, p_deal_id uuid', 'core'),
      ('nav_v2_seed_demo_data', '', 'demo'),
      ('nav_v2_set_document_workflow_status', 'p_document_id uuid, p_status text', 'deal_api'),
      ('nav_v2_update_deal_status', 'p_deal_id uuid, p_status text', 'deal_api'),
      ('nav_v2_update_document_status', 'p_document_id uuid, p_status text', 'deal_api'),
      ('nav_v2_update_message_ai_parse', 'p_message_id uuid, p_parse jsonb, p_confidence numeric, p_status text', 'core'),
      ('nav_v2_update_profile_role', 'p_user_id uuid, p_role text, p_is_active boolean', 'admin'),
      ('nav_v2_update_task_status', 'p_task_id uuid, p_status text', 'deal_api')
  ), resolved as (
    select
      e.function_name,
      e.identity_args,
      e.category,
      p.oid,
      p.prosecdef as security_definer
    from expected e
    left join pg_proc p
      on p.proname = e.function_name
     and pg_get_function_identity_arguments(p.oid) = e.identity_args
     and p.pronamespace = 'public'::regnamespace
  ), checks as (
    select
      function_name,
      identity_args,
      category,
      oid is not null as exists,
      security_definer,
      case when oid is null then false else has_function_privilege('authenticated', oid, 'execute') end as authenticated_execute,
      case when oid is null then false else has_function_privilege('anon', oid, 'execute') end as anon_execute,
      case when oid is null then false else has_function_privilege('public', oid, 'execute') end as public_execute
    from resolved
  )
  select jsonb_build_object(
    'ok', bool_and(exists and authenticated_execute and not anon_execute and not public_execute),
    'checked_at', now(),
    'missing_count', count(*) filter (where not exists),
    'missing_authenticated_count', count(*) filter (where exists and not authenticated_execute),
    'anon_open_count', count(*) filter (where exists and anon_execute),
    'public_open_count', count(*) filter (where exists and public_execute),
    'items', coalesce(jsonb_agg(to_jsonb(checks) order by category, function_name, identity_args), '[]'::jsonb)
  ) into v_result
  from checks;

  return v_result;
end;
$$;

revoke all on function public.nav_v2_get_rpc_grant_health() from public;
revoke all on function public.nav_v2_get_rpc_grant_health() from anon;
grant execute on function public.nav_v2_get_rpc_grant_health() to authenticated;
