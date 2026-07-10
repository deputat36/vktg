alter function public.nav_v2_can_view_deal(uuid,uuid) set schema nav_v2_private;

revoke all on function nav_v2_private.nav_v2_can_view_deal(uuid,uuid) from public, anon, authenticated;
grant execute on function nav_v2_private.nav_v2_can_view_deal(uuid,uuid) to authenticated, service_role;

do $$
declare
  r record;
begin
  for r in
    select pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where p.prokind='f'
      and n.nspname not in ('pg_catalog','information_schema','nav_v2_private')
      and pg_get_functiondef(p.oid) like '%public.nav_v2_can_view_deal%'
  loop
    execute replace(r.definition,'public.nav_v2_can_view_deal','nav_v2_private.nav_v2_can_view_deal');
  end loop;
end
$$;

do $$
declare
  v_functions integer;
  v_policies integer;
  v_private_policies integer;
begin
  if to_regprocedure('public.nav_v2_can_view_deal(uuid,uuid)') is not null then
    raise exception 'public can_view helper still exists';
  end if;
  if to_regprocedure('nav_v2_private.nav_v2_can_view_deal(uuid,uuid)') is null then
    raise exception 'private can_view helper is missing';
  end if;

  select count(*) into v_functions
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prokind='f'
    and n.nspname not in ('pg_catalog','information_schema')
    and pg_get_functiondef(p.oid) like '%public.nav_v2_can_view_deal%';
  if v_functions <> 0 then
    raise exception 'Found % stale can_view function references',v_functions;
  end if;

  select count(*) into v_policies
  from pg_policies
  where (coalesce(qual,'')||' '||coalesce(with_check,'')) like '%public.nav_v2_can_view_deal%';
  if v_policies <> 0 then
    raise exception 'Found % stale can_view policy references',v_policies;
  end if;

  select count(*) into v_private_policies
  from pg_policies
  where (coalesce(qual,'')||' '||coalesce(with_check,'')) like '%nav_v2_private.nav_v2_can_view_deal%';
  if v_private_policies <> 12 then
    raise exception 'Expected 12 private can_view policies, found %',v_private_policies;
  end if;

  if not has_function_privilege('authenticated','nav_v2_private.nav_v2_can_view_deal(uuid,uuid)','EXECUTE') then
    raise exception 'authenticated lacks can_view EXECUTE';
  end if;
  if has_function_privilege('anon','nav_v2_private.nav_v2_can_view_deal(uuid,uuid)','EXECUTE')
     or has_function_privilege('public','nav_v2_private.nav_v2_can_view_deal(uuid,uuid)','EXECUTE') then
    raise exception 'can_view has unexpected anon/PUBLIC EXECUTE';
  end if;
end
$$;

notify pgrst, 'reload schema';
