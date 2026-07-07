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

  return jsonb_build_object(
    'ok', v_missing_count = 0 and v_open_count = 0,
    'checked_at', now(),
    'missing_count', v_missing_count,
    'open_count', v_open_count,
    'items_count', jsonb_array_length(v_items),
    'items', v_items,
    'note', 'Browser-callable owner/admin demo RPC are checked by nav_v2_get_rpc_grant_health(), not by internal lockdown.'
  );
end;
$$;

revoke all on function public.nav_v2_get_internal_rpc_lockdown_health() from public;
revoke execute on function public.nav_v2_get_internal_rpc_lockdown_health() from anon;
grant execute on function public.nav_v2_get_internal_rpc_lockdown_health() to authenticated;
