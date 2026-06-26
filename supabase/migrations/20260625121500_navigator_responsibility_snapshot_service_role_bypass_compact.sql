do $$
declare s text;
begin
  select pg_get_functiondef('public.nav_v2_get_deal_responsibility_snapshot(uuid)'::regprocedure) into s;
  if position('v_is_service boolean' in s)=0 then
    s := replace(s, 'v_uid uuid := auth.uid();', 'v_uid uuid := auth.uid();'||chr(10)||'  v_is_service boolean := coalesce(current_setting(''request.jwt.claim.role'', true), '''') = ''service_role'';');
  end if;
  s := replace(s, 'if v_uid is null and coalesce(current_setting(''request.jwt.claim.role'', true), '''') <> ''service_role'' then', 'if v_uid is null and not v_is_service then');
  s := replace(s, 'if not public.nav_v2_can_view_deal(p_deal_id, v_uid) then', 'if not v_is_service and not public.nav_v2_can_view_deal(p_deal_id, v_uid) then');
  execute s;
end $$;
