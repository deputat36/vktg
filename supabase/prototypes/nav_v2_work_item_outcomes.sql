-- REPOSITORY-ONLY PROTOTYPE.
-- Do not apply to production without authenticated role/mutation regression on isolated synthetic data.
-- This file designs the outcome lifecycle; existing production statuses, readiness queries and RPCs are unchanged.

alter table public.nav_deal_documents_v2
  add column if not exists outcome_code text,
  add column if not exists outcome_state text,
  add column if not exists outcome_note text,
  add column if not exists outcome_external_party text,
  add column if not exists outcome_deferred_until date,
  add column if not exists replacement_document_id uuid,
  add column if not exists outcome_proposed_by uuid,
  add column if not exists outcome_proposed_at timestamptz,
  add column if not exists outcome_confirmed_by uuid,
  add column if not exists outcome_confirmed_at timestamptz;

alter table public.nav_deal_risks_v2
  add column if not exists resolution_code text,
  add column if not exists resolution_state text,
  add column if not exists resolution_note text,
  add column if not exists superseded_by_risk_id uuid,
  add column if not exists resolution_proposed_by uuid,
  add column if not exists resolution_proposed_at timestamptz;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'nav_document_outcome_code_check'
      and conrelid = 'public.nav_deal_documents_v2'::regclass
  ) then
    alter table public.nav_deal_documents_v2
      add constraint nav_document_outcome_code_check
      check (outcome_code is null or outcome_code in (
        'not_applicable', 'replaced', 'cancelled', 'external_wait', 'deferred'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'nav_document_outcome_state_check'
      and conrelid = 'public.nav_deal_documents_v2'::regclass
  ) then
    alter table public.nav_deal_documents_v2
      add constraint nav_document_outcome_state_check
      check (outcome_state is null or outcome_state in ('proposed', 'confirmed', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'nav_document_outcome_shape_check'
      and conrelid = 'public.nav_deal_documents_v2'::regclass
  ) then
    alter table public.nav_deal_documents_v2
      add constraint nav_document_outcome_shape_check
      check (
        outcome_code is null
        or (
          outcome_state is not null
          and nullif(trim(outcome_note), '') is not null
          and (outcome_code <> 'replaced' or replacement_document_id is not null)
          and (outcome_code <> 'deferred' or outcome_deferred_until is not null)
          and (outcome_code <> 'external_wait' or nullif(trim(outcome_external_party), '') is not null)
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'nav_document_replacement_fk'
      and conrelid = 'public.nav_deal_documents_v2'::regclass
  ) then
    alter table public.nav_deal_documents_v2
      add constraint nav_document_replacement_fk
      foreign key (replacement_document_id)
      references public.nav_deal_documents_v2(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'nav_risk_resolution_code_check'
      and conrelid = 'public.nav_deal_risks_v2'::regclass
  ) then
    alter table public.nav_deal_risks_v2
      add constraint nav_risk_resolution_code_check
      check (resolution_code is null or resolution_code in (
        'mitigated', 'not_applicable', 'superseded', 'accepted_by_specialist', 'cancelled'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'nav_risk_resolution_state_check'
      and conrelid = 'public.nav_deal_risks_v2'::regclass
  ) then
    alter table public.nav_deal_risks_v2
      add constraint nav_risk_resolution_state_check
      check (resolution_state is null or resolution_state in ('proposed', 'confirmed', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'nav_risk_resolution_shape_check'
      and conrelid = 'public.nav_deal_risks_v2'::regclass
  ) then
    alter table public.nav_deal_risks_v2
      add constraint nav_risk_resolution_shape_check
      check (
        resolution_code is null
        or (
          resolution_state is not null
          and nullif(trim(resolution_note), '') is not null
          and (resolution_code <> 'superseded' or superseded_by_risk_id is not null)
          and (resolution_state <> 'confirmed' or is_resolved is true)
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'nav_risk_superseded_fk'
      and conrelid = 'public.nav_deal_risks_v2'::regclass
  ) then
    alter table public.nav_deal_risks_v2
      add constraint nav_risk_superseded_fk
      foreign key (superseded_by_risk_id)
      references public.nav_deal_risks_v2(id)
      on delete set null;
  end if;
end;
$constraints$;

create or replace function nav_v2_private.nav_v2_can_confirm_document_outcome(
  p_role public.nav_v2_user_role,
  p_responsible_role public.nav_v2_user_role,
  p_category text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role) then true
    when p_role = 'lawyer'::public.nav_v2_user_role then p_responsible_role = 'lawyer'::public.nav_v2_user_role
    when p_role = 'broker'::public.nav_v2_user_role then p_responsible_role = 'broker'::public.nav_v2_user_role
    when p_role = 'manager'::public.nav_v2_user_role then
      p_responsible_role in ('spn'::public.nav_v2_user_role, 'manager'::public.nav_v2_user_role)
      or coalesce(p_category, '') = 'corporate'
    else false
  end;
$$;

create or replace function nav_v2_private.nav_v2_can_confirm_risk_outcome(
  p_role public.nav_v2_user_role,
  p_assigned_role public.nav_v2_user_role
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role) then true
    when p_role = 'lawyer'::public.nav_v2_user_role then p_assigned_role = 'lawyer'::public.nav_v2_user_role
    when p_role = 'broker'::public.nav_v2_user_role then p_assigned_role = 'broker'::public.nav_v2_user_role
    when p_role = 'manager'::public.nav_v2_user_role then
      p_assigned_role is null
      or p_assigned_role in ('spn'::public.nav_v2_user_role, 'manager'::public.nav_v2_user_role)
    else false
  end;
$$;

create or replace function public.nav_v2_propose_document_outcome(
  p_document_id uuid,
  p_outcome_code text,
  p_note text,
  p_external_party text default null,
  p_deferred_until date default null,
  p_replacement_document_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_document public.nav_deal_documents_v2%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_terminal boolean;
  v_state text;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if p_outcome_code not in ('not_applicable', 'replaced', 'cancelled', 'external_wait', 'deferred') then
    raise exception 'Недопустимый исход документа';
  end if;

  if v_note is null then
    raise exception 'Для исхода документа нужно объяснение';
  end if;

  if p_outcome_code = 'replaced' and p_replacement_document_id is null then
    raise exception 'Для замены нужно указать другой документ';
  end if;

  if p_outcome_code = 'deferred' and p_deferred_until is null then
    raise exception 'Для отсрочки нужна дата';
  end if;

  if p_outcome_code = 'external_wait' and nullif(trim(coalesce(p_external_party, '')), '') is null then
    raise exception 'Укажите внешнюю сторону, от которой ожидается документ';
  end if;

  select d.* into v_document
  from public.nav_deal_documents_v2 d
  where d.id = p_document_id
  for update;

  if not found then
    raise exception 'Документ не найден' using errcode = 'P0002';
  end if;

  if not nav_v2_private.nav_v2_can_view_deal(v_document.deal_id, v_uid) then
    raise exception 'Нет доступа к документу' using errcode = '42501';
  end if;

  v_role := nav_v2_private.nav_v2_my_role(v_uid);
  if not nav_v2_private.nav_v2_can_edit_deal(v_document.deal_id, v_uid)
     and v_document.assigned_to is distinct from v_uid
     and v_document.responsible_role is distinct from v_role then
    raise exception 'Нет прав предлагать исход этого документа' using errcode = '42501';
  end if;

  v_terminal := p_outcome_code in ('not_applicable', 'replaced', 'cancelled');
  v_state := case when v_terminal then 'proposed' else 'confirmed' end;

  update public.nav_deal_documents_v2
  set outcome_code = p_outcome_code,
      outcome_state = v_state,
      outcome_note = v_note,
      outcome_external_party = nullif(trim(coalesce(p_external_party, '')), ''),
      outcome_deferred_until = p_deferred_until,
      replacement_document_id = p_replacement_document_id,
      outcome_proposed_by = v_uid,
      outcome_proposed_at = now(),
      outcome_confirmed_by = case when v_state = 'confirmed' then v_uid else null end,
      outcome_confirmed_at = case when v_state = 'confirmed' then now() else null end,
      resolved_at = null,
      updated_at = now()
  where id = v_document.id;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    v_document.deal_id,
    v_uid,
    case when v_terminal then 'document_outcome_proposed' else 'document_exception_recorded' end,
    case when v_terminal then 'Предложен исключительный исход документа' else 'Зафиксировано ожидание или отсрочка документа' end,
    jsonb_strip_nulls(jsonb_build_object(
      'document_id', v_document.id,
      'outcome_code', p_outcome_code,
      'outcome_state', v_state,
      'external_party', nullif(trim(coalesce(p_external_party, '')), ''),
      'deferred_until', p_deferred_until,
      'replacement_document_id', p_replacement_document_id,
      'has_note', true
    ))
  );

  return jsonb_build_object(
    'document_id', v_document.id,
    'deal_id', v_document.deal_id,
    'outcome_code', p_outcome_code,
    'outcome_state', v_state,
    'terminal', v_terminal
  );
end;
$$;

create or replace function public.nav_v2_decide_document_outcome(
  p_document_id uuid,
  p_confirm boolean,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_document public.nav_deal_documents_v2%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_state text;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  select d.* into v_document
  from public.nav_deal_documents_v2 d
  where d.id = p_document_id
  for update;

  if not found then
    raise exception 'Документ не найден' using errcode = 'P0002';
  end if;

  if v_document.outcome_state <> 'proposed'
     or v_document.outcome_code not in ('not_applicable', 'replaced', 'cancelled') then
    raise exception 'У документа нет предложения, ожидающего решения';
  end if;

  if not nav_v2_private.nav_v2_can_view_deal(v_document.deal_id, v_uid) then
    raise exception 'Нет доступа к документу' using errcode = '42501';
  end if;

  v_role := nav_v2_private.nav_v2_my_role(v_uid);
  if not nav_v2_private.nav_v2_can_confirm_document_outcome(v_role, v_document.responsible_role, v_document.category) then
    raise exception 'Нет прав подтверждать этот исход документа' using errcode = '42501';
  end if;

  if v_note is null then
    raise exception 'Решение нужно пояснить';
  end if;

  v_state := case when p_confirm then 'confirmed' else 'rejected' end;

  update public.nav_deal_documents_v2
  set outcome_state = v_state,
      outcome_note = concat_ws(E'\n', outcome_note, v_note),
      outcome_confirmed_by = v_uid,
      outcome_confirmed_at = now(),
      resolved_at = case when p_confirm then now() else null end,
      updated_at = now()
  where id = v_document.id;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    v_document.deal_id,
    v_uid,
    case when p_confirm then 'document_outcome_confirmed' else 'document_outcome_rejected' end,
    case when p_confirm then 'Исключительный исход документа подтверждён' else 'Исключительный исход документа отклонён' end,
    jsonb_build_object(
      'document_id', v_document.id,
      'outcome_code', v_document.outcome_code,
      'outcome_state', v_state,
      'decision_role', v_role,
      'has_note', true
    )
  );

  return jsonb_build_object(
    'document_id', v_document.id,
    'deal_id', v_document.deal_id,
    'outcome_code', v_document.outcome_code,
    'outcome_state', v_state
  );
end;
$$;

create or replace function public.nav_v2_propose_risk_resolution(
  p_risk_id uuid,
  p_resolution_code text,
  p_note text,
  p_superseded_by_risk_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_risk public.nav_deal_risks_v2%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if p_resolution_code not in ('mitigated', 'not_applicable', 'superseded', 'accepted_by_specialist', 'cancelled') then
    raise exception 'Недопустимый исход риска';
  end if;

  if v_note is null then
    raise exception 'Для исхода риска нужно объяснение или evidence';
  end if;

  if p_resolution_code = 'superseded' and p_superseded_by_risk_id is null then
    raise exception 'Укажите риск, который заменяет текущий';
  end if;

  select r.* into v_risk
  from public.nav_deal_risks_v2 r
  where r.id = p_risk_id
  for update;

  if not found then
    raise exception 'Риск не найден' using errcode = 'P0002';
  end if;

  if not nav_v2_private.nav_v2_can_view_deal(v_risk.deal_id, v_uid) then
    raise exception 'Нет доступа к риску' using errcode = '42501';
  end if;

  v_role := nav_v2_private.nav_v2_my_role(v_uid);
  if not nav_v2_private.nav_v2_can_edit_deal(v_risk.deal_id, v_uid)
     and v_risk.assigned_role is distinct from v_role then
    raise exception 'Нет прав предлагать исход этого риска' using errcode = '42501';
  end if;

  update public.nav_deal_risks_v2
  set resolution_code = p_resolution_code,
      resolution_state = 'proposed',
      resolution_note = v_note,
      superseded_by_risk_id = p_superseded_by_risk_id,
      resolution_proposed_by = v_uid,
      resolution_proposed_at = now(),
      is_resolved = false,
      resolved_by = null,
      resolved_at = null,
      updated_at = now()
  where id = v_risk.id;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    v_risk.deal_id,
    v_uid,
    'risk_resolution_proposed',
    'Предложен исход риска',
    jsonb_strip_nulls(jsonb_build_object(
      'risk_id', v_risk.id,
      'resolution_code', p_resolution_code,
      'superseded_by_risk_id', p_superseded_by_risk_id,
      'proposed_by_role', v_role,
      'has_note', true
    ))
  );

  return jsonb_build_object(
    'risk_id', v_risk.id,
    'deal_id', v_risk.deal_id,
    'resolution_code', p_resolution_code,
    'resolution_state', 'proposed',
    'is_resolved', false
  );
end;
$$;

create or replace function public.nav_v2_decide_risk_resolution(
  p_risk_id uuid,
  p_confirm boolean,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_risk public.nav_deal_risks_v2%rowtype;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_state text;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  select r.* into v_risk
  from public.nav_deal_risks_v2 r
  where r.id = p_risk_id
  for update;

  if not found then
    raise exception 'Риск не найден' using errcode = 'P0002';
  end if;

  if v_risk.resolution_state <> 'proposed' or v_risk.resolution_code is null then
    raise exception 'У риска нет предложения, ожидающего решения';
  end if;

  if not nav_v2_private.nav_v2_can_view_deal(v_risk.deal_id, v_uid) then
    raise exception 'Нет доступа к риску' using errcode = '42501';
  end if;

  v_role := nav_v2_private.nav_v2_my_role(v_uid);
  if not nav_v2_private.nav_v2_can_confirm_risk_outcome(v_role, v_risk.assigned_role) then
    raise exception 'Нет прав подтверждать исход этого риска' using errcode = '42501';
  end if;

  if v_note is null then
    raise exception 'Решение нужно пояснить';
  end if;

  v_state := case when p_confirm then 'confirmed' else 'rejected' end;

  update public.nav_deal_risks_v2
  set resolution_state = v_state,
      resolution_note = concat_ws(E'\n', resolution_note, v_note),
      is_resolved = p_confirm,
      resolved_by = case when p_confirm then v_uid else null end,
      resolved_at = case when p_confirm then now() else null end,
      updated_at = now()
  where id = v_risk.id;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    v_risk.deal_id,
    v_uid,
    case when p_confirm then 'risk_resolution_confirmed' else 'risk_resolution_rejected' end,
    case when p_confirm then 'Исход риска подтверждён' else 'Исход риска отклонён' end,
    jsonb_build_object(
      'risk_id', v_risk.id,
      'resolution_code', v_risk.resolution_code,
      'resolution_state', v_state,
      'decision_role', v_role,
      'has_note', true
    )
  );

  return jsonb_build_object(
    'risk_id', v_risk.id,
    'deal_id', v_risk.deal_id,
    'resolution_code', v_risk.resolution_code,
    'resolution_state', v_state,
    'is_resolved', p_confirm
  );
end;
$$;

-- Production rollout must also:
-- 1. Replace direct SPN risk resolution with proposal + specialist confirmation.
-- 2. Update readiness and missing-document counts to exclude only checked or confirmed terminal outcomes.
-- 3. Keep external_wait and deferred outcomes active and visible with dates.
-- 4. Add explicit RPC grants only after authenticated role regression.
-- 5. Preserve existing rows without bulk auto-resolution or guessed outcome codes.
