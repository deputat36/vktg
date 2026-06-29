create or replace function public.nav_v2_get_frontend_rpc_coverage_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_items jsonb;
  v_problem_count int;
  v_missing_count int;
  v_missing_authenticated_count int;
  v_anon_open_count int;
  v_public_open_count int;
  v_not_in_grant_health_count int;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  if not public.nav_v2_is_owner_or_admin(v_uid) then
    raise exception 'Проверка frontend RPC доступна только owner/admin' using errcode = '42501';
  end if;

  with frontend(function_name, source_label) as (
    values
      ('nav_v2_get_my_profile', 'profile/admin-loader/diagnostics'),
      ('nav_v2_get_dashboard', 'nav-system-check'),
      ('nav_v2_get_deals_list', 'dashboard/deals/spn/admin/system'),
      ('nav_v2_get_deal_card', 'deal-card/check/safe'),
      ('nav_v2_get_deal_card_lite', 'deal-card-check/safe/guards/recovery'),
      ('nav_v2_get_deal_responsibility_snapshot', 'deal-card responsibility snapshot'),
      ('nav_v2_save_wizard_result', 'spn wizard'),
      ('nav_v2_update_deal_status', 'deal card'),
      ('nav_v2_update_document_workflow', 'deal card'),
      ('nav_v2_update_task_status', 'deal card'),
      ('nav_v2_add_comment', 'deal card'),
      ('nav_v2_add_deal_review', 'deal card lawyer actions'),
      ('nav_v2_return_spn_rework', 'deal card lawyer actions'),
      ('nav_v2_get_lawyer_queue', 'queue-v2'),
      ('nav_v2_get_lawyer_review_summary', 'queue-v2'),
      ('nav_v2_list_users', 'admin/system'),
      ('nav_v2_link_user_by_email', 'admin'),
      ('nav_v2_update_user_profile', 'admin'),
      ('nav_v2_seed_demo_data', 'admin'),
      ('nav_v2_clear_demo_data', 'admin'),
      ('nav_v2_get_data_quality_dashboard', 'admin'),
      ('nav_v2_get_team_profile_quality_health', 'admin'),
      ('nav_v2_check_deal_access', 'admin/deal-access-check'),
      ('nav_v2_get_access_audit', 'nav-access-audit'),
      ('nav_v2_get_rpc_grant_health', 'rpc-grant/system'),
      ('nav_v2_get_security_hardening_health', 'security-hardening'),
      ('nav_v2_get_rls_policy_health', 'security-hardening'),
      ('nav_v2_get_storage_security_health', 'security-hardening'),
      ('nav_v2_get_index_health', 'security-hardening'),
      ('nav_v2_get_internal_rpc_lockdown_health', 'security-hardening/system'),
      ('nav_v2_get_data_integrity_health', 'security-hardening'),
      ('nav_v2_get_frontend_rpc_coverage_health', 'security-hardening')
  ), resolved as (
    select
      f.function_name,
      f.source_label,
      p.oid,
      p.oid::regprocedure::text as signature,
      case when p.oid is null then false else has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_can_execute,
      case when p.oid is null then false else has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_can_execute,
      case when p.oid is null then false else has_function_privilege('public', p.oid, 'EXECUTE') end as public_can_execute
    from frontend f
    left join pg_proc p
      on p.pronamespace = 'public'::regnamespace
     and p.proname = f.function_name
  ), grouped as (
    select
      function_name,
      min(source_label) as source_label,
      bool_or(oid is not null) as exists_in_db,
      coalesce(bool_or(authenticated_can_execute) filter (where oid is not null), false) as authenticated_can_execute,
      coalesce(bool_or(anon_can_execute) filter (where oid is not null), false) as anon_can_execute,
      coalesce(bool_or(public_can_execute) filter (where oid is not null), false) as public_can_execute,
      coalesce(jsonb_agg(signature order by signature) filter (where oid is not null), '[]'::jsonb) as signatures
    from resolved
    group by function_name
  ), grant_health_items as (
    select item->>'function_name' as function_name
    from jsonb_array_elements(public.nav_v2_get_rpc_grant_health()->'items') item
  ), items as (
    select
      g.*,
      h.function_name is not null as in_rpc_grant_health,
      case
        when not g.exists_in_db then 'missing_function'
        when not g.authenticated_can_execute then 'missing_authenticated_execute'
        when g.anon_can_execute then 'anon_execute_open'
        when g.public_can_execute then 'public_execute_open'
        when h.function_name is null then 'not_in_rpc_grant_health'
        else null
      end as problem
    from grouped g
    left join grant_health_items h on h.function_name = g.function_name
  )
  select
    coalesce(jsonb_agg(to_jsonb(items) order by function_name), '[]'::jsonb),
    count(*) filter (where problem is not null)::int,
    count(*) filter (where problem = 'missing_function')::int,
    count(*) filter (where problem = 'missing_authenticated_execute')::int,
    count(*) filter (where problem = 'anon_execute_open')::int,
    count(*) filter (where problem = 'public_execute_open')::int,
    count(*) filter (where problem = 'not_in_rpc_grant_health')::int
  into v_items, v_problem_count, v_missing_count, v_missing_authenticated_count, v_anon_open_count, v_public_open_count, v_not_in_grant_health_count
  from items;

  return jsonb_build_object(
    'ok', coalesce(v_problem_count, 0) = 0,
    'checked_at', now(),
    'items', v_items,
    'items_count', jsonb_array_length(v_items),
    'problem_count', coalesce(v_problem_count, 0),
    'missing_count', coalesce(v_missing_count, 0),
    'missing_authenticated_count', coalesce(v_missing_authenticated_count, 0),
    'anon_open_count', coalesce(v_anon_open_count, 0),
    'public_open_count', coalesce(v_public_open_count, 0),
    'not_in_grant_health_count', coalesce(v_not_in_grant_health_count, 0)
  );
end;
$$;
