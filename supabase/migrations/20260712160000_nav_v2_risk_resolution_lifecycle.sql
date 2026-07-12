alter table public.nav_deal_risks_v2
  add column if not exists updated_at timestamptz;

update public.nav_deal_risks_v2
set updated_at = coalesce(resolved_at, created_at, now())
where updated_at is null;

alter table public.nav_deal_risks_v2
  alter column updated_at set default now(),
  alter column updated_at set not null;

create or replace function public.nav_v2_update_risk_resolution(
  p_risk_id uuid,
  p_is_resolved boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_risk public.nav_deal_risks_v2%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_event_type text;
  v_event_title text;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if p_risk_id is null then
    raise exception 'Не указан риск';
  end if;

  select r.*
  into v_risk
  from public.nav_deal_risks_v2 r
  where r.id = p_risk_id
  for update;

  if not found then
    raise exception 'Риск не найден' using errcode = 'P0002';
  end if;

  if not nav_v2_private.nav_v2_can_view_deal(v_risk.deal_id, v_uid) then
    raise exception 'Нет доступа к рискам сделки' using errcode = '42501';
  end if;

  v_role := nav_v2_private.nav_v2_my_role(v_uid);

  if not nav_v2_private.nav_v2_can_edit_deal(v_risk.deal_id, v_uid)
     and not (
       v_role in ('lawyer'::public.nav_v2_user_role, 'broker'::public.nav_v2_user_role)
       and (v_risk.assigned_role is null or v_risk.assigned_role = v_role)
     ) then
    raise exception 'Нет прав менять состояние риска' using errcode = '42501';
  end if;

  if v_risk.is_resolved is not distinct from p_is_resolved then
    return jsonb_build_object(
      'changed', false,
      'risk_id', v_risk.id,
      'deal_id', v_risk.deal_id,
      'is_resolved', v_risk.is_resolved,
      'resolved_at', v_risk.resolved_at,
      'resolved_by', v_risk.resolved_by,
      'updated_at', v_risk.updated_at
    );
  end if;

  update public.nav_deal_risks_v2
  set
    is_resolved = p_is_resolved,
    resolved_at = case when p_is_resolved then now() else null end,
    resolved_by = case when p_is_resolved then v_uid else null end,
    updated_at = now()
  where id = v_risk.id
  returning * into v_risk;

  v_event_type := case when p_is_resolved then 'risk_resolved' else 'risk_reopened' end;
  v_event_title := case when p_is_resolved then 'Риск устранён' else 'Риск возвращён в работу' end;

  insert into public.nav_deal_events_v2 (
    deal_id,
    actor_id,
    event_type,
    event_title,
    event_data
  ) values (
    v_risk.deal_id,
    v_uid,
    v_event_type,
    v_event_title,
    jsonb_strip_nulls(jsonb_build_object(
      'risk_id', v_risk.id,
      'risk_title', v_risk.title,
      'is_resolved', v_risk.is_resolved,
      'assigned_role', v_risk.assigned_role,
      'note', v_note
    ))
  );

  return jsonb_build_object(
    'changed', true,
    'risk_id', v_risk.id,
    'deal_id', v_risk.deal_id,
    'is_resolved', v_risk.is_resolved,
    'resolved_at', v_risk.resolved_at,
    'resolved_by', v_risk.resolved_by,
    'updated_at', v_risk.updated_at
  );
end;
$function$;

revoke all on function public.nav_v2_update_risk_resolution(uuid, boolean, text) from public;
revoke execute on function public.nav_v2_update_risk_resolution(uuid, boolean, text) from anon;
grant execute on function public.nav_v2_update_risk_resolution(uuid, boolean, text) to authenticated, service_role;

comment on function public.nav_v2_update_risk_resolution(uuid, boolean, text) is
  'Idempotently resolves or reopens a Navigator v2 risk with role checks and one audit event per actual state change.';

do $migration$
declare
  v_definition text;
  v_marker text;
begin
  select pg_get_functiondef('public.nav_v2_get_rpc_grant_health()'::regprocedure)
  into v_definition;

  v_marker := '(''frontend_api'', ''nav_v2_add_risk''),';
  if position(v_marker in v_definition) = 0 then
    raise exception 'RPC grant health marker not found';
  end if;

  if position('nav_v2_update_risk_resolution' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      v_marker,
      v_marker || E'\n      (''frontend_api'', ''nav_v2_update_risk_resolution''),'
    );
    execute v_definition;
  end if;

  select pg_get_functiondef('public.nav_v2_get_frontend_rpc_coverage_health()'::regprocedure)
  into v_definition;

  v_marker := '(''nav_v2_update_task_due_date'', ''deal-card task due dates''),';
  if position(v_marker in v_definition) = 0 then
    raise exception 'Frontend RPC coverage marker not found';
  end if;

  if position('nav_v2_update_risk_resolution' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      v_marker,
      v_marker || E'\n      (''nav_v2_update_risk_resolution'', ''deal-card risk lifecycle''),'
    );
    execute v_definition;
  end if;
end
$migration$;

notify pgrst, 'reload schema';
