-- REPOSITORY-ONLY ACTOR-AWARE OVERLAY.
-- Apply only after nav_v2_bounded_task_contract.sql and nav_v2_bounded_task_mutations.sql
-- in an isolated PostgreSQL 17 environment.
-- No production migration, Edge deployment or frontend transport is authorized by this file.
--
-- Trust boundary:
--   bearer token is verified by Edge;
--   Edge supplies p_actor_id outside the client-controlled action payload;
--   only service_role may EXECUTE these overloads;
--   this overlay verifies an active Navigator profile and binds idempotent replay to that actor;
--   the canonical governed implementation still performs role/deal/task authorization.

create or replace function nav_v2_private.nav_v2_require_verified_actor(
  p_actor_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null then
    raise exception 'verified actor обязателен' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.nav_user_profiles p
    join auth.users u on u.id = p.id
    where p.id = p_actor_id
      and p.is_active is true
  ) then
    raise exception 'Verified actor не имеет активного профиля Navigator' using errcode = '42501';
  end if;

  return p_actor_id;
end;
$$;

create or replace function nav_v2_private.nav_v2_assert_actor_replay(
  p_client_request_id uuid,
  p_event_type text,
  p_actor_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.nav_deal_task_mutation_events_v2%rowtype;
begin
  if p_client_request_id is null then
    raise exception 'client_request_id обязателен' using errcode = '22023';
  end if;

  select e.* into v_event
  from public.nav_deal_task_mutation_events_v2 e
  where e.client_request_id = p_client_request_id
  limit 1;

  if not found then
    return;
  end if;
  if v_event.actor_id is distinct from p_actor_id then
    raise exception 'client_request_id принадлежит другому verified actor' using errcode = '42501';
  end if;
  if v_event.event_type is distinct from p_event_type then
    raise exception 'client_request_id уже использован другой операцией' using errcode = '22023';
  end if;
end;
$$;

create or replace function nav_v2_private.nav_v2_actor_claim_restore(
  p_previous_sub text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_previous_sub, ''), true);
end;
$$;

create or replace function public.nav_v2_create_bounded_tasks(
  p_deal_id uuid,
  p_items jsonb,
  p_client_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_result jsonb;
begin
  v_actor_id := nav_v2_private.nav_v2_require_verified_actor(p_actor_id);
  perform nav_v2_private.nav_v2_assert_actor_replay(p_client_request_id, 'create_selected', v_actor_id);
  perform set_config('request.jwt.claim.sub', v_actor_id::text, true);

  begin
    v_result := public.nav_v2_create_bounded_tasks(p_deal_id, p_items, p_client_request_id);
  exception when others then
    perform nav_v2_private.nav_v2_actor_claim_restore(v_previous_sub);
    raise;
  end;

  perform nav_v2_private.nav_v2_actor_claim_restore(v_previous_sub);
  return v_result || jsonb_build_object('verified_actor_id', v_actor_id, 'actor_aware', true);
end;
$$;

create or replace function public.nav_v2_start_bounded_task(
  p_task_id uuid,
  p_client_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_result jsonb;
begin
  v_actor_id := nav_v2_private.nav_v2_require_verified_actor(p_actor_id);
  perform nav_v2_private.nav_v2_assert_actor_replay(p_client_request_id, 'start_task', v_actor_id);
  perform set_config('request.jwt.claim.sub', v_actor_id::text, true);

  begin
    v_result := public.nav_v2_start_bounded_task(p_task_id, p_client_request_id);
  exception when others then
    perform nav_v2_private.nav_v2_actor_claim_restore(v_previous_sub);
    raise;
  end;

  perform nav_v2_private.nav_v2_actor_claim_restore(v_previous_sub);
  return v_result || jsonb_build_object('verified_actor_id', v_actor_id, 'actor_aware', true);
end;
$$;

create or replace function public.nav_v2_complete_bounded_task(
  p_task_id uuid,
  p_evidence_reference_id uuid,
  p_client_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_result jsonb;
begin
  v_actor_id := nav_v2_private.nav_v2_require_verified_actor(p_actor_id);
  perform nav_v2_private.nav_v2_assert_actor_replay(p_client_request_id, 'complete_task', v_actor_id);
  perform set_config('request.jwt.claim.sub', v_actor_id::text, true);

  begin
    v_result := public.nav_v2_complete_bounded_task(p_task_id, p_evidence_reference_id, p_client_request_id);
  exception when others then
    perform nav_v2_private.nav_v2_actor_claim_restore(v_previous_sub);
    raise;
  end;

  perform nav_v2_private.nav_v2_actor_claim_restore(v_previous_sub);
  return v_result || jsonb_build_object('verified_actor_id', v_actor_id, 'actor_aware', true);
end;
$$;

create or replace function public.nav_v2_set_bounded_task_active_outcome(
  p_task_id uuid,
  p_outcome_code text,
  p_reason_code text,
  p_review_date date,
  p_client_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_result jsonb;
begin
  v_actor_id := nav_v2_private.nav_v2_require_verified_actor(p_actor_id);
  perform nav_v2_private.nav_v2_assert_actor_replay(p_client_request_id, 'set_active_outcome', v_actor_id);
  perform set_config('request.jwt.claim.sub', v_actor_id::text, true);

  begin
    v_result := public.nav_v2_set_bounded_task_active_outcome(
      p_task_id, p_outcome_code, p_reason_code, p_review_date, p_client_request_id
    );
  exception when others then
    perform nav_v2_private.nav_v2_actor_claim_restore(v_previous_sub);
    raise;
  end;

  perform nav_v2_private.nav_v2_actor_claim_restore(v_previous_sub);
  return v_result || jsonb_build_object('verified_actor_id', v_actor_id, 'actor_aware', true);
end;
$$;

create or replace function public.nav_v2_propose_bounded_task_terminal_outcome(
  p_task_id uuid,
  p_outcome_code text,
  p_reason_code text,
  p_replacement_task_id uuid,
  p_client_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_result jsonb;
begin
  v_actor_id := nav_v2_private.nav_v2_require_verified_actor(p_actor_id);
  perform nav_v2_private.nav_v2_assert_actor_replay(p_client_request_id, 'propose_terminal_outcome', v_actor_id);
  perform set_config('request.jwt.claim.sub', v_actor_id::text, true);

  begin
    v_result := public.nav_v2_propose_bounded_task_terminal_outcome(
      p_task_id, p_outcome_code, p_reason_code, p_replacement_task_id, p_client_request_id
    );
  exception when others then
    perform nav_v2_private.nav_v2_actor_claim_restore(v_previous_sub);
    raise;
  end;

  perform nav_v2_private.nav_v2_actor_claim_restore(v_previous_sub);
  return v_result || jsonb_build_object('verified_actor_id', v_actor_id, 'actor_aware', true);
end;
$$;

create or replace function public.nav_v2_decide_bounded_task_terminal_outcome(
  p_task_id uuid,
  p_decision text,
  p_client_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_result jsonb;
begin
  v_actor_id := nav_v2_private.nav_v2_require_verified_actor(p_actor_id);
  perform nav_v2_private.nav_v2_assert_actor_replay(p_client_request_id, 'decide_terminal_outcome', v_actor_id);
  perform set_config('request.jwt.claim.sub', v_actor_id::text, true);

  begin
    v_result := public.nav_v2_decide_bounded_task_terminal_outcome(
      p_task_id, p_decision, p_client_request_id
    );
  exception when others then
    perform nav_v2_private.nav_v2_actor_claim_restore(v_previous_sub);
    raise;
  end;

  perform nav_v2_private.nav_v2_actor_claim_restore(v_previous_sub);
  return v_result || jsonb_build_object('verified_actor_id', v_actor_id, 'actor_aware', true);
end;
$$;

revoke execute on function nav_v2_private.nav_v2_require_verified_actor(uuid)
  from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_assert_actor_replay(uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_actor_claim_restore(text)
  from public, anon, authenticated;

revoke execute on function public.nav_v2_create_bounded_tasks(uuid, jsonb, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.nav_v2_start_bounded_task(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.nav_v2_complete_bounded_task(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.nav_v2_set_bounded_task_active_outcome(uuid, text, text, date, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.nav_v2_propose_bounded_task_terminal_outcome(uuid, text, text, uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.nav_v2_decide_bounded_task_terminal_outcome(uuid, text, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.nav_v2_create_bounded_tasks(uuid, jsonb, uuid, uuid) to service_role;
grant execute on function public.nav_v2_start_bounded_task(uuid, uuid, uuid) to service_role;
grant execute on function public.nav_v2_complete_bounded_task(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.nav_v2_set_bounded_task_active_outcome(uuid, text, text, date, uuid, uuid) to service_role;
grant execute on function public.nav_v2_propose_bounded_task_terminal_outcome(uuid, text, text, uuid, uuid, uuid) to service_role;
grant execute on function public.nav_v2_decide_bounded_task_terminal_outcome(uuid, text, uuid, uuid) to service_role;

-- Explicit non-goals:
-- no change to canonical three/five-argument governed RPC implementations;
-- no authenticated EXECUTE on actor-aware overloads;
-- no trust in client-supplied actor fields;
-- no mass backfill, automatic task creation, deal/document/risk mutation or readiness change;
-- no production migration, Edge import/deploy or frontend bounded transport.
