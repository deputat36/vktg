-- REPOSITORY-ONLY PROTOTYPE.
-- Apply after nav_v2_bounded_task_contract.sql in an isolated PostgreSQL 17 environment.
-- Do not apply to production before authenticated application E2E and a separate deploy PR.
-- Existing legacy tasks remain unchanged and are never backfilled by this file.

alter table public.nav_deal_tasks_v2
  add column if not exists subject_kind text,
  add column if not exists subject_reference_id uuid,
  add column if not exists outcome_proposed_by uuid references auth.users(id) on delete set null,
  add column if not exists outcome_proposed_at timestamptz,
  add column if not exists outcome_decided_by uuid references auth.users(id) on delete set null,
  add column if not exists outcome_decided_at timestamptz;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_task_type_check;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_subject_kind_check,
  add constraint nav_deal_tasks_v2_subject_kind_check check (
    subject_kind is null
    or subject_kind in ('deal', 'document', 'review', 'corporate_document', 'calendar', 'external_confirmation')
  ) not valid;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_subject_required_check,
  add constraint nav_deal_tasks_v2_subject_required_check check (
    task_contract_version is null
    or (subject_kind is not null and subject_reference_id is not null)
  ) not valid;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_terminal_status_check,
  add constraint nav_deal_tasks_v2_terminal_status_check check (
    task_contract_version is null
    or status <> 'cancelled'::public.nav_v2_task_status
    or (
      outcome_code in ('not_applicable', 'replaced', 'cancelled')
      and outcome_state = 'confirmed'
      and completed_by is not null
      and completed_at is not null
    )
  ) not valid;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_completed_outcome_status_check,
  add constraint nav_deal_tasks_v2_completed_outcome_status_check check (
    task_contract_version is null
    or outcome_code <> 'completed'
    or (
      status = 'done'::public.nav_v2_task_status
      and outcome_state = 'confirmed'
      and evidence_reference_id is not null
      and evidence_confirmed_at is not null
    )
  ) not valid;

create unique index if not exists nav_bounded_tasks_active_subject_owner_idx
  on public.nav_deal_tasks_v2(
    deal_id, task_type, subject_kind, subject_reference_id, assigned_to
  )
  where task_contract_version = 2
    and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status);

create table if not exists public.nav_deal_task_mutation_events_v2 (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.nav_deals_v2(id) on delete cascade,
  task_id uuid references public.nav_deal_tasks_v2(id) on delete set null,
  event_type text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_role public.nav_v2_user_role not null,
  client_request_id uuid not null unique,
  before_state jsonb,
  after_state jsonb,
  result_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint nav_task_mutation_event_type_check check (
    event_type in (
      'create_selected',
      'start_task',
      'complete_task',
      'set_active_outcome',
      'propose_terminal_outcome',
      'decide_terminal_outcome'
    )
  )
);

alter table public.nav_deal_task_mutation_events_v2 enable row level security;
revoke all on table public.nav_deal_task_mutation_events_v2 from public, anon, authenticated;
grant all on table public.nav_deal_task_mutation_events_v2 to service_role;

create index if not exists nav_task_mutation_events_deal_created_idx
  on public.nav_deal_task_mutation_events_v2(deal_id, created_at desc);
create index if not exists nav_task_mutation_events_task_created_idx
  on public.nav_deal_task_mutation_events_v2(task_id, created_at desc)
  where task_id is not null;

create or replace function nav_v2_private.nav_v2_bounded_task_json(p_task_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'deal_id', t.deal_id,
    'task_contract_version', t.task_contract_version,
    'task_type', t.task_type,
    'assigned_role', t.assigned_role,
    'assigned_to', t.assigned_to,
    'status', t.status,
    'priority', t.priority,
    'due_date', t.due_date,
    'sla_days', t.sla_days,
    'completion_criterion_code', t.completion_criterion_code,
    'evidence_kind', t.evidence_kind,
    'evidence_reference_id', t.evidence_reference_id,
    'evidence_confirmed_at', t.evidence_confirmed_at,
    'gate_scope', t.gate_scope,
    'subject_kind', t.subject_kind,
    'subject_reference_id', t.subject_reference_id,
    'outcome_code', t.outcome_code,
    'outcome_state', t.outcome_state,
    'outcome_reason_code', t.outcome_reason_code,
    'outcome_review_date', t.outcome_review_date,
    'outcome_replacement_task_id', t.outcome_replacement_task_id,
    'completed_by', t.completed_by,
    'completed_at', t.completed_at,
    'updated_at', t.updated_at
  )
  from public.nav_deal_tasks_v2 t
  where t.id = p_task_id;
$$;

create or replace function nav_v2_private.nav_v2_bounded_task_replay(
  p_client_request_id uuid,
  p_event_type text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.nav_deal_task_mutation_events_v2%rowtype;
begin
  select e.* into v_event
  from public.nav_deal_task_mutation_events_v2 e
  where e.client_request_id = p_client_request_id
  limit 1;

  if not found then
    return null;
  end if;
  if v_event.event_type <> p_event_type then
    raise exception 'client_request_id уже использован другой операцией' using errcode = '22023';
  end if;

  return v_event.result_payload || jsonb_build_object('idempotent_replay', true);
end;
$$;

create or replace function nav_v2_private.nav_v2_bounded_task_subject_allowed(
  p_task_type text,
  p_subject_kind text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case coalesce(p_task_type, '')
    when 'document_request' then p_subject_kind = 'document'
    when 'document_check' then p_subject_kind in ('document', 'review')
    when 'term_approval' then p_subject_kind in ('deal', 'external_confirmation')
    when 'legal_decision' then p_subject_kind in ('deal', 'review')
    when 'financial_decision' then p_subject_kind in ('deal', 'review')
    when 'corporate_document_signing' then p_subject_kind = 'corporate_document'
    when 'card_correction' then p_subject_kind = 'deal'
    when 'contract_preparation' then p_subject_kind in ('deal', 'review')
    when 'appointment_scheduling' then p_subject_kind in ('calendar', 'deal')
    when 'post_deal_action' then p_subject_kind in ('deal', 'corporate_document', 'external_confirmation')
    else false
  end;
$$;

create or replace function nav_v2_private.nav_v2_bounded_task_reason_allowed(
  p_outcome_code text,
  p_reason_code text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case coalesce(p_outcome_code, '')
    when 'waiting_external' then p_reason_code in ('awaiting_counterparty', 'awaiting_bank', 'awaiting_document')
    when 'deferred' then p_reason_code in ('postponed_by_client', 'route_changed')
    when 'not_applicable' then p_reason_code in ('no_longer_required', 'route_changed')
    when 'replaced' then p_reason_code in ('replaced_by_specific_task', 'duplicate_work_item')
    when 'cancelled' then p_reason_code in ('process_cancelled', 'route_changed')
    else false
  end;
$$;

create or replace function nav_v2_private.nav_v2_can_operate_bounded_task(
  p_task_id uuid,
  p_uid uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nav_deal_tasks_v2 t
    join public.nav_user_profiles caller on caller.id = p_uid and caller.is_active is true
    where t.id = p_task_id
      and t.task_contract_version = 2
      and (
        caller.role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role)
        or (
          caller.role = 'manager'::public.nav_v2_user_role
          and nav_v2_private.nav_v2_can_edit_deal(t.deal_id, p_uid)
        )
        or t.assigned_to = p_uid
      )
  );
$$;

create or replace function nav_v2_private.nav_v2_can_decide_bounded_task(
  p_task_id uuid,
  p_uid uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nav_deal_tasks_v2 t
    join public.nav_user_profiles caller on caller.id = p_uid and caller.is_active is true
    where t.id = p_task_id
      and t.task_contract_version = 2
      and (
        caller.role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role)
        or (
          caller.role = 'manager'::public.nav_v2_user_role
          and nav_v2_private.nav_v2_can_edit_deal(t.deal_id, p_uid)
        )
      )
  );
$$;

create or replace function public.nav_v2_create_bounded_tasks(
  p_deal_id uuid,
  p_items jsonb,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.nav_user_profiles%rowtype;
  v_replay jsonb;
  v_item jsonb;
  v_unknown text[];
  v_catalog record;
  v_task_type text;
  v_assigned_role public.nav_v2_user_role;
  v_assigned_to uuid;
  v_sla_days integer;
  v_evidence_kind text;
  v_priority public.nav_v2_task_priority;
  v_subject_kind text;
  v_subject_reference_id uuid;
  v_manager_id uuid;
  v_seller_spn_id uuid;
  v_buyer_spn_id uuid;
  v_lawyer_id uuid;
  v_broker_id uuid;
  v_assignee_role public.nav_v2_user_role;
  v_task_id uuid;
  v_created jsonb := '[]'::jsonb;
  v_count integer;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    raise exception 'client_request_id обязателен' using errcode = '22023';
  end if;

  v_replay := nav_v2_private.nav_v2_bounded_task_replay(p_client_request_id, 'create_selected');
  if v_replay is not null then return v_replay; end if;

  select p.* into v_profile
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;

  if not found or v_profile.role not in ('spn', 'manager', 'owner', 'admin') then
    raise exception 'Нет прав создавать bounded-задачи' using errcode = '42501';
  end if;
  if not nav_v2_private.nav_v2_can_edit_deal(p_deal_id, v_uid) then
    raise exception 'Нет прав менять задачи сделки' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items должен быть JSON-массивом' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_items);
  if v_count < 1 or v_count > 5 then
    raise exception 'Выберите от 1 до 5 задач' using errcode = '22023';
  end if;

  select d.manager_id, d.seller_spn_id, d.buyer_spn_id, d.lawyer_id, d.broker_id
    into v_manager_id, v_seller_spn_id, v_buyer_spn_id, v_lawyer_id, v_broker_id
  from public.nav_deals_v2 d
  where d.id = p_deal_id;
  if not found then raise exception 'Сделка не найдена' using errcode = 'P0002'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Каждый элемент p_items должен быть объектом' using errcode = '22023';
    end if;

    select coalesce(array_agg(key), '{}'::text[]) into v_unknown
    from jsonb_object_keys(v_item) key
    where key not in (
      'task_type', 'assigned_role', 'assigned_to', 'sla_days',
      'evidence_kind', 'priority', 'subject_kind', 'subject_reference_id'
    );
    if cardinality(v_unknown) > 0 then
      raise exception 'Неизвестные поля bounded-задачи: %', array_to_string(v_unknown, ', ')
        using errcode = '22023';
    end if;

    v_task_type := nullif(trim(coalesce(v_item ->> 'task_type', '')), '');
    v_assigned_role := nullif(trim(coalesce(v_item ->> 'assigned_role', '')), '')::public.nav_v2_user_role;
    v_assigned_to := nullif(trim(coalesce(v_item ->> 'assigned_to', '')), '')::uuid;
    v_sla_days := nullif(trim(coalesce(v_item ->> 'sla_days', '')), '')::integer;
    v_evidence_kind := nullif(trim(coalesce(v_item ->> 'evidence_kind', '')), '');
    v_priority := coalesce(
      nullif(trim(coalesce(v_item ->> 'priority', '')), '')::public.nav_v2_task_priority,
      'normal'::public.nav_v2_task_priority
    );
    v_subject_kind := nullif(trim(coalesce(v_item ->> 'subject_kind', '')), '');
    v_subject_reference_id := nullif(trim(coalesce(v_item ->> 'subject_reference_id', '')), '')::uuid;

    select * into v_catalog
    from nav_v2_private.nav_v2_task_contract_catalog() c
    where c.task_type = v_task_type
    limit 1;
    if not found then
      raise exception 'Неизвестный bounded task_type: %', coalesce(v_task_type, '<null>') using errcode = '22023';
    end if;

    if v_assigned_role is null or not (v_assigned_role = any(v_catalog.allowed_owner_roles)) then
      raise exception 'Роль % не может владеть задачей %', coalesce(v_assigned_role::text, '<null>'), v_task_type
        using errcode = '22023';
    end if;
    if v_assigned_to is null then
      raise exception 'Для bounded-задачи нужен конкретный assigned_to' using errcode = '22023';
    end if;

    select p.role into v_assignee_role
    from public.nav_user_profiles p
    where p.id = v_assigned_to and p.is_active is true
    limit 1;
    if not found or v_assignee_role is distinct from v_assigned_role then
      raise exception 'Назначенный сотрудник неактивен или его роль не совпадает с assigned_role'
        using errcode = '22023';
    end if;

    if (
         v_assigned_role = 'spn'
         and not (
           v_assigned_to is not distinct from v_seller_spn_id
           or v_assigned_to is not distinct from v_buyer_spn_id
         )
       )
       or (v_assigned_role = 'manager' and v_assigned_to is distinct from v_manager_id)
       or (v_assigned_role = 'lawyer' and v_assigned_to is distinct from v_lawyer_id)
       or (v_assigned_role = 'broker' and v_assigned_to is distinct from v_broker_id) then
      raise exception 'Назначенный сотрудник не соответствует роли в этой сделке' using errcode = '22023';
    end if;

    v_sla_days := coalesce(v_sla_days, v_catalog.default_sla_days);
    if v_sla_days < 1 or v_sla_days > v_catalog.max_sla_days then
      raise exception 'SLA для % должен быть от 1 до % дней', v_task_type, v_catalog.max_sla_days
        using errcode = '22023';
    end if;
    if v_evidence_kind is null or not (v_evidence_kind = any(v_catalog.allowed_evidence_kinds)) then
      raise exception 'Недопустимый evidence_kind для задачи %', v_task_type using errcode = '22023';
    end if;
    if v_subject_reference_id is null
       or not nav_v2_private.nav_v2_bounded_task_subject_allowed(v_task_type, v_subject_kind) then
      raise exception 'Недопустимый subject для задачи %', v_task_type using errcode = '22023';
    end if;
    if v_subject_kind = 'deal' and v_subject_reference_id is distinct from p_deal_id then
      raise exception 'Для subject_kind=deal subject_reference_id должен совпадать со сделкой'
        using errcode = '22023';
    end if;

    begin
      insert into public.nav_deal_tasks_v2 (
        deal_id, title, description, assigned_to, assigned_role, status, priority,
        due_date, source, created_by, task_type, sla_days, task_contract_version,
        completion_criterion_code, evidence_kind, gate_scope,
        subject_kind, subject_reference_id
      ) values (
        p_deal_id, v_catalog.label, null, v_assigned_to, v_assigned_role,
        'open'::public.nav_v2_task_status, v_priority,
        current_date + v_sla_days, 'bounded_contract_v2', v_uid,
        v_task_type, v_sla_days, 2,
        v_catalog.completion_criterion_code, v_evidence_kind, v_catalog.default_gate_scope,
        v_subject_kind, v_subject_reference_id
      )
      returning id into v_task_id;
    exception
      when unique_violation then
        raise exception 'Активная задача такого типа, предмета и владельца уже существует'
          using errcode = '23505';
    end;

    v_created := v_created || jsonb_build_array(nav_v2_private.nav_v2_bounded_task_json(v_task_id));
  end loop;

  v_result := jsonb_build_object(
    'ok', true,
    'deal_id', p_deal_id,
    'created_count', jsonb_array_length(v_created),
    'tasks', v_created,
    'legacy_rows_backfilled', false,
    'automatic_backlog_created', false,
    'deal_readiness_changed', false,
    'risk_gate_changed', false,
    'deal_status_changed', false
  );

  insert into public.nav_deal_task_mutation_events_v2 (
    deal_id, task_id, event_type, actor_id, actor_role, client_request_id,
    before_state, after_state, result_payload
  ) values (
    p_deal_id, null, 'create_selected', v_uid, v_profile.role, p_client_request_id,
    null, v_created, v_result
  );

  return v_result;
end;
$$;

create or replace function public.nav_v2_start_bounded_task(
  p_task_id uuid,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.nav_user_profiles%rowtype;
  v_task public.nav_deal_tasks_v2%rowtype;
  v_replay jsonb;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Пользователь не авторизован' using errcode = '42501'; end if;
  if p_client_request_id is null then raise exception 'client_request_id обязателен' using errcode = '22023'; end if;

  v_replay := nav_v2_private.nav_v2_bounded_task_replay(p_client_request_id, 'start_task');
  if v_replay is not null then return v_replay; end if;

  select p.* into v_profile from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true limit 1;
  if not found then raise exception 'Нет активного профиля Navigator' using errcode = '42501'; end if;

  select t.* into v_task from public.nav_deal_tasks_v2 t where t.id = p_task_id for update;
  if not found or v_task.task_contract_version is distinct from 2 then
    raise exception 'Bounded-задача не найдена' using errcode = 'P0002';
  end if;
  if not nav_v2_private.nav_v2_can_operate_bounded_task(p_task_id, v_uid) then
    raise exception 'Нет прав начать эту задачу' using errcode = '42501';
  end if;
  if v_task.status not in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status) then
    raise exception 'Начать можно только активную задачу' using errcode = '22023';
  end if;
  if v_task.outcome_state = 'proposed'
     and v_task.outcome_code in ('not_applicable', 'replaced', 'cancelled') then
    raise exception 'Сначала дождитесь решения по предложенному исходу' using errcode = '22023';
  end if;

  v_before := nav_v2_private.nav_v2_bounded_task_json(p_task_id);

  update public.nav_deal_tasks_v2
  set status = 'in_progress'::public.nav_v2_task_status,
      due_date = current_date + sla_days,
      outcome_code = null,
      outcome_state = null,
      outcome_reason_code = null,
      outcome_review_date = null,
      outcome_replacement_task_id = null,
      outcome_proposed_by = null,
      outcome_proposed_at = null,
      outcome_decided_by = null,
      outcome_decided_at = null,
      completed_by = null,
      completed_at = null,
      updated_at = now()
  where id = p_task_id;

  v_after := nav_v2_private.nav_v2_bounded_task_json(p_task_id);
  v_result := jsonb_build_object('ok', true, 'task', v_after, 'resumed', v_task.status = 'in_progress');

  insert into public.nav_deal_task_mutation_events_v2 (
    deal_id, task_id, event_type, actor_id, actor_role, client_request_id,
    before_state, after_state, result_payload
  ) values (
    v_task.deal_id, p_task_id, 'start_task', v_uid, v_profile.role, p_client_request_id,
    v_before, v_after, v_result
  );

  return v_result;
end;
$$;

create or replace function public.nav_v2_complete_bounded_task(
  p_task_id uuid,
  p_evidence_reference_id uuid,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.nav_user_profiles%rowtype;
  v_task public.nav_deal_tasks_v2%rowtype;
  v_catalog record;
  v_replay jsonb;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Пользователь не авторизован' using errcode = '42501'; end if;
  if p_client_request_id is null then raise exception 'client_request_id обязателен' using errcode = '22023'; end if;
  if p_evidence_reference_id is null then
    raise exception 'Для завершения требуется evidence_reference_id' using errcode = '22023';
  end if;

  v_replay := nav_v2_private.nav_v2_bounded_task_replay(p_client_request_id, 'complete_task');
  if v_replay is not null then return v_replay; end if;

  select p.* into v_profile from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true limit 1;
  if not found then raise exception 'Нет активного профиля Navigator' using errcode = '42501'; end if;

  select t.* into v_task from public.nav_deal_tasks_v2 t where t.id = p_task_id for update;
  if not found or v_task.task_contract_version is distinct from 2 then
    raise exception 'Bounded-задача не найдена' using errcode = 'P0002';
  end if;
  if not nav_v2_private.nav_v2_can_operate_bounded_task(p_task_id, v_uid) then
    raise exception 'Нет прав завершить эту задачу' using errcode = '42501';
  end if;
  if v_task.status not in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status) then
    raise exception 'Завершить можно только активную задачу' using errcode = '22023';
  end if;
  if v_task.outcome_state = 'proposed'
     and v_task.outcome_code in ('not_applicable', 'replaced', 'cancelled') then
    raise exception 'Сначала дождитесь решения по предложенному исходу' using errcode = '22023';
  end if;

  select * into v_catalog
  from nav_v2_private.nav_v2_task_contract_catalog() c
  where c.task_type = v_task.task_type
  limit 1;
  if not found or not (v_task.evidence_kind = any(v_catalog.allowed_evidence_kinds)) then
    raise exception 'Сохранённый evidence_kind не соответствует task catalog' using errcode = '22023';
  end if;

  v_before := nav_v2_private.nav_v2_bounded_task_json(p_task_id);

  update public.nav_deal_tasks_v2
  set status = 'done'::public.nav_v2_task_status,
      evidence_reference_id = p_evidence_reference_id,
      evidence_confirmed_at = now(),
      outcome_code = 'completed',
      outcome_state = 'confirmed',
      outcome_reason_code = null,
      outcome_review_date = null,
      outcome_replacement_task_id = null,
      outcome_proposed_by = null,
      outcome_proposed_at = null,
      outcome_decided_by = v_uid,
      outcome_decided_at = now(),
      completed_by = v_uid,
      completed_at = now(),
      updated_at = now()
  where id = p_task_id;

  v_after := nav_v2_private.nav_v2_bounded_task_json(p_task_id);
  v_result := jsonb_build_object(
    'ok', true, 'task', v_after, 'evidence_confirmed', true,
    'deal_readiness_changed', false, 'risk_gate_changed', false, 'deal_status_changed', false
  );

  insert into public.nav_deal_task_mutation_events_v2 (
    deal_id, task_id, event_type, actor_id, actor_role, client_request_id,
    before_state, after_state, result_payload
  ) values (
    v_task.deal_id, p_task_id, 'complete_task', v_uid, v_profile.role, p_client_request_id,
    v_before, v_after, v_result
  );

  return v_result;
end;
$$;

create or replace function public.nav_v2_set_bounded_task_active_outcome(
  p_task_id uuid,
  p_outcome_code text,
  p_reason_code text,
  p_review_date date,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.nav_user_profiles%rowtype;
  v_task public.nav_deal_tasks_v2%rowtype;
  v_replay jsonb;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Пользователь не авторизован' using errcode = '42501'; end if;
  if p_client_request_id is null then raise exception 'client_request_id обязателен' using errcode = '22023'; end if;
  if p_outcome_code not in ('waiting_external', 'deferred')
     or not nav_v2_private.nav_v2_bounded_task_reason_allowed(p_outcome_code, p_reason_code) then
    raise exception 'Недопустимый активный исход или reason_code' using errcode = '22023';
  end if;
  if p_review_date is null or p_review_date < current_date + 1 or p_review_date > current_date + 90 then
    raise exception 'review_date должен быть в пределах 1–90 дней' using errcode = '22023';
  end if;

  v_replay := nav_v2_private.nav_v2_bounded_task_replay(p_client_request_id, 'set_active_outcome');
  if v_replay is not null then return v_replay; end if;

  select p.* into v_profile from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true limit 1;
  if not found then raise exception 'Нет активного профиля Navigator' using errcode = '42501'; end if;

  select t.* into v_task from public.nav_deal_tasks_v2 t where t.id = p_task_id for update;
  if not found or v_task.task_contract_version is distinct from 2 then
    raise exception 'Bounded-задача не найдена' using errcode = 'P0002';
  end if;
  if not nav_v2_private.nav_v2_can_operate_bounded_task(p_task_id, v_uid) then
    raise exception 'Нет прав менять исход этой задачи' using errcode = '42501';
  end if;
  if v_task.status not in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status) then
    raise exception 'Активный исход доступен только для незавершённой задачи' using errcode = '22023';
  end if;
  if v_task.outcome_state = 'proposed'
     and v_task.outcome_code in ('not_applicable', 'replaced', 'cancelled') then
    raise exception 'Сначала дождитесь решения по предложенному исходу' using errcode = '22023';
  end if;

  v_before := nav_v2_private.nav_v2_bounded_task_json(p_task_id);

  update public.nav_deal_tasks_v2
  set status = 'in_progress'::public.nav_v2_task_status,
      due_date = p_review_date,
      outcome_code = p_outcome_code,
      outcome_state = 'confirmed',
      outcome_reason_code = p_reason_code,
      outcome_review_date = p_review_date,
      outcome_replacement_task_id = null,
      outcome_proposed_by = null,
      outcome_proposed_at = null,
      outcome_decided_by = v_uid,
      outcome_decided_at = now(),
      completed_by = null,
      completed_at = null,
      updated_at = now()
  where id = p_task_id;

  v_after := nav_v2_private.nav_v2_bounded_task_json(p_task_id);
  v_result := jsonb_build_object('ok', true, 'task', v_after, 'active_outcome', true);

  insert into public.nav_deal_task_mutation_events_v2 (
    deal_id, task_id, event_type, actor_id, actor_role, client_request_id,
    before_state, after_state, result_payload
  ) values (
    v_task.deal_id, p_task_id, 'set_active_outcome', v_uid, v_profile.role, p_client_request_id,
    v_before, v_after, v_result
  );

  return v_result;
end;
$$;

create or replace function public.nav_v2_propose_bounded_task_terminal_outcome(
  p_task_id uuid,
  p_outcome_code text,
  p_reason_code text,
  p_replacement_task_id uuid,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.nav_user_profiles%rowtype;
  v_task public.nav_deal_tasks_v2%rowtype;
  v_replacement public.nav_deal_tasks_v2%rowtype;
  v_replay jsonb;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Пользователь не авторизован' using errcode = '42501'; end if;
  if p_client_request_id is null then raise exception 'client_request_id обязателен' using errcode = '22023'; end if;
  if p_outcome_code not in ('not_applicable', 'replaced', 'cancelled')
     or not nav_v2_private.nav_v2_bounded_task_reason_allowed(p_outcome_code, p_reason_code) then
    raise exception 'Недопустимый terminal outcome или reason_code' using errcode = '22023';
  end if;
  if p_outcome_code = 'replaced' and p_replacement_task_id is null then
    raise exception 'Для replaced требуется replacement_task_id' using errcode = '22023';
  end if;
  if p_outcome_code <> 'replaced' and p_replacement_task_id is not null then
    raise exception 'replacement_task_id разрешён только для replaced' using errcode = '22023';
  end if;

  v_replay := nav_v2_private.nav_v2_bounded_task_replay(p_client_request_id, 'propose_terminal_outcome');
  if v_replay is not null then return v_replay; end if;

  select p.* into v_profile from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true limit 1;
  if not found then raise exception 'Нет активного профиля Navigator' using errcode = '42501'; end if;

  select t.* into v_task from public.nav_deal_tasks_v2 t where t.id = p_task_id for update;
  if not found or v_task.task_contract_version is distinct from 2 then
    raise exception 'Bounded-задача не найдена' using errcode = 'P0002';
  end if;
  if not nav_v2_private.nav_v2_can_operate_bounded_task(p_task_id, v_uid) then
    raise exception 'Нет прав предложить исход этой задачи' using errcode = '42501';
  end if;
  if v_task.status not in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status) then
    raise exception 'Terminal outcome доступен только для незавершённой задачи' using errcode = '22023';
  end if;

  if p_outcome_code = 'replaced' then
    select t.* into v_replacement
    from public.nav_deal_tasks_v2 t
    where t.id = p_replacement_task_id;
    if not found
       or v_replacement.id = p_task_id
       or v_replacement.deal_id is distinct from v_task.deal_id
       or v_replacement.task_contract_version is distinct from 2
       or v_replacement.status in ('done'::public.nav_v2_task_status, 'cancelled'::public.nav_v2_task_status) then
      raise exception 'Replacement task должна быть другой активной bounded-задачей той же сделки'
        using errcode = '22023';
    end if;
  end if;

  v_before := nav_v2_private.nav_v2_bounded_task_json(p_task_id);

  update public.nav_deal_tasks_v2
  set outcome_code = p_outcome_code,
      outcome_state = 'proposed',
      outcome_reason_code = p_reason_code,
      outcome_review_date = null,
      outcome_replacement_task_id = p_replacement_task_id,
      outcome_proposed_by = v_uid,
      outcome_proposed_at = now(),
      outcome_decided_by = null,
      outcome_decided_at = null,
      updated_at = now()
  where id = p_task_id;

  v_after := nav_v2_private.nav_v2_bounded_task_json(p_task_id);
  v_result := jsonb_build_object('ok', true, 'task', v_after, 'awaiting_confirmation', true);

  insert into public.nav_deal_task_mutation_events_v2 (
    deal_id, task_id, event_type, actor_id, actor_role, client_request_id,
    before_state, after_state, result_payload
  ) values (
    v_task.deal_id, p_task_id, 'propose_terminal_outcome', v_uid, v_profile.role, p_client_request_id,
    v_before, v_after, v_result
  );

  return v_result;
end;
$$;

create or replace function public.nav_v2_decide_bounded_task_terminal_outcome(
  p_task_id uuid,
  p_decision text,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.nav_user_profiles%rowtype;
  v_task public.nav_deal_tasks_v2%rowtype;
  v_replay jsonb;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Пользователь не авторизован' using errcode = '42501'; end if;
  if p_client_request_id is null then raise exception 'client_request_id обязателен' using errcode = '22023'; end if;
  if p_decision not in ('confirm', 'reject') then
    raise exception 'Решение должно быть confirm или reject' using errcode = '22023';
  end if;

  v_replay := nav_v2_private.nav_v2_bounded_task_replay(p_client_request_id, 'decide_terminal_outcome');
  if v_replay is not null then return v_replay; end if;

  select p.* into v_profile from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true limit 1;
  if not found or v_profile.role not in ('manager', 'owner', 'admin') then
    raise exception 'Только менеджер, owner или admin подтверждает terminal outcome'
      using errcode = '42501';
  end if;

  select t.* into v_task from public.nav_deal_tasks_v2 t where t.id = p_task_id for update;
  if not found or v_task.task_contract_version is distinct from 2 then
    raise exception 'Bounded-задача не найдена' using errcode = 'P0002';
  end if;
  if not nav_v2_private.nav_v2_can_decide_bounded_task(p_task_id, v_uid) then
    raise exception 'Нет прав принять решение по этой задаче' using errcode = '42501';
  end if;
  if v_task.outcome_state <> 'proposed'
     or v_task.outcome_code not in ('not_applicable', 'replaced', 'cancelled') then
    raise exception 'У задачи нет terminal outcome, ожидающего решения' using errcode = '22023';
  end if;

  v_before := nav_v2_private.nav_v2_bounded_task_json(p_task_id);

  if p_decision = 'confirm' then
    update public.nav_deal_tasks_v2
    set status = 'cancelled'::public.nav_v2_task_status,
        outcome_state = 'confirmed',
        outcome_decided_by = v_uid,
        outcome_decided_at = now(),
        completed_by = v_uid,
        completed_at = now(),
        updated_at = now()
    where id = p_task_id;
  else
    update public.nav_deal_tasks_v2
    set status = case
          when status = 'open'::public.nav_v2_task_status then 'open'::public.nav_v2_task_status
          else 'in_progress'::public.nav_v2_task_status
        end,
        outcome_state = 'rejected',
        outcome_decided_by = v_uid,
        outcome_decided_at = now(),
        completed_by = null,
        completed_at = null,
        updated_at = now()
    where id = p_task_id;
  end if;

  v_after := nav_v2_private.nav_v2_bounded_task_json(p_task_id);
  v_result := jsonb_build_object(
    'ok', true, 'task', v_after, 'decision', p_decision,
    'deal_readiness_changed', false, 'risk_gate_changed', false, 'deal_status_changed', false
  );

  insert into public.nav_deal_task_mutation_events_v2 (
    deal_id, task_id, event_type, actor_id, actor_role, client_request_id,
    before_state, after_state, result_payload
  ) values (
    v_task.deal_id, p_task_id, 'decide_terminal_outcome', v_uid, v_profile.role, p_client_request_id,
    v_before, v_after, v_result
  );

  return v_result;
end;
$$;

create or replace function public.nav_v2_add_task(
  p_deal_id uuid,
  p_title text,
  p_description text default null,
  p_assigned_role public.nav_v2_user_role default null,
  p_priority public.nav_v2_task_priority default 'normal'::public.nav_v2_task_priority,
  p_source text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Generic task creation disabled: use nav_v2_create_bounded_tasks'
    using errcode = '0A000';
end;
$$;

create or replace function public.nav_v2_update_task_status(
  p_task_id uuid,
  p_status public.nav_v2_task_status
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_task public.nav_deal_tasks_v2%rowtype;
  v_role public.nav_v2_user_role;
begin
  if v_uid is null then raise exception 'Пользователь не авторизован' using errcode = '42501'; end if;

  select t.* into v_task
  from public.nav_deal_tasks_v2 t
  where t.id = p_task_id
  for update;
  if not found then raise exception 'Задача не найдена' using errcode = 'P0002'; end if;

  if v_task.task_contract_version = 2 then
    raise exception 'Для bounded-задачи используйте governed lifecycle RPC'
      using errcode = '0A000';
  end if;
  if not nav_v2_private.nav_v2_can_view_deal(v_task.deal_id, v_uid) then
    raise exception 'Нет доступа к задаче' using errcode = '42501';
  end if;

  select p.role into v_role
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;

  if not nav_v2_private.nav_v2_can_edit_deal(v_task.deal_id, v_uid)
     and v_task.assigned_to is distinct from v_uid
     and v_task.assigned_role is distinct from v_role then
    raise exception 'Нет прав менять статус этой legacy-задачи' using errcode = '42501';
  end if;

  update public.nav_deal_tasks_v2
  set status = p_status,
      completed_by = case when p_status = 'done' then v_uid else null end,
      completed_at = case when p_status = 'done' then now() else null end,
      updated_at = now()
  where id = p_task_id;

  insert into public.nav_deal_events_v2 (
    deal_id, actor_id, event_type, event_title, event_data
  ) values (
    v_task.deal_id, v_uid, 'task_status_changed', 'Статус legacy-задачи изменён',
    jsonb_build_object('task_id', p_task_id, 'status', p_status)
  );

  return jsonb_build_object('ok', true, 'task_id', p_task_id, 'status', p_status, 'legacy', true);
end;
$$;

revoke execute on function nav_v2_private.nav_v2_bounded_task_json(uuid)
  from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_bounded_task_replay(uuid, text)
  from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_bounded_task_subject_allowed(text, text)
  from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_bounded_task_reason_allowed(text, text)
  from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_can_operate_bounded_task(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_can_decide_bounded_task(uuid, uuid)
  from public, anon, authenticated;

revoke execute on function public.nav_v2_create_bounded_tasks(uuid, jsonb, uuid)
  from public, anon, authenticated;
revoke execute on function public.nav_v2_start_bounded_task(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.nav_v2_complete_bounded_task(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.nav_v2_set_bounded_task_active_outcome(uuid, text, text, date, uuid)
  from public, anon, authenticated;
revoke execute on function public.nav_v2_propose_bounded_task_terminal_outcome(uuid, text, text, uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.nav_v2_decide_bounded_task_terminal_outcome(uuid, text, uuid)
  from public, anon, authenticated;
revoke execute on function public.nav_v2_add_task(
  uuid, text, text, public.nav_v2_user_role, public.nav_v2_task_priority, text
) from public, anon, authenticated;
revoke execute on function public.nav_v2_update_task_status(uuid, public.nav_v2_task_status)
  from public, anon, authenticated;

grant execute on function public.nav_v2_create_bounded_tasks(uuid, jsonb, uuid) to service_role;
grant execute on function public.nav_v2_start_bounded_task(uuid, uuid) to service_role;
grant execute on function public.nav_v2_complete_bounded_task(uuid, uuid, uuid) to service_role;
grant execute on function public.nav_v2_set_bounded_task_active_outcome(uuid, text, text, date, uuid) to service_role;
grant execute on function public.nav_v2_propose_bounded_task_terminal_outcome(uuid, text, text, uuid, uuid) to service_role;
grant execute on function public.nav_v2_decide_bounded_task_terminal_outcome(uuid, text, uuid) to service_role;
grant execute on function public.nav_v2_add_task(
  uuid, text, text, public.nav_v2_user_role, public.nav_v2_task_priority, text
) to service_role;
grant execute on function public.nav_v2_update_task_status(uuid, public.nav_v2_task_status)
  to service_role;

-- Explicit non-goals:
-- no mass update/backfill of existing public.nav_deal_tasks_v2 rows;
-- no automatic task creation from preview suggestions;
-- no changes to public.nav_deals_v2 readiness or status;
-- no inserts into public.nav_deal_documents_v2 or public.nav_deal_risks_v2;
-- no authenticated EXECUTE until a separate deployment migration.
