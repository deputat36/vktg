\set ON_ERROR_STOP on

create temporary table actor_task_ids (
  name text primary key,
  id uuid not null
);

create or replace function pg_temp.expect_actor_error(p_sql text, p_message_fragment text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'Expected actor-aware error was not raised: %', p_sql;
exception
  when others then
    if sqlerrm like 'Expected actor-aware error was not raised:%' then
      raise;
    end if;
    if position(p_message_fragment in sqlerrm) = 0 then
      raise exception 'Unexpected actor-aware error. Expected fragment %, got %', p_message_fragment, sqlerrm;
    end if;
end;
$$;

-- Actor-aware overloads are service-role-only; canonical governed signatures remain present.
do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid,uuid)',
    'public.nav_v2_start_bounded_task(uuid,uuid,uuid)',
    'public.nav_v2_complete_bounded_task(uuid,uuid,uuid,uuid)',
    'public.nav_v2_set_bounded_task_active_outcome(uuid,text,text,date,uuid,uuid)',
    'public.nav_v2_propose_bounded_task_terminal_outcome(uuid,text,text,uuid,uuid,uuid)',
    'public.nav_v2_decide_bounded_task_terminal_outcome(uuid,text,uuid,uuid)'
  ] loop
    if has_function_privilege('authenticated', v_signature, 'EXECUTE') then
      raise exception 'authenticated unexpectedly has actor-aware EXECUTE on %', v_signature;
    end if;
    if not has_function_privilege('service_role', v_signature, 'EXECUTE') then
      raise exception 'service_role is missing actor-aware EXECUTE on %', v_signature;
    end if;
  end loop;

  if to_regprocedure('public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid)') is null
     or to_regprocedure('public.nav_v2_start_bounded_task(uuid,uuid)') is null
     or to_regprocedure('public.nav_v2_complete_bounded_task(uuid,uuid,uuid)') is null then
    raise exception 'canonical governed RPC signatures were replaced by actor-aware overlay';
  end if;
end;
$$;

-- The Edge/service-role path begins without a user claim.
select set_config('request.jwt.claim.sub', '', false);

with response as (
  select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'task_type', 'document_request',
        'assigned_role', 'spn',
        'assigned_to', '00000000-0000-4000-8000-000000000004',
        'evidence_kind', 'document_status',
        'priority', 'high',
        'subject_kind', 'document',
        'subject_reference_id', '31000000-0000-4000-8000-000000000001'
      ),
      jsonb_build_object(
        'task_type', 'legal_decision',
        'assigned_role', 'lawyer',
        'assigned_to', '00000000-0000-4000-8000-000000000007',
        'evidence_kind', 'review_decision',
        'subject_kind', 'review',
        'subject_reference_id', '31000000-0000-4000-8000-000000000002'
      ),
      jsonb_build_object(
        'task_type', 'appointment_scheduling',
        'assigned_role', 'spn',
        'assigned_to', '00000000-0000-4000-8000-000000000004',
        'evidence_kind', 'calendar_event',
        'subject_kind', 'calendar',
        'subject_reference_id', '31000000-0000-4000-8000-000000000003'
      )
    ),
    '41000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000004'
  ) as payload
)
insert into actor_task_ids(name, id)
select 'document_request', (payload->'tasks'->0->>'id')::uuid from response
union all
select 'legal_decision', (payload->'tasks'->1->>'id')::uuid from response
union all
select 'appointment', (payload->'tasks'->2->>'id')::uuid from response;

-- Claim is restored and actor is persisted in task/audit state.
do $$
declare
  v_event public.nav_deal_task_mutation_events_v2%rowtype;
begin
  if auth.uid() is not null then
    raise exception 'verified actor claim leaked after actor-aware create';
  end if;

  if exists (
    select 1
    from public.nav_deal_tasks_v2 t
    where t.id in (select id from actor_task_ids)
      and t.created_by is distinct from '00000000-0000-4000-8000-000000000004'::uuid
  ) then
    raise exception 'created_by did not preserve verified actor';
  end if;

  select * into v_event
  from public.nav_deal_task_mutation_events_v2
  where client_request_id='41000000-0000-4000-8000-000000000001';
  if v_event.actor_id is distinct from '00000000-0000-4000-8000-000000000004'::uuid
     or v_event.actor_role <> 'spn'::public.nav_v2_user_role
     or v_event.event_type <> 'create_selected' then
    raise exception 'create audit actor mismatch: %', row_to_json(v_event);
  end if;
end;
$$;

-- Same actor replays idempotently without duplicate tasks/events.
do $$
declare
  v_before integer;
  v_after integer;
  v_event_before integer;
  v_event_after integer;
  v_payload jsonb;
begin
  select count(*) into v_before from public.nav_deal_tasks_v2 where id in (select id from actor_task_ids);
  select count(*) into v_event_before from public.nav_deal_task_mutation_events_v2
    where client_request_id='41000000-0000-4000-8000-000000000001';

  v_payload := public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'task_type', 'document_request',
      'assigned_role', 'spn',
      'assigned_to', '00000000-0000-4000-8000-000000000004',
      'evidence_kind', 'document_status',
      'subject_kind', 'document',
      'subject_reference_id', '31000000-0000-4000-8000-000000000001'
    )),
    '41000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000004'
  );

  select count(*) into v_after from public.nav_deal_tasks_v2 where id in (select id from actor_task_ids);
  select count(*) into v_event_after from public.nav_deal_task_mutation_events_v2
    where client_request_id='41000000-0000-4000-8000-000000000001';

  if v_before <> v_after
     or v_event_before <> v_event_after
     or coalesce((v_payload->>'idempotent_replay')::boolean, false) is not true
     or v_payload->>'verified_actor_id' <> '00000000-0000-4000-8000-000000000004'
     or coalesce((v_payload->>'actor_aware')::boolean, false) is not true then
    raise exception 'same-actor replay contract mismatch: %', v_payload;
  end if;
  if auth.uid() is not null then raise exception 'verified actor claim leaked after replay'; end if;
end;
$$;

-- A different verified actor cannot claim the same idempotency key.
select pg_temp.expect_actor_error(
  $q$select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    '[]'::jsonb,
    '41000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000003'
  )$q$,
  'принадлежит другому verified actor'
);

-- An active but unrelated SPN still fails canonical deal authorization.
select pg_temp.expect_actor_error(
  $q$select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    '[{"task_type":"document_request","assigned_role":"spn","assigned_to":"00000000-0000-4000-8000-000000000004","evidence_kind":"document_status","subject_kind":"document","subject_reference_id":"31000000-0000-4000-8000-000000000099"}]'::jsonb,
    '41000000-0000-4000-8000-000000000099',
    '00000000-0000-4000-8000-000000000006'
  )$q$,
  'Нет прав менять задачи сделки'
);

-- Missing/inactive verified actors fail before canonical lifecycle execution.
update public.nav_user_profiles set is_active=false where id='00000000-0000-4000-8000-000000000009';
select pg_temp.expect_actor_error(
  $q$select public.nav_v2_start_bounded_task(
    (select id from actor_task_ids where name='document_request'),
    '41000000-0000-4000-8000-000000000098',
    '00000000-0000-4000-8000-000000000009'
  )$q$,
  'не имеет активного профиля Navigator'
);

-- Assigned SPN starts and completes the document task through actor-aware overloads.
select public.nav_v2_start_bounded_task(
  (select id from actor_task_ids where name='document_request'),
  '41000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000004'
);

select public.nav_v2_complete_bounded_task(
  (select id from actor_task_ids where name='document_request'),
  '31000000-0000-4000-8000-000000000010',
  '41000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004'
);

-- Assigned SPN sets an active outcome on the appointment task.
select public.nav_v2_set_bounded_task_active_outcome(
  (select id from actor_task_ids where name='appointment'),
  'waiting_external',
  'awaiting_counterparty',
  current_date + 5,
  '41000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000004'
);

-- Assigned lawyer proposes a terminal outcome; manager confirms it.
select public.nav_v2_propose_bounded_task_terminal_outcome(
  (select id from actor_task_ids where name='legal_decision'),
  'not_applicable',
  'no_longer_required',
  null,
  '41000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000007'
);

select public.nav_v2_decide_bounded_task_terminal_outcome(
  (select id from actor_task_ids where name='legal_decision'),
  'confirm',
  '41000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000003'
);

-- Every actor-aware event contains the verified actor and no claim leaks between calls.
do $$
declare
  v_bad integer;
begin
  select count(*) into v_bad
  from public.nav_deal_task_mutation_events_v2 e
  where e.client_request_id between '41000000-0000-4000-8000-000000000001'::uuid
                                and '41000000-0000-4000-8000-000000000006'::uuid
    and e.actor_id is distinct from case e.client_request_id
      when '41000000-0000-4000-8000-000000000005'::uuid then '00000000-0000-4000-8000-000000000007'::uuid
      when '41000000-0000-4000-8000-000000000006'::uuid then '00000000-0000-4000-8000-000000000003'::uuid
      else '00000000-0000-4000-8000-000000000004'::uuid
    end;
  if v_bad <> 0 then raise exception 'actor-aware audit contains mismatched actor rows'; end if;

  if auth.uid() is not null then raise exception 'verified actor claim leaked after lifecycle'; end if;

  if not exists (
    select 1 from public.nav_deal_tasks_v2
    where id=(select id from actor_task_ids where name='document_request')
      and status='done'
      and completed_by='00000000-0000-4000-8000-000000000004'
      and evidence_reference_id='31000000-0000-4000-8000-000000000010'
  ) then raise exception 'actor-aware completion state mismatch'; end if;

  if not exists (
    select 1 from public.nav_deal_tasks_v2
    where id=(select id from actor_task_ids where name='appointment')
      and status='in_progress'
      and outcome_code='waiting_external'
      and outcome_state='confirmed'
  ) then raise exception 'actor-aware active outcome state mismatch'; end if;

  if not exists (
    select 1 from public.nav_deal_tasks_v2
    where id=(select id from actor_task_ids where name='legal_decision')
      and status='cancelled'
      and outcome_code='not_applicable'
      and outcome_state='confirmed'
      and outcome_proposed_by='00000000-0000-4000-8000-000000000007'
      and outcome_decided_by='00000000-0000-4000-8000-000000000003'
  ) then raise exception 'actor-aware terminal decision state mismatch'; end if;
end;
$$;

select 'PostgreSQL actor-aware bounded task lifecycle assertions passed' as result;
