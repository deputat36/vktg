\set ON_ERROR_STOP on

create or replace function harness.governed_intake_server_context(
  p_actor_id uuid default '63000000-0000-4000-8000-000000000001'::uuid,
  p_actor_role text default 'spn',
  p_lead_spn_id uuid default '63000000-0000-4000-8000-000000000001'::uuid,
  p_seller_spn_id uuid default '63000000-0000-4000-8000-000000000001'::uuid,
  p_buyer_spn_id uuid default '63000000-0000-4000-8000-000000000001'::uuid,
  p_lawyer_id uuid default '63000000-0000-4000-8000-000000000003'::uuid,
  p_broker_id uuid default '63000000-0000-4000-8000-000000000004'::uuid
)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'verified_actor_id', p_actor_id,
    'verified_actor_role', p_actor_role,
    'lead_spn_id', p_lead_spn_id,
    'seller_spn_id', p_seller_spn_id,
    'buyer_spn_id', p_buyer_spn_id,
    'lawyer_id', p_lawyer_id,
    'broker_id', p_broker_id
  );
$$;

create or replace function harness.concurrent_intake()
returns jsonb
language sql
immutable
set search_path = pg_catalog, harness
as $$
  select jsonb_set(
    jsonb_set(harness.base_intake(), '{deal,intake_action}', '"self"'::jsonb, true),
    '{deal,intake_draft,representation}', '"one_spn_both"'::jsonb, true
  );
$$;

create table harness.nav_v2_governed_deals (
  id uuid primary key,
  client_request_id uuid not null unique,
  created_by uuid not null,
  lead_spn_id uuid not null,
  seller_spn_id uuid,
  buyer_spn_id uuid,
  lawyer_id uuid,
  broker_id uuid,
  payload jsonb not null
);

create table harness.nav_v2_governed_participants (
  client_request_id uuid not null references harness.nav_v2_governed_deals(client_request_id) on delete cascade,
  user_id uuid not null,
  role_in_deal text not null,
  side text not null,
  payload jsonb not null,
  primary key (client_request_id, user_id, role_in_deal, side)
);

create table harness.nav_v2_governed_documents (
  client_request_id uuid not null references harness.nav_v2_governed_deals(client_request_id) on delete cascade,
  document_type text not null,
  side text not null check (side in ('seller', 'buyer', 'object', 'deal')),
  assigned_to uuid not null,
  payload jsonb not null,
  primary key (client_request_id, document_type)
);

create table harness.nav_v2_governed_risks (
  client_request_id uuid not null references harness.nav_v2_governed_deals(client_request_id) on delete cascade,
  risk_id text not null,
  assigned_to uuid not null,
  payload jsonb not null,
  primary key (client_request_id, risk_id)
);

create table harness.nav_v2_governed_tasks (
  client_request_id uuid not null references harness.nav_v2_governed_deals(client_request_id) on delete cascade,
  task_id text not null,
  assigned_to uuid not null,
  owner_role text not null,
  payload jsonb not null,
  primary key (client_request_id, task_id)
);

create table harness.nav_v2_governed_events (
  client_request_id uuid primary key references harness.nav_v2_governed_deals(client_request_id) on delete cascade,
  actor_id uuid not null,
  event_type text not null,
  payload jsonb not null
);

create or replace function harness.mock_governed_intake_save_v1(
  p_result jsonb,
  p_client_request_id uuid,
  p_server_context jsonb,
  p_fail_after_rows boolean default false,
  p_delay_seconds numeric default 0
)
returns jsonb
language plpgsql
volatile
set search_path = pg_catalog, harness, nav_v2_private
as $function$
declare
  v_plan jsonb;
  v_claim jsonb;
  v_item jsonb;
  v_deal_id uuid := p_client_request_id;
  v_result jsonb;
begin
  v_plan := nav_v2_private.nav_v2_build_governed_intake_write_plan_v1(
    p_result,
    p_client_request_id,
    p_server_context
  );
  if not coalesce((v_plan->>'allowed')::boolean, false) then
    raise exception 'Governed intake mock rejected blocked write plan: %', v_plan->'blockers'
      using errcode = '22023';
  end if;

  v_claim := nav_v2_private.nav_v2_begin_intake_save_request_v1(v_plan);
  if not coalesce((v_claim->>'execute')::boolean, false) then
    return (v_claim->'result') || jsonb_build_object(
      'idempotent', true,
      'recovered_from_ledger', true
    );
  end if;

  insert into harness.nav_v2_governed_deals (
    id, client_request_id, created_by, lead_spn_id, seller_spn_id,
    buyer_spn_id, lawyer_id, broker_id, payload
  ) values (
    v_deal_id,
    p_client_request_id,
    (v_plan #>> '{deal,created_by}')::uuid,
    (v_plan #>> '{deal,lead_spn_id}')::uuid,
    nullif(v_plan #>> '{deal,seller_spn_id}', '')::uuid,
    nullif(v_plan #>> '{deal,buyer_spn_id}', '')::uuid,
    nullif(v_plan #>> '{deal,lawyer_id}', '')::uuid,
    nullif(v_plan #>> '{deal,broker_id}', '')::uuid,
    v_plan->'deal'
  );

  for v_item in select value from jsonb_array_elements(v_plan->'participants') loop
    insert into harness.nav_v2_governed_participants (
      client_request_id, user_id, role_in_deal, side, payload
    ) values (
      p_client_request_id,
      (v_item->>'user_id')::uuid,
      v_item->>'role_in_deal',
      v_item->>'side',
      v_item
    );
  end loop;

  for v_item in select value from jsonb_array_elements(v_plan->'documents') loop
    insert into harness.nav_v2_governed_documents (
      client_request_id, document_type, side, assigned_to, payload
    ) values (
      p_client_request_id,
      v_item->>'type',
      v_item->>'side',
      (v_item->>'owner_id')::uuid,
      v_item
    );
  end loop;

  for v_item in select value from jsonb_array_elements(v_plan->'risks') loop
    insert into harness.nav_v2_governed_risks (
      client_request_id, risk_id, assigned_to, payload
    ) values (
      p_client_request_id,
      v_item->>'id',
      (v_item->>'owner_id')::uuid,
      v_item
    );
  end loop;

  for v_item in select value from jsonb_array_elements(v_plan->'tasks') loop
    insert into harness.nav_v2_governed_tasks (
      client_request_id, task_id, assigned_to, owner_role, payload
    ) values (
      p_client_request_id,
      v_item->>'id',
      (v_item->>'owner_id')::uuid,
      v_item->>'owner_role',
      v_item
    );
  end loop;

  insert into harness.nav_v2_governed_events (
    client_request_id, actor_id, event_type, payload
  ) values (
    p_client_request_id,
    (v_plan #>> '{created_event,actor_id}')::uuid,
    v_plan #>> '{created_event,event_type}',
    v_plan->'created_event'
  );

  if p_delay_seconds > 0 then
    perform pg_sleep(p_delay_seconds::double precision);
  end if;
  if p_fail_after_rows then
    raise exception 'Injected failure after shadow business rows' using errcode = '40001';
  end if;

  v_result := jsonb_build_object(
    'deal_id', v_deal_id,
    'client_request_id', p_client_request_id,
    'idempotent', false,
    'recovered_from_ledger', false,
    'row_counts', jsonb_build_object(
      'deal', 1,
      'participants', jsonb_array_length(v_plan->'participants'),
      'documents', jsonb_array_length(v_plan->'documents'),
      'risks', jsonb_array_length(v_plan->'risks'),
      'tasks', jsonb_array_length(v_plan->'tasks'),
      'events', 1
    )
  );

  perform nav_v2_private.nav_v2_complete_intake_save_request_v1(
    p_client_request_id,
    (v_plan #>> '{deal,created_by}')::uuid,
    v_plan->>'payload_fingerprint',
    v_result
  );
  return v_result;
end;
$function$;
