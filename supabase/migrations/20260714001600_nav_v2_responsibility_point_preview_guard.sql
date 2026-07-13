alter function public.nav_v2_preview_responsibility_point_correction(jsonb)
  rename to nav_v2_preview_responsibility_point_correction_unchecked_20260714;

alter function public.nav_v2_preview_responsibility_point_correction_unchecked_20260714(jsonb)
  set schema nav_v2_private;

revoke all on function nav_v2_private.nav_v2_preview_responsibility_point_correction_unchecked_20260714(jsonb)
  from public, anon, authenticated;
grant execute on function nav_v2_private.nav_v2_preview_responsibility_point_correction_unchecked_20260714(jsonb)
  to service_role;

comment on function nav_v2_private.nav_v2_preview_responsibility_point_correction_unchecked_20260714(jsonb) is
  'Private read-only responsibility point preview implementation. Public browser access must use the owner/admin wrapper.';

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
  v_field text;
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

  if not (p_operation ? 'expected_current_id') then
    return jsonb_build_object(
      'preview_version', 1,
      'ready', false,
      'reason_code', 'missing_expected_current',
      'reason', 'Пакет должен явно содержать expected_current_id, включая JSON null.',
      'mutation_available', false,
      'execution_rpc_available', false,
      'requires_revalidation', true
    );
  end if;

  v_field := nullif(btrim(p_operation ->> 'field'), '');
  if v_field is null then
    return jsonb_build_object(
      'preview_version', 1,
      'ready', false,
      'reason_code', 'missing_field',
      'reason', 'Не указано поле точечной коррекции.',
      'mutation_available', false,
      'execution_rpc_available', false,
      'requires_revalidation', true
    );
  end if;

  return nav_v2_private.nav_v2_preview_responsibility_point_correction_unchecked_20260714(p_operation);
end;
$function$;

revoke all on function public.nav_v2_preview_responsibility_point_correction(jsonb) from public;
revoke execute on function public.nav_v2_preview_responsibility_point_correction(jsonb) from anon;
grant execute on function public.nav_v2_preview_responsibility_point_correction(jsonb) to authenticated, service_role;

comment on function public.nav_v2_preview_responsibility_point_correction(jsonb) is
  'Owner/admin read-only wrapper for one responsibility correction preview. Requires explicit expected_current_id and delegates to a private implementation.';

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
  select pg_get_functiondef('public.nav_v2_preview_responsibility_point_correction(jsonb)'::regprocedure)
  into v_wrapper_definition;
  select pg_get_functiondef(
    'nav_v2_private.nav_v2_preview_responsibility_point_correction_unchecked_20260714(jsonb)'::regprocedure
  ) into v_private_definition;

  if position('missing_expected_current' in v_wrapper_definition) = 0
    or position('missing_field' in v_wrapper_definition) = 0
    or position('nav_v2_preview_responsibility_point_correction_unchecked_20260714' in v_wrapper_definition) = 0 then
    raise exception 'Responsibility point preview wrapper drifted';
  end if;

  if position('operation_fingerprint' in v_private_definition) = 0
    or position('execution_rpc_available' in v_private_definition) = 0
    or position('stale_current_value' in v_private_definition) = 0 then
    raise exception 'Responsibility point preview private implementation drifted';
  end if;

  select has_function_privilege('public', 'public.nav_v2_preview_responsibility_point_correction(jsonb)', 'EXECUTE')
  into v_public_execute;
  select has_function_privilege('anon', 'public.nav_v2_preview_responsibility_point_correction(jsonb)', 'EXECUTE')
  into v_anon_execute;
  select has_function_privilege('authenticated', 'public.nav_v2_preview_responsibility_point_correction(jsonb)', 'EXECUTE')
  into v_authenticated_execute;
  select has_function_privilege(
    'public',
    'nav_v2_private.nav_v2_preview_responsibility_point_correction_unchecked_20260714(jsonb)',
    'EXECUTE'
  ) into v_private_public_execute;
  select has_function_privilege(
    'anon',
    'nav_v2_private.nav_v2_preview_responsibility_point_correction_unchecked_20260714(jsonb)',
    'EXECUTE'
  ) into v_private_anon_execute;
  select has_function_privilege(
    'authenticated',
    'nav_v2_private.nav_v2_preview_responsibility_point_correction_unchecked_20260714(jsonb)',
    'EXECUTE'
  ) into v_private_authenticated_execute;

  if v_public_execute or v_anon_execute or not v_authenticated_execute then
    raise exception 'Responsibility point preview wrapper grants drifted';
  end if;

  if v_private_public_execute or v_private_anon_execute or v_private_authenticated_execute then
    raise exception 'Responsibility point preview implementation must remain private';
  end if;
end
$assertions$;

notify pgrst, 'reload schema';
