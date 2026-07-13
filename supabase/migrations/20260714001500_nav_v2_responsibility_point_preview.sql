create or replace function public.nav_v2_preview_responsibility_point_correction(
  p_operation jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_operation_type text;
  v_field text;
  v_target_text text;
  v_expected_text text;
  v_proposed_text text;
  v_note text;
  v_target_id uuid;
  v_expected_current_id uuid;
  v_proposed_id uuid;
  v_actual_current_id uuid;
  v_target_updated_at timestamptz;
  v_target_title text;
  v_target_subtitle text;
  v_target_role text;
  v_target_is_active boolean;
  v_proposed_name text;
  v_proposed_role text;
  v_proposed_is_active boolean;
  v_generated_at timestamptz := now();
  v_fingerprint text;
  v_reason_code text := 'ready';
  v_reason text := 'Операция прошла серверную read-only проверку.';
  v_ready boolean := false;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  if not nav_v2_private.nav_v2_is_owner_or_admin(v_uid) then
    raise exception 'Серверный preview точечной коррекции доступен только owner/admin' using errcode = '42501';
  end if;

  if p_operation is null or jsonb_typeof(p_operation) <> 'object' then
    return jsonb_build_object(
      'preview_version', 1,
      'ready', false,
      'reason_code', 'invalid_payload',
      'reason', 'Операция должна быть JSON-объектом.',
      'mutation_available', false,
      'execution_rpc_available', false,
      'requires_revalidation', true
    );
  end if;

  v_operation_type := nullif(btrim(p_operation ->> 'type'), '');
  v_field := nullif(btrim(p_operation ->> 'field'), '');
  v_target_text := nullif(btrim(p_operation ->> 'target_id'), '');
  v_expected_text := nullif(btrim(p_operation ->> 'expected_current_id'), '');
  v_proposed_text := nullif(btrim(p_operation ->> 'proposed_id'), '');
  v_note := nullif(btrim(p_operation ->> 'note'), '');

  if v_operation_type not in ('deal_spn', 'profile_manager') then
    v_reason_code := 'unsupported_operation_type';
    v_reason := 'Поддерживаются только deal_spn и profile_manager.';
  elsif v_target_text is null or v_proposed_text is null then
    v_reason_code := 'missing_identifier';
    v_reason := 'Не указаны target_id или proposed_id.';
  elsif v_note is null or char_length(v_note) < 10 then
    v_reason_code := 'note_too_short';
    v_reason := 'Для аудируемой операции требуется основание не короче 10 символов.';
  end if;

  if v_reason_code <> 'ready' then
    return jsonb_build_object(
      'preview_version', 1,
      'generated_at', v_generated_at,
      'ready', false,
      'reason_code', v_reason_code,
      'reason', v_reason,
      'operation_type', v_operation_type,
      'field', v_field,
      'mutation_available', false,
      'execution_rpc_available', false,
      'requires_revalidation', true
    );
  end if;

  begin
    v_target_id := v_target_text::uuid;
    v_proposed_id := v_proposed_text::uuid;
    if v_expected_text is not null then
      v_expected_current_id := v_expected_text::uuid;
    end if;
  exception
    when invalid_text_representation then
      return jsonb_build_object(
        'preview_version', 1,
        'generated_at', v_generated_at,
        'ready', false,
        'reason_code', 'invalid_uuid',
        'reason', 'target_id, expected_current_id или proposed_id не является UUID.',
        'operation_type', v_operation_type,
        'field', v_field,
        'mutation_available', false,
        'execution_rpc_available', false,
        'requires_revalidation', true
      );
  end;

  if v_operation_type = 'deal_spn' then
    if v_field not in ('seller_spn_id', 'buyer_spn_id') then
      v_reason_code := 'unsupported_field';
      v_reason := 'Для deal_spn разрешены только seller_spn_id и buyer_spn_id.';
    else
      select
        case when v_field = 'seller_spn_id' then deal.seller_spn_id else deal.buyer_spn_id end,
        deal.updated_at,
        coalesce(deal.title, deal.address, deal.id::text),
        concat_ws(' · ', deal.address, deal.status::text)
      into
        v_actual_current_id,
        v_target_updated_at,
        v_target_title,
        v_target_subtitle
      from public.nav_deals_v2 deal
      where deal.id = v_target_id
        and not (
          coalesce((deal.deal_summary ->> 'demo') = 'true', false)
          or coalesce((deal.wizard_snapshot ->> 'demo') = 'true', false)
          or coalesce(deal.title, '') like 'ДЕМО:%'
        )
      limit 1;

      if not found then
        v_reason_code := 'target_not_found';
        v_reason := 'Рабочая сделка не найдена или относится к demo-данным.';
      else
        select profile.full_name, profile.role::text, profile.is_active
        into v_proposed_name, v_proposed_role, v_proposed_is_active
        from public.nav_user_profiles profile
        where profile.id = v_proposed_id
        limit 1;

        if v_proposed_name is null then
          v_reason_code := 'proposed_profile_not_found';
          v_reason := 'Предлагаемый профиль СПН не найден.';
        elsif v_proposed_is_active is not true or v_proposed_role <> 'spn' then
          v_reason_code := 'proposed_profile_not_active_spn';
          v_reason := 'Предлагаемый профиль должен быть активным СПН.';
        elsif v_expected_current_id is distinct from v_actual_current_id then
          v_reason_code := 'stale_current_value';
          v_reason := 'Текущее значение поля сделки изменилось после формирования пакета.';
        elsif v_proposed_id is not distinct from v_actual_current_id then
          v_reason_code := 'no_change';
          v_reason := 'Предлагаемый СПН уже записан в этом поле.';
        else
          v_ready := true;
        end if;
      end if;
    end if;
  elsif v_operation_type = 'profile_manager' then
    if v_field <> 'manager_id' then
      v_reason_code := 'unsupported_field';
      v_reason := 'Для profile_manager разрешено только поле manager_id.';
    else
      select
        profile.manager_id,
        profile.updated_at,
        coalesce(profile.full_name, profile.email, profile.id::text),
        profile.email,
        profile.role::text,
        profile.is_active
      into
        v_actual_current_id,
        v_target_updated_at,
        v_target_title,
        v_target_subtitle,
        v_target_role,
        v_target_is_active
      from public.nav_user_profiles profile
      where profile.id = v_target_id
      limit 1;

      if not found then
        v_reason_code := 'target_not_found';
        v_reason := 'Профиль СПН не найден.';
      elsif v_target_is_active is not true or v_target_role <> 'spn' then
        v_reason_code := 'target_not_active_spn';
        v_reason := 'Целевой профиль должен быть активным СПН.';
      else
        select profile.full_name, profile.role::text, profile.is_active
        into v_proposed_name, v_proposed_role, v_proposed_is_active
        from public.nav_user_profiles profile
        where profile.id = v_proposed_id
        limit 1;

        if v_proposed_name is null then
          v_reason_code := 'proposed_profile_not_found';
          v_reason := 'Предлагаемый менеджер не найден.';
        elsif v_proposed_is_active is not true or v_proposed_role not in ('owner', 'admin', 'manager') then
          v_reason_code := 'proposed_profile_not_manager_candidate';
          v_reason := 'Предлагаемый менеджер должен быть активным owner/admin/manager.';
        elsif v_proposed_id = v_target_id then
          v_reason_code := 'self_manager_not_allowed';
          v_reason := 'СПН не может быть назначен менеджером самому себе.';
        elsif v_expected_current_id is distinct from v_actual_current_id then
          v_reason_code := 'stale_current_value';
          v_reason := 'Текущий manager_id изменился после формирования пакета.';
        elsif v_proposed_id is not distinct from v_actual_current_id then
          v_reason_code := 'no_change';
          v_reason := 'Предлагаемый manager_id уже установлен.';
        else
          v_ready := true;
        end if;
      end if;
    end if;
  end if;

  if v_ready then
    v_fingerprint := md5(concat_ws(
      '|',
      'nav_v2_responsibility_point_preview_v1',
      v_operation_type,
      v_target_id::text,
      v_field,
      coalesce(v_actual_current_id::text, 'NULL'),
      v_proposed_id::text,
      v_note,
      coalesce(v_target_updated_at::text, 'NULL')
    ));
  end if;

  return jsonb_build_object(
    'preview_version', 1,
    'generated_at', v_generated_at,
    'expires_at', v_generated_at + interval '15 minutes',
    'ready', v_ready,
    'reason_code', case when v_ready then 'ready' else v_reason_code end,
    'reason', case when v_ready then 'Операция прошла серверную read-only проверку.' else v_reason end,
    'operation_type', v_operation_type,
    'target_id', v_target_id,
    'field', v_field,
    'expected_current_id', v_expected_current_id,
    'actual_current_id', v_actual_current_id,
    'proposed_id', v_proposed_id,
    'note', v_note,
    'operation_fingerprint', v_fingerprint,
    'target', jsonb_build_object(
      'title', v_target_title,
      'subtitle', v_target_subtitle,
      'role', v_target_role,
      'is_active', v_target_is_active,
      'updated_at', v_target_updated_at
    ),
    'proposed_profile', jsonb_build_object(
      'id', v_proposed_id,
      'name', v_proposed_name,
      'role', v_proposed_role,
      'is_active', v_proposed_is_active
    ),
    'before', jsonb_build_object(v_field, v_actual_current_id),
    'after', jsonb_build_object(v_field, v_proposed_id),
    'preconditions', jsonb_build_array(
      'owner_or_admin',
      'single_supported_operation',
      'target_exists_and_is_current',
      'proposed_profile_is_active_and_role_valid',
      'expected_current_matches_live',
      'reason_is_present'
    ),
    'mutation_available', false,
    'execution_rpc_available', false,
    'requires_revalidation', true
  );
end;
$function$;

revoke all on function public.nav_v2_preview_responsibility_point_correction(jsonb) from public;
revoke execute on function public.nav_v2_preview_responsibility_point_correction(jsonb) from anon;
grant execute on function public.nav_v2_preview_responsibility_point_correction(jsonb) to authenticated, service_role;

comment on function public.nav_v2_preview_responsibility_point_correction(jsonb) is
  'Owner/admin read-only preview for exactly one responsibility correction. Returns fresh preconditions and fingerprint; never mutates deals or profiles.';

do $register_health$
declare
  v_definition text;
begin
  v_definition := pg_get_functiondef('public.nav_v2_get_rpc_grant_health()'::regprocedure);
  if position('nav_v2_preview_responsibility_point_correction' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '(''admin_api'', ''nav_v2_get_access_audit''),',
      '(''admin_api'', ''nav_v2_get_access_audit''),' || chr(10) ||
      '      (''admin_api'', ''nav_v2_preview_responsibility_point_correction''),'
    );
    if position('nav_v2_preview_responsibility_point_correction' in v_definition) = 0 then
      raise exception 'Unable to register responsibility point preview in RPC grant health';
    end if;
    execute v_definition;
  end if;

  v_definition := pg_get_functiondef('public.nav_v2_get_frontend_rpc_coverage_health()'::regprocedure);
  if position('nav_v2_preview_responsibility_point_correction' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      '(''nav_v2_get_access_audit'', ''nav-access-audit''),',
      '(''nav_v2_get_access_audit'', ''nav-access-audit''),' || chr(10) ||
      '      (''nav_v2_preview_responsibility_point_correction'', ''responsibility point preview''),'
    );
    if position('nav_v2_preview_responsibility_point_correction' in v_definition) = 0 then
      raise exception 'Unable to register responsibility point preview in frontend RPC coverage';
    end if;
    execute v_definition;
  end if;
end
$register_health$;

do $assertions$
declare
  v_definition text;
  v_rpc_health_definition text;
  v_frontend_health_definition text;
  v_public_execute boolean;
  v_anon_execute boolean;
  v_authenticated_execute boolean;
begin
  select pg_get_functiondef('public.nav_v2_preview_responsibility_point_correction(jsonb)'::regprocedure)
  into v_definition;
  select pg_get_functiondef('public.nav_v2_get_rpc_grant_health()'::regprocedure)
  into v_rpc_health_definition;
  select pg_get_functiondef('public.nav_v2_get_frontend_rpc_coverage_health()'::regprocedure)
  into v_frontend_health_definition;

  if position('nav_v2_private.nav_v2_is_owner_or_admin' in v_definition) = 0
    or position('operation_fingerprint' in v_definition) = 0
    or position('execution_rpc_available' in v_definition) = 0
    or position('15 minutes' in v_definition) = 0 then
    raise exception 'Responsibility point preview definition drifted';
  end if;

  if position('nav_v2_preview_responsibility_point_correction' in v_rpc_health_definition) = 0
    or position('nav_v2_preview_responsibility_point_correction' in v_frontend_health_definition) = 0 then
    raise exception 'Responsibility point preview health registration drifted';
  end if;

  select has_function_privilege('public', 'public.nav_v2_preview_responsibility_point_correction(jsonb)', 'EXECUTE')
  into v_public_execute;
  select has_function_privilege('anon', 'public.nav_v2_preview_responsibility_point_correction(jsonb)', 'EXECUTE')
  into v_anon_execute;
  select has_function_privilege('authenticated', 'public.nav_v2_preview_responsibility_point_correction(jsonb)', 'EXECUTE')
  into v_authenticated_execute;

  if v_public_execute or v_anon_execute or not v_authenticated_execute then
    raise exception 'Responsibility point preview grants drifted';
  end if;
end
$assertions$;

notify pgrst, 'reload schema';
