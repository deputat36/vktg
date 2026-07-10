create or replace function public.nav_v2_get_internal_rpc_lockdown_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_items jsonb;
  v_open_count integer := 0;
  v_missing_count integer := 0;
  v_private_items jsonb;
  v_private_problem_count integer := 0;
  v_private_missing_count integer := 0;
  v_private_schema_ok boolean;
  v_authenticated_schema_usage boolean;
  v_anon_schema_usage boolean;
  v_service_role_schema_usage boolean;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  select role into v_role
  from public.nav_user_profiles
  where id = v_uid
    and is_active is true;

  if v_role not in ('owner', 'admin') then
    raise exception 'Проверка внутренних RPC доступна только owner/admin' using errcode = '42501';
  end if;

  with expected(title, signature, reason) as (
    values
      ('Проверка статуса сделки', 'public.nav_v2_can_change_deal_status(uuid, nav_v2_deal_status, uuid)', 'internal helper: вызывается из server-side RPC'),
      ('Проверка статуса документа', 'public.nav_v2_can_change_document_status(uuid, text, uuid)', 'internal helper: вызывается из server-side RPC'),
      ('Проверка статуса задачи', 'public.nav_v2_can_change_task_status(uuid, uuid)', 'internal helper: вызывается из server-side RPC'),
      ('Очистка демо-данных unchecked', 'public.nav_v2_clear_demo_data_unchecked_20260622()', 'internal unchecked helper: не должен быть browser RPC'),
      ('Защита профиля', 'public.nav_v2_guard_profile_self_escalation()', 'trigger function: не должен быть browser RPC'),
      ('Синхронизация качества сделки', 'public.nav_v2_sync_deal_quality_tasks(uuid)', 'trigger/helper function: не должен быть browser RPC'),
      ('Триггер качества сделки', 'public.nav_v2_deal_quality_tasks_trigger()', 'trigger function: не должен быть browser RPC'),
      ('Счетчик разрывов передачи', 'public.nav_v2_handoff_gap_count(uuid)', 'internal helper: вызывается из server-side RPC'),
      ('Seed демо-данных unchecked', 'public.nav_v2_seed_demo_data_unchecked_20260622()', 'internal unchecked helper: не должен быть browser RPC'),
      ('Автосрок задачи', 'public.nav_v2_set_auto_task_due_date()', 'trigger function: не должен быть browser RPC'),
      ('updated_at trigger', 'public.nav_v2_touch_updated_at()', 'trigger function: не должен быть browser RPC')
  ), resolved as (
    select title, signature, reason, to_regprocedure(signature) as oid
    from expected
  ), checked as (
    select
      title,
      signature,
      reason,
      oid is not null as exists_in_db,
      case when oid is null then false else has_function_privilege('authenticated', oid, 'EXECUTE') end as authenticated_can_execute,
      case when oid is null then false else has_function_privilege('anon', oid, 'EXECUTE') end as anon_can_execute,
      case when oid is null then false else has_function_privilege('public', oid, 'EXECUTE') end as public_can_execute
    from resolved
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'title', title,
      'signature', signature,
      'reason', reason,
      'exists_in_db', exists_in_db,
      'authenticated_can_execute', authenticated_can_execute,
      'anon_can_execute', anon_can_execute,
      'public_can_execute', public_can_execute,
      'locked_down', exists_in_db and not authenticated_can_execute and not anon_can_execute and not public_can_execute
    ) order by title), '[]'::jsonb),
    count(*) filter (where not exists_in_db),
    count(*) filter (where exists_in_db and (authenticated_can_execute or anon_can_execute or public_can_execute))
  into v_items, v_missing_count, v_open_count
  from checked;

  select
    has_schema_privilege('authenticated', 'nav_v2_private', 'USAGE'),
    has_schema_privilege('anon', 'nav_v2_private', 'USAGE'),
    has_schema_privilege('service_role', 'nav_v2_private', 'USAGE')
  into
    v_authenticated_schema_usage,
    v_anon_schema_usage,
    v_service_role_schema_usage;

  v_private_schema_ok :=
    v_authenticated_schema_usage
    and not v_anon_schema_usage
    and v_service_role_schema_usage;

  with expected(
    title,
    signature,
    public_signature,
    mode,
    expected_authenticated_execute,
    reason
  ) as (
    values
      ('Guard обязательного менеджера СПН', 'nav_v2_private.nav_v2_guard_active_spn_manager()', 'public.nav_v2_guard_active_spn_manager()', 'trigger_helper', false, 'trigger helper: прямой authenticated EXECUTE не нужен'),
      ('Активный пользователь', 'nav_v2_private.nav_v2_is_active_user(uuid)', 'public.nav_v2_is_active_user(uuid)', 'rls_helper', true, 'RLS helper: authenticated EXECUTE нужен только внутри policies'),
      ('Роль пользователя', 'nav_v2_private.nav_v2_my_role(uuid)', 'public.nav_v2_my_role(uuid)', 'rls_helper', true, 'RLS/helper function: public endpoint отсутствует'),
      ('Owner/admin gate', 'nav_v2_private.nav_v2_is_owner_or_admin(uuid)', 'public.nav_v2_is_owner_or_admin(uuid)', 'rls_helper', true, 'RLS/helper function: public endpoint отсутствует'),
      ('Просмотр сделки', 'nav_v2_private.nav_v2_can_view_deal(uuid, uuid)', 'public.nav_v2_can_view_deal(uuid, uuid)', 'rls_helper', true, 'RLS access helper: public endpoint отсутствует'),
      ('Редактирование сделки', 'nav_v2_private.nav_v2_can_edit_deal(uuid, uuid)', 'public.nav_v2_can_edit_deal(uuid, uuid)', 'rls_helper', true, 'RLS access helper: public endpoint отсутствует')
  ), resolved as (
    select
      title,
      signature,
      public_signature,
      mode,
      expected_authenticated_execute,
      reason,
      to_regprocedure(signature) as oid,
      to_regprocedure(public_signature) as public_oid
    from expected
  ), checked as (
    select
      title,
      signature,
      public_signature,
      mode,
      expected_authenticated_execute,
      reason,
      oid is not null as exists_in_db,
      public_oid is null as public_absent,
      case when oid is null then false else has_function_privilege('authenticated', oid, 'EXECUTE') end as authenticated_can_execute,
      case when oid is null then false else has_function_privilege('anon', oid, 'EXECUTE') end as anon_can_execute,
      case when oid is null then false else has_function_privilege('public', oid, 'EXECUTE') end as public_can_execute,
      case when oid is null then false else has_function_privilege('service_role', oid, 'EXECUTE') end as service_role_can_execute
    from resolved
  ), evaluated as (
    select *,
      exists_in_db
      and public_absent
      and authenticated_can_execute = expected_authenticated_execute
      and not anon_can_execute
      and not public_can_execute
      and service_role_can_execute as healthy
    from checked
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'title', title,
      'signature', signature,
      'public_signature', public_signature,
      'mode', mode,
      'reason', reason,
      'exists_in_db', exists_in_db,
      'public_absent', public_absent,
      'expected_authenticated_execute', expected_authenticated_execute,
      'authenticated_can_execute', authenticated_can_execute,
      'anon_can_execute', anon_can_execute,
      'public_can_execute', public_can_execute,
      'service_role_can_execute', service_role_can_execute,
      'healthy', healthy
    ) order by title), '[]'::jsonb),
    count(*) filter (where not exists_in_db),
    count(*) filter (where not healthy)
  into v_private_items, v_private_missing_count, v_private_problem_count
  from evaluated;

  return jsonb_build_object(
    'ok',
      v_missing_count = 0
      and v_open_count = 0
      and v_private_problem_count = 0
      and v_private_schema_ok,
    'checked_at', now(),
    'missing_count', v_missing_count,
    'open_count', v_open_count,
    'items_count', jsonb_array_length(v_items),
    'items', v_items,
    'private_missing_count', v_private_missing_count,
    'private_problem_count', v_private_problem_count,
    'private_items_count', jsonb_array_length(v_private_items),
    'private_items', v_private_items,
    'private_schema_ok', v_private_schema_ok,
    'authenticated_schema_usage', v_authenticated_schema_usage,
    'anon_schema_usage', v_anon_schema_usage,
    'service_role_schema_usage', v_service_role_schema_usage,
    'note', 'Locked-down public helpers and private RLS/trigger helpers are checked separately.'
  );
end;
$$;

revoke all on function public.nav_v2_get_internal_rpc_lockdown_health() from public, anon;
grant execute on function public.nav_v2_get_internal_rpc_lockdown_health() to authenticated, service_role;
