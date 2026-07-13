alter function public.nav_v2_get_operational_adoption_report(integer, integer)
  set schema nav_v2_private;

alter function nav_v2_private.nav_v2_get_operational_adoption_report(integer, integer)
  rename to nav_v2_get_operational_adoption_report_unchecked_20260713;

revoke all on function nav_v2_private.nav_v2_get_operational_adoption_report_unchecked_20260713(integer, integer)
  from public, anon, authenticated;
grant execute on function nav_v2_private.nav_v2_get_operational_adoption_report_unchecked_20260713(integer, integer)
  to service_role;

create or replace function public.nav_v2_get_operational_adoption_report(
  p_days integer default 30,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.nav_user_profiles p
    where p.id = v_uid
      and p.is_active is true
      and p.role in (
        'owner'::public.nav_v2_user_role,
        'admin'::public.nav_v2_user_role,
        'manager'::public.nav_v2_user_role
      )
  ) then
    raise exception 'Отчёт внедрения доступен владельцу, администратору и менеджеру' using errcode = '42501';
  end if;

  return nav_v2_private.nav_v2_get_operational_adoption_report_unchecked_20260713(
    p_days,
    p_limit
  );
end;
$function$;

revoke all on function public.nav_v2_get_operational_adoption_report(integer, integer) from public;
revoke execute on function public.nav_v2_get_operational_adoption_report(integer, integer) from anon;
grant execute on function public.nav_v2_get_operational_adoption_report(integer, integer)
  to authenticated, service_role;

comment on function public.nav_v2_get_operational_adoption_report(integer, integer) is
  'Role-gated read-only operational adoption report wrapper for active owner/admin/manager profiles.';
comment on function nav_v2_private.nav_v2_get_operational_adoption_report_unchecked_20260713(integer, integer) is
  'Internal read-only adoption report implementation. Browser access is prohibited; use the public role-gated wrapper.';

do $assertions$
declare
  v_wrapper_definition text;
  v_private_oid oid;
  v_public_execute boolean;
  v_anon_execute boolean;
  v_private_authenticated_execute boolean;
  v_private_anon_execute boolean;
  v_private_public_execute boolean;
begin
  select pg_get_functiondef('public.nav_v2_get_operational_adoption_report(integer, integer)'::regprocedure)
  into v_wrapper_definition;

  if position('if not exists' in lower(v_wrapper_definition)) = 0
    or position('p.is_active is true' in lower(v_wrapper_definition)) = 0
    or position("'manager'::public.nav_v2_user_role" in lower(v_wrapper_definition)) = 0
    or position('nav_v2_private.nav_v2_get_operational_adoption_report_unchecked_20260713' in lower(v_wrapper_definition)) = 0 then
    raise exception 'Operational adoption active-profile wrapper drifted';
  end if;

  select 'nav_v2_private.nav_v2_get_operational_adoption_report_unchecked_20260713(integer, integer)'::regprocedure::oid
  into v_private_oid;

  select has_function_privilege('public', 'public.nav_v2_get_operational_adoption_report(integer, integer)', 'EXECUTE')
  into v_public_execute;
  select has_function_privilege('anon', 'public.nav_v2_get_operational_adoption_report(integer, integer)', 'EXECUTE')
  into v_anon_execute;

  select has_function_privilege('authenticated', v_private_oid, 'EXECUTE')
  into v_private_authenticated_execute;
  select has_function_privilege('anon', v_private_oid, 'EXECUTE')
  into v_private_anon_execute;
  select has_function_privilege('public', v_private_oid, 'EXECUTE')
  into v_private_public_execute;

  if v_public_execute or v_anon_execute then
    raise exception 'Operational adoption wrapper must remain closed to public and anon';
  end if;

  if v_private_authenticated_execute or v_private_anon_execute or v_private_public_execute then
    raise exception 'Internal operational adoption implementation is executable by a browser role';
  end if;
end
$assertions$;

notify pgrst, 'reload schema';
