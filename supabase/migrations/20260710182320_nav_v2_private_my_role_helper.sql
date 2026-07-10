alter function public.nav_v2_my_role(uuid) set schema nav_v2_private;

revoke all on function nav_v2_private.nav_v2_my_role(uuid) from public, anon, authenticated;
grant execute on function nav_v2_private.nav_v2_my_role(uuid) to authenticated, service_role;

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
      and pg_get_functiondef(p.oid) like '%public.nav_v2_my_role%'
  loop
    execute replace(r.definition, 'public.nav_v2_my_role', 'nav_v2_private.nav_v2_my_role');
  end loop;
end
$$;

do $$
declare
  v_remaining_function_refs integer;
  v_remaining_policy_refs integer;
  v_private_policy_refs integer;
begin
  if to_regprocedure('public.nav_v2_my_role(uuid)') is not null then
    raise exception 'public.nav_v2_my_role(uuid) still exists after private migration';
  end if;

  if to_regprocedure('nav_v2_private.nav_v2_my_role(uuid)') is null then
    raise exception 'nav_v2_private.nav_v2_my_role(uuid) is missing after migration';
  end if;

  select count(*) into v_remaining_function_refs
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where p.prokind='f'
    and n.nspname not in ('pg_catalog','information_schema')
    and pg_get_functiondef(p.oid) like '%public.nav_v2_my_role%';

  if v_remaining_function_refs <> 0 then
    raise exception 'Found % function definitions with stale public.nav_v2_my_role reference', v_remaining_function_refs;
  end if;

  select count(*) into v_remaining_policy_refs
  from pg_policies
  where (coalesce(qual,'') || ' ' || coalesce(with_check,'')) like '%public.nav_v2_my_role%';

  if v_remaining_policy_refs <> 0 then
    raise exception 'Found % policies with stale public.nav_v2_my_role reference', v_remaining_policy_refs;
  end if;

  select count(*) into v_private_policy_refs
  from pg_policies
  where (coalesce(qual,'') || ' ' || coalesce(with_check,'')) like '%nav_v2_private.nav_v2_my_role%';

  if v_private_policy_refs <> 2 then
    raise exception 'Expected 2 policies using private my_role helper, found %', v_private_policy_refs;
  end if;

  if not has_schema_privilege('authenticated','nav_v2_private','USAGE') then
    raise exception 'authenticated lacks USAGE on nav_v2_private';
  end if;

  if not has_function_privilege('authenticated','nav_v2_private.nav_v2_my_role(uuid)','EXECUTE') then
    raise exception 'authenticated lacks EXECUTE on private my_role helper';
  end if;

  if has_function_privilege('anon','nav_v2_private.nav_v2_my_role(uuid)','EXECUTE')
     or has_function_privilege('public','nav_v2_private.nav_v2_my_role(uuid)','EXECUTE') then
    raise exception 'private my_role helper has unexpected anon/PUBLIC EXECUTE';
  end if;
end
$$;

notify pgrst, 'reload schema';
