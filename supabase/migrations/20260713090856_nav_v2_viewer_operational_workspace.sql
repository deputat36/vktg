do $migration$
declare
  v_definition text;
  v_old_gate text := $old$if v_role not in ('owner', 'admin', 'manager') then
    raise exception 'Операционная очередь доступна owner, admin и manager' using errcode = '42501';
  end if;$old$;
  v_new_gate text := $new$if v_role not in ('owner', 'admin', 'manager', 'viewer') then
    raise exception 'Операционная готовность доступна руководителю и наблюдателю' using errcode = '42501';
  end if;$new$;
  v_old_scope text := $old$and (
        v_role in ('owner', 'admin')$old$;
  v_new_scope text := $new$and (
        v_role in ('owner', 'admin')
        or (
          v_role = 'viewer'
          and nav_v2_private.nav_v2_can_view_deal(d.id, v_uid)
        )$new$;
begin
  select pg_get_functiondef('public.nav_v2_get_operational_readiness_preview(integer)'::regprocedure)
  into v_definition;

  if v_definition is null then
    raise exception 'nav_v2_get_operational_readiness_preview(integer) is missing';
  end if;
  if position(v_old_gate in v_definition) = 0 then
    raise exception 'operational readiness role gate drifted';
  end if;
  if position(v_old_scope in v_definition) = 0 then
    raise exception 'operational readiness deal scope drifted';
  end if;

  v_definition := replace(v_definition, v_old_gate, v_new_gate);
  v_definition := replace(v_definition, v_old_scope, v_new_scope);
  execute v_definition;
end;
$migration$;

comment on function public.nav_v2_get_operational_readiness_preview(integer) is
  'Read-only operational readiness for owner/admin/manager and a compact viewer workspace; viewer rows remain restricted by nav_v2_can_view_deal.';

notify pgrst, 'reload schema';
