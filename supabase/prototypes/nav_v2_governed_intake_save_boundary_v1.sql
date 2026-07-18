-- Repository-only governed intake save boundary v1.
-- This is not a migration, exposes no public RPC and must run only in an ephemeral PostgreSQL 17 harness.
-- The final mutation must compose plan -> ledger claim -> business rows -> ledger completion in one transaction.

create table nav_v2_private.nav_v2_intake_save_requests_v1 (
  client_request_id uuid primary key,
  verified_actor_id uuid not null,
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{32}$'),
  state text not null check (state in ('started', 'completed')),
  result_payload jsonb,
  replay_count integer not null default 0 check (replay_count >= 0),
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  check (
    (state = 'started' and result_payload is null and completed_at is null)
    or
    (state = 'completed' and jsonb_typeof(result_payload) = 'object' and completed_at is not null)
  )
);

create index nav_v2_intake_save_requests_v1_actor_started_idx
  on nav_v2_private.nav_v2_intake_save_requests_v1 (verified_actor_id, started_at desc);

alter table nav_v2_private.nav_v2_intake_save_requests_v1 enable row level security;
revoke all on table nav_v2_private.nav_v2_intake_save_requests_v1 from public, anon, authenticated;
grant select, insert, update on table nav_v2_private.nav_v2_intake_save_requests_v1 to service_role;

create or replace function nav_v2_private.nav_v2_intake_save_lock_key_v1(p_client_request_id uuid)
returns bigint
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select hashtextextended(p_client_request_id::text, 0);
$function$;

create or replace function nav_v2_private.nav_v2_assert_intake_save_request_completed_v1()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, nav_v2_private
as $function$
declare
  v_state text;
begin
  select state into v_state
  from nav_v2_private.nav_v2_intake_save_requests_v1
  where client_request_id = new.client_request_id;

  if v_state is distinct from 'completed' then
    raise exception 'Governed intake request must complete in the same transaction'
      using errcode = '23514';
  end if;
  return null;
end;
$function$;

create constraint trigger nav_v2_intake_save_request_must_complete_v1
after insert or update on nav_v2_private.nav_v2_intake_save_requests_v1
deferrable initially deferred
for each row execute function nav_v2_private.nav_v2_assert_intake_save_request_completed_v1();

create or replace function nav_v2_private.nav_v2_build_governed_intake_write_plan_v1(
  p_result jsonb,
  p_client_request_id uuid,
  p_server_context jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, nav_v2_private
as $function$
declare
  v_preview jsonb;
  v_adapter jsonb;
  v_work_plan jsonb;
  v_owner_context jsonb;
  v_accompanied_sides jsonb;
  v_documents jsonb := '[]'::jsonb;
  v_tasks jsonb := '[]'::jsonb;
  v_risks jsonb := '[]'::jsonb;
  v_participants jsonb := '[]'::jsonb;
  v_owner_gaps jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_item jsonb;
  v_owner_role text;
  v_owner_id uuid;
  v_side text;
  v_actor_id uuid;
  v_lead_spn_id uuid;
  v_seller_spn_id uuid;
  v_buyer_spn_id uuid;
  v_lawyer_id uuid;
  v_broker_id uuid;
  v_unsupported jsonb;
  v_allowed boolean;
begin
  v_preview := nav_v2_private.nav_v2_prepare_intake_legacy_save_v1(
    p_result,
    p_client_request_id,
    p_server_context
  );
  v_adapter := v_preview->'adapter_result';
  v_work_plan := v_adapter->'work_plan';
  v_owner_context := v_preview->'owner_resolution';
  v_accompanied_sides := coalesce(v_work_plan->'accompanied_sides', '[]'::jsonb);
  v_unsupported := coalesce(v_preview #> '{legacy_parity,unsupported_rule_ids}', '[]'::jsonb);

  v_actor_id := nullif(v_owner_context->>'verified_actor_id', '')::uuid;
  v_lead_spn_id := nullif(v_owner_context->>'lead_spn_id', '')::uuid;
  v_seller_spn_id := nullif(v_owner_context->>'seller_spn_id', '')::uuid;
  v_buyer_spn_id := nullif(v_owner_context->>'buyer_spn_id', '')::uuid;
  v_lawyer_id := nullif(v_owner_context->>'lawyer_id', '')::uuid;
  v_broker_id := nullif(v_owner_context->>'broker_id', '')::uuid;

  v_participants := jsonb_build_array(jsonb_build_object(
    'user_id', v_actor_id,
    'role_in_deal', 'verified_creator',
    'side', 'company',
    'source', 'trusted_server_context'
  ));
  if v_lead_spn_id is distinct from v_actor_id then
    v_participants := v_participants || jsonb_build_array(jsonb_build_object(
      'user_id', v_lead_spn_id,
      'role_in_deal', 'lead_spn',
      'side', 'company',
      'source', 'trusted_server_context'
    ));
  end if;
  if v_accompanied_sides @> '["seller"]'::jsonb then
    if v_seller_spn_id is null then
      v_owner_gaps := v_owner_gaps || jsonb_build_array('seller_spn');
    else
      v_participants := v_participants || jsonb_build_array(jsonb_build_object(
        'user_id', v_seller_spn_id,
        'role_in_deal', 'seller_spn',
        'side', 'seller',
        'source', 'trusted_server_context'
      ));
    end if;
  end if;
  if v_accompanied_sides @> '["buyer"]'::jsonb then
    if v_buyer_spn_id is null then
      v_owner_gaps := v_owner_gaps || jsonb_build_array('buyer_spn');
    else
      v_participants := v_participants || jsonb_build_array(jsonb_build_object(
        'user_id', v_buyer_spn_id,
        'role_in_deal', 'buyer_spn',
        'side', 'buyer',
        'source', 'trusted_server_context'
      ));
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(v_work_plan->'document_candidates', '[]'::jsonb)) loop
    v_owner_role := coalesce(v_item->>'owner_role', '');
    v_owner_id := case v_owner_role
      when 'seller_spn' then v_seller_spn_id
      when 'buyer_spn' then v_buyer_spn_id
      when 'lead_spn' then v_lead_spn_id
      else null
    end;
    v_side := coalesce(v_item->>'side', '');
    if v_side not in ('seller', 'buyer', 'object', 'deal') then
      raise exception 'Governed document plan contains unsupported side' using errcode = '22023';
    end if;
    if v_side in ('seller', 'buyer') and not (v_accompanied_sides @> jsonb_build_array(v_side)) then
      raise exception 'Governed document plan crossed accompanied-side boundary' using errcode = '22023';
    end if;
    if v_owner_id is null then
      v_owner_gaps := v_owner_gaps || jsonb_build_array('document:' || coalesce(v_item->>'type', 'unknown'));
    end if;
    v_documents := v_documents || jsonb_build_array(
      v_item || jsonb_build_object(
        'owner_id', v_owner_id,
        'assignment_state', case when v_owner_id is null then 'blocked_unresolved' else 'resolved_server' end,
        'creation_state', 'planned'
      )
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(v_owner_context->'resolved_task_previews', '[]'::jsonb)) loop
    if nullif(v_item->>'owner_id', '') is null then
      v_owner_gaps := v_owner_gaps || jsonb_build_array('task:' || coalesce(v_item->>'rule_id', 'unknown'));
    end if;
    v_tasks := v_tasks || jsonb_build_array(
      v_item || jsonb_build_object(
        'assignment_state', case when nullif(v_item->>'owner_id', '') is null then 'blocked_unresolved' else 'resolved_server' end,
        'creation_state', 'planned'
      )
    );
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(v_adapter #> '{legal_passport,risk_flags}', '[]'::jsonb)) loop
    v_owner_role := coalesce(v_item->>'owner', '');
    v_owner_id := case v_owner_role
      when 'spn' then v_lead_spn_id
      when 'lawyer' then v_lawyer_id
      when 'broker' then v_broker_id
      else null
    end;
    if v_owner_id is null then
      v_owner_gaps := v_owner_gaps || jsonb_build_array('risk:' || coalesce(v_item->>'id', 'unknown'));
    end if;
    v_risks := v_risks || jsonb_build_array(
      v_item || jsonb_build_object('owner_id', v_owner_id, 'creation_state', 'planned')
    );
  end loop;

  if not coalesce((v_adapter->>'allowed')::boolean, false) then
    v_blockers := v_blockers || jsonb_build_array('adapter_gate_blocked');
  end if;
  if jsonb_array_length(v_owner_gaps) > 0 then
    v_blockers := v_blockers || jsonb_build_array('owner_resolution_incomplete');
  end if;
  if jsonb_array_length(v_unsupported) > 0 then
    v_blockers := v_blockers || jsonb_build_array('unsupported_rule_semantics');
  end if;
  v_allowed := jsonb_array_length(v_blockers) = 0;

  return jsonb_build_object(
    'write_plan_version', 1,
    'repository_only', true,
    'writes_performed', false,
    'client_request_id', v_preview->>'client_request_id',
    'payload_fingerprint', v_preview->>'payload_fingerprint',
    'fingerprint_scope', v_preview->>'fingerprint_scope',
    'allowed', v_allowed,
    'blockers', v_blockers,
    'unsupported_rule_ids', v_unsupported,
    'owner_gaps', v_owner_gaps,
    'replaces_legacy_document_scope', true,
    'replaces_legacy_actor_assignment', true,
    'deal', jsonb_build_object(
      'created_by', v_actor_id,
      'lead_spn_id', v_lead_spn_id,
      'seller_spn_id', v_seller_spn_id,
      'buyer_spn_id', v_buyer_spn_id,
      'lawyer_id', v_lawyer_id,
      'broker_id', v_broker_id,
      'representation_model', v_adapter #>> '{legal_passport,representation_model}',
      'preparation_mode', v_preview #>> '{legacy_payload,deal,preparationMode}',
      'object_type', v_adapter #>> '{legal_passport,object,type}',
      'address', v_adapter #>> '{legal_passport,object,address}',
      'wizard_snapshot', v_adapter->'prepared_payload',
      'legal_passport', v_adapter->'legal_passport',
      'intake_work_plan', v_work_plan
    ),
    'participants', v_participants,
    'documents', v_documents,
    'risks', v_risks,
    'tasks', v_tasks,
    'created_event', jsonb_build_object(
      'actor_id', v_actor_id,
      'event_type', 'intake_governed_created',
      'event_data', jsonb_build_object(
        'client_request_id', v_preview->>'client_request_id',
        'catalog_version', v_adapter->>'catalog_version',
        'catalog_sha256', v_adapter->>'catalog_sha256'
      )
    )
  );
end;
$function$;

create or replace function nav_v2_private.nav_v2_begin_intake_save_request_v1(p_plan jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, nav_v2_private
as $function$
declare
  v_request_id uuid := nullif(p_plan->>'client_request_id', '')::uuid;
  v_actor_id uuid := nullif(p_plan #>> '{deal,created_by}', '')::uuid;
  v_fingerprint text := nullif(p_plan->>'payload_fingerprint', '');
  v_existing nav_v2_private.nav_v2_intake_save_requests_v1%rowtype;
begin
  if not coalesce((p_plan->>'allowed')::boolean, false) then
    raise exception 'Governed intake write plan is blocked' using errcode = '22023';
  end if;
  if v_request_id is null or v_actor_id is null or v_fingerprint is null then
    raise exception 'Governed intake write plan is incomplete' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(nav_v2_private.nav_v2_intake_save_lock_key_v1(v_request_id));
  select * into v_existing
  from nav_v2_private.nav_v2_intake_save_requests_v1
  where client_request_id = v_request_id
  for update;

  if found then
    if v_existing.verified_actor_id <> v_actor_id or v_existing.payload_fingerprint <> v_fingerprint then
      raise exception 'client_request_id already belongs to another actor or payload' using errcode = '22023';
    end if;
    if v_existing.state = 'completed' then
      update nav_v2_private.nav_v2_intake_save_requests_v1
      set replay_count = replay_count + 1,
          updated_at = clock_timestamp()
      where client_request_id = v_request_id;
      return jsonb_build_object(
        'execute', false,
        'recovered_from_ledger', true,
        'result', v_existing.result_payload
      );
    end if;
    raise exception 'Stranded started request detected outside atomic boundary' using errcode = '55000';
  end if;

  insert into nav_v2_private.nav_v2_intake_save_requests_v1 (
    client_request_id, verified_actor_id, payload_fingerprint, state
  ) values (
    v_request_id, v_actor_id, v_fingerprint, 'started'
  );
  return jsonb_build_object('execute', true, 'recovered_from_ledger', false);
end;
$function$;

create or replace function nav_v2_private.nav_v2_complete_intake_save_request_v1(
  p_client_request_id uuid,
  p_verified_actor_id uuid,
  p_payload_fingerprint text,
  p_result jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, nav_v2_private
as $function$
declare
  v_rows integer;
begin
  if p_client_request_id is null or p_verified_actor_id is null
     or nullif(p_payload_fingerprint, '') is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'Governed intake completion is incomplete' using errcode = '22023';
  end if;

  update nav_v2_private.nav_v2_intake_save_requests_v1
  set state = 'completed',
      result_payload = p_result,
      completed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where client_request_id = p_client_request_id
    and verified_actor_id = p_verified_actor_id
    and payload_fingerprint = p_payload_fingerprint
    and state = 'started';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Governed intake request cannot be completed' using errcode = '55000';
  end if;
  return p_result;
end;
$function$;

revoke all on function nav_v2_private.nav_v2_intake_save_lock_key_v1(uuid) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_assert_intake_save_request_completed_v1() from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_build_governed_intake_write_plan_v1(jsonb, uuid, jsonb) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_begin_intake_save_request_v1(jsonb) from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_complete_intake_save_request_v1(uuid, uuid, text, jsonb) from public, anon, authenticated;

grant execute on function nav_v2_private.nav_v2_intake_save_lock_key_v1(uuid) to service_role;
grant execute on function nav_v2_private.nav_v2_build_governed_intake_write_plan_v1(jsonb, uuid, jsonb) to service_role;
grant execute on function nav_v2_private.nav_v2_begin_intake_save_request_v1(jsonb) to service_role;
grant execute on function nav_v2_private.nav_v2_complete_intake_save_request_v1(uuid, uuid, text, jsonb) to service_role;
