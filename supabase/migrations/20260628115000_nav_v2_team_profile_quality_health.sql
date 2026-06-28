create or replace function public.nav_v2_get_team_profile_quality_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_checks jsonb;
  v_summary jsonb;
  v_problem_count int;
  v_warning_count int;
  v_error_count int;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  if not public.nav_v2_is_owner_or_admin(v_uid) then
    raise exception 'Проверка качества профилей доступна только owner/admin' using errcode = '42501';
  end if;

  with profiles as (
    select
      u.id,
      u.email,
      u.full_name,
      u.phone,
      u.role::text as role,
      u.manager_id,
      u.is_active,
      u.created_at,
      u.updated_at,
      m.id as manager_found_id,
      m.email as manager_email,
      m.full_name as manager_name,
      m.role::text as manager_role,
      m.is_active as manager_is_active
    from public.nav_user_profiles u
    left join public.nav_user_profiles m on m.id = u.manager_id
  ), check_rows as (
    select
      'active_spn_without_manager'::text as code,
      'Активные СПН без менеджера'::text as label,
      'warning'::text as severity,
      count(*)::int as count_value,
      coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc) filter (where p.id is not null), '[]'::jsonb) as sample
    from profiles p
    where p.is_active = true and p.role = 'spn' and p.manager_id is null

    union all
    select
      'active_user_without_email',
      'Активные профили без email',
      'error',
      count(*)::int,
      coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc) filter (where p.id is not null), '[]'::jsonb)
    from profiles p
    where p.is_active = true and nullif(trim(coalesce(p.email, '')), '') is null

    union all
    select
      'active_user_without_full_name',
      'Активные профили без ФИО',
      'warning',
      count(*)::int,
      coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc) filter (where p.id is not null), '[]'::jsonb)
    from profiles p
    where p.is_active = true and nullif(trim(coalesce(p.full_name, '')), '') is null

    union all
    select
      'active_user_without_phone',
      'Активные профили без телефона',
      'warning',
      count(*)::int,
      coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc) filter (where p.id is not null), '[]'::jsonb)
    from profiles p
    where p.is_active = true and nullif(trim(coalesce(p.phone, '')), '') is null

    union all
    select
      'invalid_manager_reference',
      'Некорректный менеджер в профиле',
      'error',
      count(*)::int,
      coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc) filter (where p.id is not null), '[]'::jsonb)
    from profiles p
    where p.manager_id is not null
      and (p.manager_found_id is null or p.manager_is_active is distinct from true or p.manager_role not in ('owner','admin','manager'))

    union all
    select
      'duplicate_active_email',
      'Дубли email среди активных профилей',
      'error',
      count(*)::int,
      coalesce(jsonb_agg(to_jsonb(d) order by d.email) filter (where d.email is not null), '[]'::jsonb)
    from (
      select lower(trim(email)) as email, count(*)::int as duplicate_count, jsonb_agg(id order by id) as user_ids
      from public.nav_user_profiles
      where is_active = true and nullif(trim(coalesce(email, '')), '') is not null
      group by lower(trim(email))
      having count(*) > 1
    ) d

    union all
    select
      'no_active_owner_or_admin',
      'Нет активного owner/admin',
      'error',
      case when exists (
        select 1 from public.nav_user_profiles where is_active = true and role::text in ('owner','admin')
      ) then 0 else 1 end,
      '[]'::jsonb
  ), checks as (
    select
      code,
      label,
      severity,
      count_value,
      count_value > 0 as has_problem,
      case when count_value > 0 then sample else '[]'::jsonb end as sample
    from check_rows
  )
  select
    coalesce(jsonb_agg(to_jsonb(checks) order by severity desc, code), '[]'::jsonb),
    count(*) filter (where has_problem)::int,
    count(*) filter (where has_problem and severity = 'warning')::int,
    count(*) filter (where has_problem and severity = 'error')::int
  into v_checks, v_problem_count, v_warning_count, v_error_count
  from checks;

  select jsonb_build_object(
    'total_profiles', count(*)::int,
    'active_profiles', count(*) filter (where is_active = true)::int,
    'inactive_profiles', count(*) filter (where is_active = false)::int,
    'active_owner_admin', count(*) filter (where is_active = true and role::text in ('owner','admin'))::int,
    'active_manager_candidates', count(*) filter (where is_active = true and role::text in ('owner','admin','manager'))::int,
    'active_spn', count(*) filter (where is_active = true and role::text = 'spn')::int,
    'active_lawyer', count(*) filter (where is_active = true and role::text = 'lawyer')::int,
    'active_broker', count(*) filter (where is_active = true and role::text = 'broker')::int,
    'roles', coalesce((
      select jsonb_object_agg(role_text, role_count)
      from (
        select role::text as role_text, count(*)::int as role_count
        from public.nav_user_profiles
        where is_active = true
        group by role::text
        order by role::text
      ) r
    ), '{}'::jsonb)
  )
  into v_summary
  from public.nav_user_profiles;

  return jsonb_build_object(
    'ok', coalesce(v_error_count, 0) = 0,
    'checked_at', now(),
    'summary', v_summary,
    'checks', v_checks,
    'problem_count', coalesce(v_problem_count, 0),
    'warning_count', coalesce(v_warning_count, 0),
    'error_count', coalesce(v_error_count, 0)
  );
end;
$$;

revoke all on function public.nav_v2_get_team_profile_quality_health() from public;
revoke all on function public.nav_v2_get_team_profile_quality_health() from anon;
grant execute on function public.nav_v2_get_team_profile_quality_health() to authenticated;

do $$
declare
  v_def text;
  v_next text;
  v_old text := $patch$      ('Data quality dashboard', 'nav_v2_get_data_quality_dashboard', '["integer"]'::jsonb),
      ('Data integrity health', 'nav_v2_get_data_integrity_health', '[]'::jsonb),$patch$;
  v_new text := $patch$      ('Data quality dashboard', 'nav_v2_get_data_quality_dashboard', '["integer"]'::jsonb),
      ('Team profile quality health', 'nav_v2_get_team_profile_quality_health', '[]'::jsonb),
      ('Data integrity health', 'nav_v2_get_data_integrity_health', '[]'::jsonb),$patch$;
begin
  select pg_get_functiondef('public.nav_v2_get_rpc_grant_health()'::regprocedure) into v_def;
  v_next := replace(v_def, v_old, v_new);
  if v_next = v_def then
    if position('nav_v2_get_team_profile_quality_health' in v_def) > 0 then
      return;
    end if;
    raise exception 'Could not patch nav_v2_get_rpc_grant_health expected list';
  end if;
  execute v_next;
end $$;

do $$
declare
  v_def text;
  v_next text;
  v_old text := $patch$      ('nav_v2_get_data_quality_dashboard', 'admin'),
      ('nav_v2_check_deal_access', 'admin/deal-access-check'),$patch$;
  v_new text := $patch$      ('nav_v2_get_data_quality_dashboard', 'admin'),
      ('nav_v2_get_team_profile_quality_health', 'admin'),
      ('nav_v2_check_deal_access', 'admin/deal-access-check'),$patch$;
begin
  select pg_get_functiondef('public.nav_v2_get_frontend_rpc_coverage_health()'::regprocedure) into v_def;
  v_next := replace(v_def, v_old, v_new);
  if v_next = v_def then
    if position('nav_v2_get_team_profile_quality_health' in v_def) > 0 then
      return;
    end if;
    raise exception 'Could not patch nav_v2_get_frontend_rpc_coverage_health expected list';
  end if;
  execute v_next;
end $$;
