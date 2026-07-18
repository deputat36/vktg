\set ON_ERROR_STOP on

-- BEGIN EXACT PRODUCTION SANITIZER SNAPSHOT 2026-07-18
create or replace function nav_v2_private.nav_v2_sanitize_client_deal_json(p_deal jsonb)
returns jsonb
language sql
immutable
set search_path to 'public', 'nav_v2_private'
as $function$
  select coalesce(p_deal, '{}'::jsonb) - array[
    'sellerName', 'seller_name', 'sellerFullName', 'seller_fio',
    'sellerPhone', 'seller_phone',
    'buyerName', 'buyer_name', 'buyerFullName', 'buyer_fio',
    'buyerPhone', 'buyer_phone',
    'clientEmail', 'client_email'
  ]::text[];
$function$;
-- END EXACT PRODUCTION SANITIZER SNAPSHOT 2026-07-18

revoke all on function nav_v2_private.nav_v2_sanitize_client_deal_json(jsonb) from public, anon, authenticated;
grant execute on function nav_v2_private.nav_v2_sanitize_client_deal_json(jsonb) to service_role;

create table harness.nav_v2_intake_mock_save_calls (
  id bigint generated always as identity primary key,
  client_request_id uuid not null unique,
  verified_actor_id uuid not null,
  payload_fingerprint text not null,
  payload jsonb not null
);

create table harness.nav_v2_intake_mock_request_ledger (
  client_request_id uuid primary key,
  verified_actor_id uuid not null,
  payload_fingerprint text not null,
  result_payload jsonb not null
);

create or replace function harness.mock_legacy_save_v1(p_preview jsonb)
returns jsonb
language plpgsql
set search_path = pg_catalog, harness
as $function$
declare
  v_request_id uuid := nullif(p_preview->>'client_request_id', '')::uuid;
  v_actor_id uuid := nullif(p_preview #>> '{owner_resolution,verified_actor_id}', '')::uuid;
  v_fingerprint text := nullif(p_preview->>'payload_fingerprint', '');
  v_payload jsonb := p_preview->'legacy_payload';
  v_existing harness.nav_v2_intake_mock_request_ledger%rowtype;
  v_save_id bigint;
  v_result jsonb;
begin
  if not coalesce((p_preview #>> '{gates,mock_call,allowed}')::boolean, false) then
    raise exception 'Mock legacy call is blocked by adapter gate' using errcode = '22023';
  end if;
  if v_request_id is null or v_actor_id is null or v_fingerprint is null or jsonb_typeof(v_payload) <> 'object' then
    raise exception 'Mock legacy call preview is incomplete' using errcode = '22023';
  end if;

  select * into v_existing
  from harness.nav_v2_intake_mock_request_ledger
  where client_request_id = v_request_id;

  if found then
    if v_existing.verified_actor_id <> v_actor_id or v_existing.payload_fingerprint <> v_fingerprint then
      raise exception 'client_request_id already belongs to another actor or payload' using errcode = '22023';
    end if;
    return v_existing.result_payload || jsonb_build_object('idempotent', true, 'recovered_from_ledger', true);
  end if;

  insert into harness.nav_v2_intake_mock_save_calls (
    client_request_id, verified_actor_id, payload_fingerprint, payload
  ) values (
    v_request_id, v_actor_id, v_fingerprint, v_payload
  ) returning id into v_save_id;

  v_result := jsonb_build_object(
    'id', v_save_id,
    'client_request_id', v_request_id,
    'idempotent', false,
    'recovered_from_ledger', false,
    'business_writes', 1
  );

  insert into harness.nav_v2_intake_mock_request_ledger (
    client_request_id, verified_actor_id, payload_fingerprint, result_payload
  ) values (
    v_request_id, v_actor_id, v_fingerprint, v_result
  );

  return v_result;
end;
$function$;
