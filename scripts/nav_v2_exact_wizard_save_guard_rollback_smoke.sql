-- Run only against a project where 20260714103000_nav_v2_exact_wizard_save_guard is deployed.
-- The script creates two synthetic deals inside one transaction and always rolls back.

begin;

select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.nav_user_profiles where role = 'owner' and is_active = true order by created_at limit 1),
  true
), set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  v_nonce text := pg_catalog.clock_timestamp()::text;
  v_payload jsonb;
  v_changed_payload jsonb;
  v_first jsonb;
  v_changed jsonb;
  v_detail text;
  v_duplicate_blocked boolean := false;
begin
  v_payload := jsonb_build_object(
    'deal', jsonb_build_object(
      'preparationMode', 'consult',
      'representation', 'unknown',
      'stage', 'lead_only',
      'objectType', 'flat_mkd',
      'address', 'ROLLBACK exact wizard guard ' || v_nonce,
      'clientNextStep', 'Проверить exact duplicate guard и выполнить rollback',
      'expensesAgreed', true,
      'settlementsAgreed', true
    )
  );

  v_first := public.nav_v2_save_wizard_result(v_payload);

  begin
    perform public.nav_v2_save_wizard_result(v_payload);
  exception
    when sqlstate 'P0001' then
      get stacked diagnostics v_detail = PG_EXCEPTION_DETAIL;
      if coalesce((v_detail::jsonb ->> 'code'), '') <> 'NAV_V2_EXACT_WIZARD_DUPLICATE' then
        raise exception 'Unexpected duplicate code: %', v_detail;
      end if;
      if (v_detail::jsonb ->> 'existing_deal_id')::uuid <> (v_first ->> 'id')::uuid then
        raise exception 'Duplicate guard returned wrong existing deal: first %, detail %', v_first ->> 'id', v_detail;
      end if;
      v_duplicate_blocked := true;
  end;

  if not v_duplicate_blocked then
    raise exception 'Second exact wizard save was not blocked';
  end if;

  v_changed_payload := jsonb_set(
    v_payload,
    '{deal,clientNextStep}',
    to_jsonb(('Изменённый payload ' || v_nonce)::text),
    true
  );
  v_changed := public.nav_v2_save_wizard_result(v_changed_payload);

  if (v_changed ->> 'id')::uuid = (v_first ->> 'id')::uuid then
    raise exception 'Changed payload unexpectedly reused the first deal';
  end if;
end;
$$;

select jsonb_build_object(
  'exact_duplicate_blocked', true,
  'existing_deal_id_matches_first', true,
  'changed_payload_allowed', true,
  'rollback_required', true
) as smoke_result;

rollback;
