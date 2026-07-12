create schema if not exists nav_v2_private;

revoke all on schema nav_v2_private from public, anon;
grant usage on schema nav_v2_private to authenticated, service_role;

alter default privileges for role postgres in schema nav_v2_private
  revoke execute on functions from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.nav_v2_is_active_user(uuid)') is not null then
    alter function public.nav_v2_is_active_user(uuid) set schema nav_v2_private;
  end if;
end
$$;

revoke all on function nav_v2_private.nav_v2_is_active_user(uuid) from public, anon, authenticated;
grant execute on function nav_v2_private.nav_v2_is_active_user(uuid) to authenticated, service_role;

drop policy if exists nav_v2_deals_insert on public.nav_deals_v2;
create policy nav_v2_deals_insert
on public.nav_deals_v2
for insert
to authenticated
with check (
  (select nav_v2_private.nav_v2_is_active_user((select auth.uid())))
  and created_by = (select auth.uid())
);

create or replace function public.nav_v2_get_rpc_grant_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_items jsonb;
  v_problem_count integer := 0;
  v_missing_count integer := 0;
  v_duplicate_count integer := 0;
  v_missing_authenticated_count integer := 0;
  v_anon_open_count integer := 0;
  v_public_open_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.nav_user_profiles p
    where p.id = v_uid
      and p.is_active is true
      and p.role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role)
  ) then
    raise exception 'Проверка RPC доступна только owner/admin' using errcode = '42501';
  end if;

  with expected(category, function_name) as (
    values
      ('frontend_api', 'nav_v2_get_my_profile'),
      ('frontend_api', 'nav_v2_get_dashboard'),
      ('frontend_api', 'nav_v2_get_deals_list'),
      ('frontend_api', 'nav_v2_get_operational_readiness_preview'),
      ('frontend_api', 'nav_v2_get_task_taxonomy_preview'),
      ('frontend_api', 'nav_v2_get_broker_queue_preview'),
      ('frontend_api', 'nav_v2_get_handoff_scores'),
      ('frontend_api', 'nav_v2_get_deal_card'),
      ('frontend_api', 'nav_v2_get_deal_card_lite'),
      ('frontend_api', 'nav_v2_get_deal_responsibility_snapshot'),
      ('frontend_api', 'nav_v2_get_deal_status_options'),
      ('frontend_api', 'nav_v2_update_deal_parties'),
      ('frontend_api', 'nav_v2_update_deal_status'),
      ('frontend_api', 'nav_v2_add_comment'),
      ('frontend_api', 'nav_v2_add_deal_review'),
      ('frontend_api', 'nav_v2_return_spn_rework'),
      ('frontend_api', 'nav_v2_submit_spn_rework'),
      ('frontend_api', 'nav_v2_add_document'),
      ('frontend_api', 'nav_v2_update_document_status'),
      ('frontend_api', 'nav_v2_update_document_assignment'),
      ('frontend_api', 'nav_v2_update_document_workflow'),
      ('frontend_api', 'nav_v2_add_task'),
      ('frontend_api', 'nav_v2_update_task_status'),
      ('frontend_api', 'nav_v2_update_task_due_date'),
      ('frontend_api', 'nav_v2_add_risk'),
      ('frontend_api', 'nav_v2_update_risk_resolution'),
      ('frontend_api', 'nav_v2_add_expense'),
      ('frontend_api', 'nav_v2_save_wizard_result'),
      ('frontend_api', 'nav_v2_get_lawyer_queue'),
      ('frontend_api', 'nav_v2_get_lawyer_review_summary'),
      ('admin_api', 'nav_v2_list_users'),
      ('admin_api', 'nav_v2_link_user_by_email'),
      ('admin_api', 'nav_v2_update_user_profile'),
      ('admin_api', 'nav_v2_check_deal_access'),
      ('admin_api', 'nav_v2_get_access_audit'),
      ('admin_api', 'nav_v2_get_data_quality_dashboard'),
      ('admin_api', 'nav_v2_get_team_profile_quality_health'),
      ('admin_api', 'nav_v2_get_data_integrity_health'),
      ('admin_api', 'nav_v2_get_frontend_rpc_coverage_health'),
      ('admin_api', 'nav_v2_get_frontend_coverage_health'),
      ('admin_api', 'nav_v2_get_rpc_grant_health'),
      ('admin_api', 'nav_v2_get_security_hardening_health'),
      ('admin_api', 'nav_v2_get_rls_policy_health'),
      ('admin_api', 'nav_v2_get_storage_security_health'),
      ('admin_api', 'nav_v2_get_index_health'),
      ('admin_api', 'nav_v2_get_internal_rpc_lockdown_health'),
      ('demo_api', 'nav_v2_seed_demo_data'),
      ('demo_api', 'nav_v2_clear_demo_data')
  ), matched as (
    select
      e.category,
      e.function_name,
      p.oid,
      case when p.oid is null then null else format(
        '%I.%I(%s)',
        n.nspname,
        p.proname,
        pg_get_function_identity_arguments(p.oid)
      ) end as signature,
      case when p.oid is null then false else has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_can_execute,
      case when p.oid is null then false else has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_can_execute,
      case when p.oid is null then false else has_function_privilege('public', p.oid, 'EXECUTE') end as public_can_execute
    from expected e
    left join pg_proc p on p.proname = e.function_name
    left join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.oid is null or n.nspname = 'public'
  ), summarized as (
    select
      category,
      function_name,
      count(oid)::integer as overload_count,
      coalesce(jsonb_agg(signature order by signature) filter (where oid is not null), '[]'::jsonb) as signatures,
      coalesce(bool_and(authenticated_can_execute) filter (where oid is not null), false) as authenticated_can_execute,
      coalesce(bool_or(anon_can_execute) filter (where oid is not null), false) as anon_can_execute,
      coalesce(bool_or(public_can_execute) filter (where oid is not null), false) as public_can_execute
    from matched
    group by category, function_name
  ), items as (
    select
      category,
      function_name as title,
      function_name,
      overload_count = 1 as exists_in_db,
      overload_count,
      case
        when jsonb_array_length(signatures) = 1 then signatures ->> 0
        else function_name
      end as signature,
      signatures,
      authenticated_can_execute,
      anon_can_execute,
      public_can_execute,
      case
        when overload_count = 0 then 'missing_function'
        when overload_count > 1 then 'unexpected_overload_count'
        when not authenticated_can_execute then 'missing_authenticated_execute'
        when anon_can_execute then 'anon_execute_open'
        when public_can_execute then 'public_execute_open'
        else null
      end as problem
    from summarized
  )
  select
    coalesce(jsonb_agg(to_jsonb(items) order by category, function_name), '[]'::jsonb),
    count(*) filter (where problem is not null)::integer,
    count(*) filter (where problem = 'missing_function')::integer,
    count(*) filter (where problem = 'unexpected_overload_count')::integer,
    count(*) filter (where problem = 'missing_authenticated_execute')::integer,
    count(*) filter (where problem = 'anon_execute_open')::integer,
    count(*) filter (where problem = 'public_execute_open')::integer
  into
    v_items,
    v_problem_count,
    v_missing_count,
    v_duplicate_count,
    v_missing_authenticated_count,
    v_anon_open_count,
    v_public_open_count
  from items;

  return jsonb_build_object(
    'ok', coalesce(v_problem_count, 0) = 0,
    'checked_at', now(),
    'items', v_items,
    'items_count', jsonb_array_length(v_items),
    'problem_count', coalesce(v_problem_count, 0),
    'missing_count', coalesce(v_missing_count, 0),
    'duplicate_count', coalesce(v_duplicate_count, 0),
    'missing_authenticated_count', coalesce(v_missing_authenticated_count, 0),
    'anon_open_count', coalesce(v_anon_open_count, 0),
    'public_open_count', coalesce(v_public_open_count, 0),
    'scope', 'browser_callable_only'
  );
end;
$$;

revoke all on function public.nav_v2_get_rpc_grant_health() from public, anon;
grant execute on function public.nav_v2_get_rpc_grant_health() to authenticated, service_role;

notify pgrst, 'reload schema';
