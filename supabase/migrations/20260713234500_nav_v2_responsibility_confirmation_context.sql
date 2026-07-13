create or replace function nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_spn_options jsonb := '[]'::jsonb;
  v_manager_options jsonb := '[]'::jsonb;
  v_spn_count integer := 0;
  v_spn_without_manager integer := 0;
  v_manager_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  select profile.role
  into v_role
  from public.nav_user_profiles profile
  where profile.id = v_uid
    and profile.is_active is true
  limit 1;

  if v_role is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'Подготовка подтверждений доступна владельцу, администратору и менеджеру' using errcode = '42501';
  end if;

  with scoped_spn as (
    select
      profile.id,
      profile.full_name,
      profile.email,
      profile.phone,
      profile.manager_id,
      manager.full_name as manager_name,
      manager.email as manager_email,
      manager.role::text as manager_role
    from public.nav_user_profiles profile
    left join public.nav_user_profiles manager on manager.id = profile.manager_id
    where profile.is_active is true
      and profile.role = 'spn'::public.nav_v2_user_role
      and (
        v_role in ('owner', 'admin')
        or profile.manager_id = v_uid
      )
    order by profile.full_name, profile.email, profile.id
    limit v_limit
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', row.id,
          'full_name', row.full_name,
          'email', row.email,
          'phone', row.phone,
          'manager_id', row.manager_id,
          'manager_name', row.manager_name,
          'manager_email', row.manager_email,
          'manager_role', row.manager_role,
          'manager_status', case when row.manager_id is null then 'missing' else 'present' end,
          'selection_scope', 'local_draft_only',
          'server_mutation_available', false
        )
        order by row.full_name, row.email, row.id
      ),
      '[]'::jsonb
    ),
    count(*)::integer,
    count(*) filter (where row.manager_id is null)::integer
  into v_spn_options, v_spn_count, v_spn_without_manager
  from scoped_spn row;

  with scoped_managers as (
    select
      profile.id,
      profile.full_name,
      profile.email,
      profile.phone,
      profile.role::text as role
    from public.nav_user_profiles profile
    where profile.is_active is true
      and profile.role in (
        'owner'::public.nav_v2_user_role,
        'admin'::public.nav_v2_user_role,
        'manager'::public.nav_v2_user_role
      )
      and (
        v_role in ('owner', 'admin')
        or profile.id = v_uid
      )
    order by
      case profile.role
        when 'manager'::public.nav_v2_user_role then 1
        when 'owner'::public.nav_v2_user_role then 2
        else 3
      end,
      profile.full_name,
      profile.email,
      profile.id
    limit v_limit
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', row.id,
          'full_name', row.full_name,
          'email', row.email,
          'phone', row.phone,
          'role', row.role,
          'selection_scope', 'local_draft_only',
          'server_mutation_available', false
        )
        order by
          case row.role when 'manager' then 1 when 'owner' then 2 else 3 end,
          row.full_name,
          row.email,
          row.id
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into v_manager_options, v_manager_count
  from scoped_managers row;

  return jsonb_build_object(
    'context_version', 1,
    'generated_at', now(),
    'preview_only', true,
    'local_draft_available', true,
    'local_storage_only', true,
    'export_available', true,
    'server_selection_available', false,
    'server_mutation_available', false,
    'summary', jsonb_build_object(
      'active_spn_options', v_spn_count,
      'spn_without_manager', v_spn_without_manager,
      'manager_options', v_manager_count,
      'server_mutation_available', false
    ),
    'active_spn_options', v_spn_options,
    'manager_options', v_manager_options,
    'decision_statuses', jsonb_build_array(
      jsonb_build_object('code', 'not_reviewed', 'label', 'Не проверено'),
      jsonb_build_object('code', 'confirmed', 'label', 'Подтверждено владельцем'),
      jsonb_build_object('code', 'needs_clarification', 'label', 'Нужно уточнение'),
      jsonb_build_object('code', 'keep_current', 'label', 'Оставить текущее значение')
    ),
    'export_note', 'Экспорт содержит только локальный черновик решений и не подтверждает изменение данных в Supabase.',
    'decision_note', 'Выборы на экране хранятся только в localStorage текущего браузера. Для записи в БД требуется отдельная аудируемая точечная операция.'
  );
end;
$function$;

revoke all on function nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(integer) from public;
revoke execute on function nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(integer) from anon, authenticated;
grant execute on function nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(integer) to service_role;

comment on function nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(integer) is
  'Private read-only catalog for browser-local responsibility confirmation drafts and exports; never mutates profiles or deals.';

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
  v_report jsonb;
  v_comparison jsonb;
  v_manager_proposal jsonb;
  v_remediation_plan jsonb;
  v_responsibility_evidence jsonb;
  v_confirmation_context jsonb;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.nav_user_profiles profile
    where profile.id = v_uid
      and profile.is_active is true
      and profile.role in (
        'owner'::public.nav_v2_user_role,
        'admin'::public.nav_v2_user_role,
        'manager'::public.nav_v2_user_role
      )
  ) then
    raise exception 'Отчёт внедрения доступен владельцу, администратору и менеджеру' using errcode = '42501';
  end if;

  v_report := nav_v2_private.nav_v2_get_operational_adoption_report_unchecked_20260713(p_days, p_limit);
  v_comparison := nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(p_days);
  v_manager_proposal := nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(p_limit);
  v_remediation_plan := nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(p_limit);
  v_responsibility_evidence := nav_v2_private.nav_v2_get_responsibility_evidence_unchecked_20260713(p_limit);
  v_confirmation_context := nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(p_limit);

  return v_report || jsonb_build_object(
    'report_version', 6,
    'comparison', v_comparison,
    'manager_assignment_proposal', v_manager_proposal,
    'manager_source_remediation_plan', v_remediation_plan,
    'responsibility_evidence', v_responsibility_evidence,
    'responsibility_confirmation_context', v_confirmation_context
  );
end;
$function$;

revoke all on function public.nav_v2_get_operational_adoption_report(integer, integer) from public;
revoke execute on function public.nav_v2_get_operational_adoption_report(integer, integer) from anon;
grant execute on function public.nav_v2_get_operational_adoption_report(integer, integer) to authenticated, service_role;

comment on function public.nav_v2_get_operational_adoption_report(integer, integer) is
  'Role-gated read-only adoption report with comparison, manager proposal, remediation, responsibility evidence and local confirmation context.';

do $assertions$
declare
  v_wrapper_definition text;
  v_private_definition text;
  v_public_execute boolean;
  v_anon_execute boolean;
  v_authenticated_execute boolean;
  v_private_public_execute boolean;
  v_private_anon_execute boolean;
  v_private_authenticated_execute boolean;
begin
  select pg_get_functiondef('public.nav_v2_get_operational_adoption_report(integer, integer)'::regprocedure)
  into v_wrapper_definition;

  select pg_get_functiondef(
    'nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(integer)'::regprocedure
  ) into v_private_definition;

  if position('nav_v2_get_responsibility_confirmation_context_unchecked_20260713' in v_wrapper_definition) = 0
    or position('responsibility_confirmation_context' in v_wrapper_definition) = 0
    or position('report_version' in v_wrapper_definition) = 0
    or position('6' in v_wrapper_definition) = 0 then
    raise exception 'Operational adoption confirmation context wrapper definition drifted';
  end if;

  if position('active_spn_options' in v_private_definition) = 0
    or position('manager_options' in v_private_definition) = 0
    or position('local_storage_only' in v_private_definition) = 0
    or position('export_available' in v_private_definition) = 0
    or position('server_mutation_available' in v_private_definition) = 0 then
    raise exception 'Responsibility confirmation context implementation drifted';
  end if;

  select has_function_privilege('public', 'public.nav_v2_get_operational_adoption_report(integer, integer)', 'EXECUTE')
  into v_public_execute;
  select has_function_privilege('anon', 'public.nav_v2_get_operational_adoption_report(integer, integer)', 'EXECUTE')
  into v_anon_execute;
  select has_function_privilege('authenticated', 'public.nav_v2_get_operational_adoption_report(integer, integer)', 'EXECUTE')
  into v_authenticated_execute;
  select has_function_privilege(
    'public',
    'nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(integer)',
    'EXECUTE'
  ) into v_private_public_execute;
  select has_function_privilege(
    'anon',
    'nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(integer)',
    'EXECUTE'
  ) into v_private_anon_execute;
  select has_function_privilege(
    'authenticated',
    'nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(integer)',
    'EXECUTE'
  ) into v_private_authenticated_execute;

  if v_public_execute or v_anon_execute or not v_authenticated_execute then
    raise exception 'Operational adoption confirmation context wrapper grants drifted';
  end if;

  if v_private_public_execute or v_private_anon_execute or v_private_authenticated_execute then
    raise exception 'Responsibility confirmation context implementation must remain private';
  end if;
end
$assertions$;

notify pgrst, 'reload schema';
