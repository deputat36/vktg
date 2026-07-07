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
  ), nav_views as (
    select
      c.oid,
      n.nspname as schema_name,
      c.relname as view_name,
      c.relkind,
      coalesce(c.reloptions, array[]::text[]) as reloptions,
      exists (
        select 1
        from unnest(coalesce(c.reloptions, array[]::text[])) opt
        where opt = 'security_invoker=true'
      ) as security_invoker
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v', 'm')
      and (
        c.relname like 'nav\_%' escape '\'
        or c.relname like 'nav\_v2\_%' escape '\'
      )
      and c.relname not like 'leader\_%' escape '\'
      and c.relname not like 'parket\_%' escape '\'
  ), view_grants as (
    select
      oid,
      has_table_privilege('anon', oid, 'select') as anon_select,
      has_table_privilege('public', oid, 'select') as public_select,
      has_table_privilege('authenticated', oid, 'select') as authenticated_select
    from nav_views
  ), view_problems as (
    select
      view_name,
      case when relkind = 'm' then 'materialized_view' else 'view' end as kind,
      security_invoker,
      reloptions,
      anon_select,
      public_select,
      authenticated_select,
      case
        when anon_select or public_select then 'anon_or_public_select'
        when relkind = 'v' and authenticated_select and not security_invoker then 'authenticated_select_without_security_invoker'
        when relkind = 'm' and authenticated_select then 'authenticated_select_on_materialized_view'
        else 'unknown'
      end as reason
    from nav_views
    join view_grants using (oid)
    where anon_select
       or public_select
       or (relkind = 'v' and authenticated_select and not security_invoker)
       or (relkind = 'm' and authenticated_select)
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
      and (select count(*) from view_problems) = 0
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
    'views', jsonb_build_object(
      'checked_count', (select count(*) from nav_views),
      'security_invoker_count', (select count(*) from nav_views where security_invoker),
      'anon_or_public_open_count', (select count(*) from view_grants where anon_select or public_select),
      'authenticated_non_invoker_view_count', (
        select count(*)
        from nav_views
        join view_grants using (oid)
        where relkind = 'v'
          and authenticated_select
          and not security_invoker
      ),
      'authenticated_materialized_view_count', (
        select count(*)
        from nav_views
        join view_grants using (oid)
        where relkind = 'm'
          and authenticated_select
      ),
      'problems', coalesce((select jsonb_agg(to_jsonb(view_problems) order by view_name) from view_problems), '[]'::jsonb)
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
