-- REPOSITORY-ONLY PROTOTYPE.
-- Do not apply to production before isolated authenticated role/mutation tests.
-- Existing tasks remain unchanged and nullable contract fields are not backfilled automatically.

alter table public.nav_deal_tasks_v2
  add column if not exists task_contract_version integer,
  add column if not exists completion_criterion_code text,
  add column if not exists evidence_kind text,
  add column if not exists evidence_reference_id uuid,
  add column if not exists evidence_confirmed_at timestamptz,
  add column if not exists gate_scope text,
  add column if not exists outcome_code text,
  add column if not exists outcome_state text,
  add column if not exists outcome_reason_code text,
  add column if not exists outcome_review_date date,
  add column if not exists outcome_replacement_task_id uuid references public.nav_deal_tasks_v2(id) on delete set null;

comment on column public.nav_deal_tasks_v2.task_contract_version is
  'Nullable bounded task contract version. Existing rows remain null until explicitly reviewed.';
comment on column public.nav_deal_tasks_v2.completion_criterion_code is
  'Machine-readable completion criterion; no client data or free-form completion text.';
comment on column public.nav_deal_tasks_v2.evidence_kind is
  'Bounded evidence category. Evidence content remains in its source entity, not in the task row.';
comment on column public.nav_deal_tasks_v2.evidence_reference_id is
  'Optional source-entity UUID used as completion evidence; no URL or client identifier.';
comment on column public.nav_deal_tasks_v2.gate_scope is
  'Process scope affected by the task: none, deposit, deal, corporate or post_deal.';
comment on column public.nav_deal_tasks_v2.outcome_code is
  'Controlled outcome. waiting_external and deferred remain active; terminal exceptions require confirmation.';

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_bounded_task_type_check,
  add constraint nav_deal_tasks_v2_bounded_task_type_check check (
    task_contract_version is null
    or task_type in (
      'document_request',
      'document_check',
      'term_approval',
      'legal_decision',
      'financial_decision',
      'corporate_document_signing',
      'card_correction',
      'contract_preparation',
      'appointment_scheduling',
      'post_deal_action'
    )
  ) not valid;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_contract_version_check,
  add constraint nav_deal_tasks_v2_contract_version_check check (
    task_contract_version is null or task_contract_version = 2
  ) not valid;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_completion_code_check,
  add constraint nav_deal_tasks_v2_completion_code_check check (
    completion_criterion_code is null
    or completion_criterion_code in (
      'document_received',
      'document_checked',
      'terms_confirmed',
      'legal_decision_recorded',
      'financial_decision_recorded',
      'corporate_document_signed',
      'card_fields_corrected',
      'contract_draft_ready',
      'appointment_confirmed',
      'post_deal_action_confirmed'
    )
  ) not valid;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_evidence_kind_check,
  add constraint nav_deal_tasks_v2_evidence_kind_check check (
    evidence_kind is null
    or evidence_kind in (
      'document_status',
      'review_decision',
      'agreement_status',
      'corporate_document_status',
      'card_validation',
      'contract_reference',
      'calendar_event',
      'external_confirmation',
      'comment_reference'
    )
  ) not valid;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_gate_scope_check,
  add constraint nav_deal_tasks_v2_gate_scope_check check (
    gate_scope is null or gate_scope in ('none', 'deposit', 'deal', 'corporate', 'post_deal')
  ) not valid;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_outcome_code_check,
  add constraint nav_deal_tasks_v2_outcome_code_check check (
    outcome_code is null
    or outcome_code in (
      'completed',
      'not_applicable',
      'replaced',
      'waiting_external',
      'deferred',
      'cancelled'
    )
  ) not valid;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_outcome_state_check,
  add constraint nav_deal_tasks_v2_outcome_state_check check (
    outcome_state is null or outcome_state in ('proposed', 'confirmed', 'rejected')
  ) not valid;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_outcome_pair_check,
  add constraint nav_deal_tasks_v2_outcome_pair_check check (
    (outcome_code is null and outcome_state is null)
    or (outcome_code is not null and outcome_state is not null)
  ) not valid;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_replacement_check,
  add constraint nav_deal_tasks_v2_replacement_check check (
    outcome_code <> 'replaced' or outcome_replacement_task_id is not null
  ) not valid;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_active_outcome_review_check,
  add constraint nav_deal_tasks_v2_active_outcome_review_check check (
    outcome_code not in ('waiting_external', 'deferred')
    or outcome_review_date is not null
  ) not valid;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_done_evidence_check,
  add constraint nav_deal_tasks_v2_done_evidence_check check (
    task_contract_version is null
    or status <> 'done'
    or (
      completed_by is not null
      and completed_at is not null
      and evidence_kind is not null
      and evidence_confirmed_at is not null
      and outcome_code = 'completed'
      and outcome_state = 'confirmed'
    )
  ) not valid;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_contract_completeness_check,
  add constraint nav_deal_tasks_v2_contract_completeness_check check (
    task_contract_version is null
    or (
      task_type is not null
      and sla_days is not null
      and assigned_role is not null
      and completion_criterion_code is not null
      and evidence_kind is not null
      and gate_scope is not null
    )
  ) not valid;

create or replace function nav_v2_private.nav_v2_task_contract_catalog()
returns table (
  task_type text,
  label text,
  default_sla_days integer,
  max_sla_days integer,
  default_owner_role public.nav_v2_user_role,
  allowed_owner_roles public.nav_v2_user_role[],
  completion_criterion_code text,
  allowed_evidence_kinds text[],
  default_gate_scope text
)
language sql
immutable
security invoker
set search_path = ''
as $$
  select *
  from (values
    ('document_request', 'Запрос документа', 2, 5, 'spn'::public.nav_v2_user_role,
      array['spn','manager']::public.nav_v2_user_role[], 'document_received',
      array['document_status','external_confirmation','comment_reference']::text[], 'deposit'),
    ('document_check', 'Проверка документа', 1, 3, 'lawyer'::public.nav_v2_user_role,
      array['spn','lawyer','broker','manager']::public.nav_v2_user_role[], 'document_checked',
      array['document_status','review_decision']::text[], 'deal'),
    ('term_approval', 'Согласование условия', 2, 5, 'spn'::public.nav_v2_user_role,
      array['spn','manager']::public.nav_v2_user_role[], 'terms_confirmed',
      array['agreement_status','comment_reference']::text[], 'deposit'),
    ('legal_decision', 'Юридическое решение', 1, 3, 'lawyer'::public.nav_v2_user_role,
      array['lawyer']::public.nav_v2_user_role[], 'legal_decision_recorded',
      array['review_decision']::text[], 'deposit'),
    ('financial_decision', 'Ипотечное решение', 2, 5, 'broker'::public.nav_v2_user_role,
      array['broker']::public.nav_v2_user_role[], 'financial_decision_recorded',
      array['review_decision','external_confirmation']::text[], 'deal'),
    ('corporate_document_signing', 'Подписание корпоративного документа', 3, 7, 'spn'::public.nav_v2_user_role,
      array['spn','manager']::public.nav_v2_user_role[], 'corporate_document_signed',
      array['corporate_document_status']::text[], 'corporate'),
    ('card_correction', 'Исправление карточки', 1, 3, 'spn'::public.nav_v2_user_role,
      array['spn','manager']::public.nav_v2_user_role[], 'card_fields_corrected',
      array['card_validation']::text[], 'none'),
    ('contract_preparation', 'Подготовка договора сделки', 2, 5, 'lawyer'::public.nav_v2_user_role,
      array['lawyer']::public.nav_v2_user_role[], 'contract_draft_ready',
      array['contract_reference','review_decision']::text[], 'deal'),
    ('appointment_scheduling', 'Назначение встречи', 2, 5, 'spn'::public.nav_v2_user_role,
      array['spn','manager']::public.nav_v2_user_role[], 'appointment_confirmed',
      array['calendar_event','external_confirmation']::text[], 'none'),
    ('post_deal_action', 'Действие после сделки', 3, 10, 'spn'::public.nav_v2_user_role,
      array['spn','manager']::public.nav_v2_user_role[], 'post_deal_action_confirmed',
      array['external_confirmation','comment_reference','corporate_document_status']::text[], 'post_deal')
  ) catalog(
    task_type,
    label,
    default_sla_days,
    max_sla_days,
    default_owner_role,
    allowed_owner_roles,
    completion_criterion_code,
    allowed_evidence_kinds,
    default_gate_scope
  );
$$;

create or replace function nav_v2_private.nav_v2_suggest_bounded_task_contract(
  p_source text,
  p_assigned_role public.nav_v2_user_role
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when coalesce(p_source, '') like 'auto_quality_%' then jsonb_build_object(
      'task_type', 'card_correction', 'confidence', 'high', 'requires_confirmation', true
    )
    when coalesce(p_source, '') in ('auto_settlements', 'auto_expenses') then jsonb_build_object(
      'task_type', 'term_approval', 'confidence', 'high', 'requires_confirmation', true
    )
    when coalesce(p_source, '') in ('auto_lawyer', 'auto_children', 'auto_share_lawyer') then jsonb_build_object(
      'task_type', 'legal_decision', 'confidence', 'high', 'requires_confirmation', true
    )
    when coalesce(p_source, '') = 'auto_broker' then jsonb_build_object(
      'task_type', 'financial_decision', 'confidence', 'high', 'requires_confirmation', true
    )
    when p_assigned_role = 'lawyer'::public.nav_v2_user_role then jsonb_build_object(
      'task_type', null, 'confidence', 'low', 'requires_manual_review', true
    )
    when p_assigned_role = 'broker'::public.nav_v2_user_role then jsonb_build_object(
      'task_type', null, 'confidence', 'low', 'requires_manual_review', true
    )
    else jsonb_build_object(
      'task_type', null, 'confidence', 'none', 'requires_manual_review', true
    )
  end;
$$;

create or replace function public.nav_v2_get_bounded_task_contract_preview(p_limit integer default 200)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_profile jsonb;
  v_items jsonb;
  v_summary jsonb;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  select p.role,
         jsonb_build_object('id', p.id, 'full_name', p.full_name, 'role', p.role)
    into v_role, v_profile
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;

  if v_role not in ('owner', 'admin', 'manager') then
    raise exception 'Контракт задач доступен владельцу, администратору и менеджеру' using errcode = '42501';
  end if;

  with scoped as (
    select t.*, d.manager_id, d.seller_spn_id, d.buyer_spn_id,
           nav_v2_private.nav_v2_suggest_bounded_task_contract(t.source, t.assigned_role) as suggestion
    from public.nav_deal_tasks_v2 t
    join public.nav_deals_v2 d on d.id = t.deal_id
    where t.status in ('open', 'in_progress')
      and not (
        coalesce((d.deal_summary ->> 'demo') = 'true', false)
        or coalesce((d.wizard_snapshot ->> 'demo') = 'true', false)
        or coalesce(d.title, '') like 'ДЕМО:%'
      )
      and (
        v_role in ('owner', 'admin')
        or d.manager_id = v_uid
        or exists (
          select 1
          from public.nav_user_profiles spn
          where spn.id in (d.seller_spn_id, d.buyer_spn_id)
            and spn.manager_id = v_uid
            and spn.is_active is true
        )
      )
  ), prepared as (
    select s.*,
           catalog.label as persisted_task_type_label,
           catalog.default_sla_days,
           catalog.max_sla_days,
           catalog.allowed_owner_roles,
           catalog.allowed_evidence_kinds,
           case
             when s.task_contract_version = 2 then 'persisted_v2'
             when s.task_type is not null or s.sla_days is not null then 'legacy_or_partial'
             when s.suggestion ->> 'task_type' is not null then 'suggested_only'
             else 'manual_review'
           end as contract_state,
           array_remove(array[
             case when s.task_contract_version = 2 and s.task_type is null then 'task_type' end,
             case when s.task_contract_version = 2 and s.assigned_role is null then 'owner_role' end,
             case when s.task_contract_version = 2 and s.sla_days is null then 'sla_days' end,
             case when s.task_contract_version = 2 and s.completion_criterion_code is null then 'completion_criterion' end,
             case when s.task_contract_version = 2 and s.evidence_kind is null then 'evidence_kind' end,
             case when s.task_contract_version = 2 and s.gate_scope is null then 'gate_scope' end
           ]::text[], null) as missing_contract_fields
    from scoped s
    left join nav_v2_private.nav_v2_task_contract_catalog() catalog
      on catalog.task_type = s.task_type
  ), limited as (
    select *
    from prepared
    order by
      case contract_state
        when 'legacy_or_partial' then 0
        when 'suggested_only' then 1
        when 'manual_review' then 2
        else 3
      end,
      due_date asc nulls first,
      created_at asc
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'task_id', l.id,
    'deal_id', l.deal_id,
    'deal_reference', 'Сделка ' || upper(left(replace(l.deal_id::text, '-', ''), 8)),
    'status', l.status,
    'priority', l.priority,
    'source', l.source,
    'assigned_role', l.assigned_role,
    'due_date', l.due_date,
    'persisted_task_type', l.task_type,
    'persisted_sla_days', l.sla_days,
    'task_contract_version', l.task_contract_version,
    'completion_criterion_code', l.completion_criterion_code,
    'evidence_kind', l.evidence_kind,
    'gate_scope', l.gate_scope,
    'outcome_code', l.outcome_code,
    'outcome_state', l.outcome_state,
    'outcome_review_date', l.outcome_review_date,
    'suggested_task_type', l.suggestion ->> 'task_type',
    'suggestion_confidence', l.suggestion ->> 'confidence',
    'requires_confirmation', coalesce((l.suggestion ->> 'requires_confirmation')::boolean, false),
    'requires_manual_review', coalesce((l.suggestion ->> 'requires_manual_review')::boolean, false),
    'contract_state', l.contract_state,
    'missing_contract_fields', to_jsonb(l.missing_contract_fields),
    'default_sla_days', l.default_sla_days,
    'max_sla_days', l.max_sla_days,
    'allowed_owner_roles', to_jsonb(l.allowed_owner_roles),
    'allowed_evidence_kinds', to_jsonb(l.allowed_evidence_kinds),
    'card_url', format('./deal-card-v2.html?id=%s', l.deal_id)
  ) order by
    case l.contract_state
      when 'legacy_or_partial' then 0
      when 'suggested_only' then 1
      when 'manual_review' then 2
      else 3
    end,
    l.due_date asc nulls first,
    l.created_at asc), '[]'::jsonb)
  into v_items
  from limited l;

  with items as (
    select value as item from jsonb_array_elements(v_items)
  )
  select jsonb_build_object(
    'open_tasks', count(*)::int,
    'persisted_v2', count(*) filter (where item ->> 'contract_state' = 'persisted_v2')::int,
    'legacy_or_partial', count(*) filter (where item ->> 'contract_state' = 'legacy_or_partial')::int,
    'suggested_only', count(*) filter (where item ->> 'contract_state' = 'suggested_only')::int,
    'manual_review', count(*) filter (where item ->> 'contract_state' = 'manual_review')::int,
    'without_owner_role', count(*) filter (where item ->> 'assigned_role' is null)::int,
    'without_due_date', count(*) filter (where item ->> 'due_date' is null)::int,
    'terminal_exception_proposed', count(*) filter (
      where item ->> 'outcome_state' = 'proposed'
        and item ->> 'outcome_code' in ('not_applicable', 'replaced', 'cancelled')
    )::int,
    'active_waiting_or_deferred', count(*) filter (
      where item ->> 'outcome_code' in ('waiting_external', 'deferred')
    )::int
  ) into v_summary
  from items;

  return jsonb_build_object(
    'profile', v_profile,
    'contract_version', 2,
    'preview_only', true,
    'production_rows_changed', false,
    'summary', v_summary,
    'catalog', coalesce((
      select jsonb_agg(jsonb_build_object(
        'task_type', c.task_type,
        'label', c.label,
        'default_sla_days', c.default_sla_days,
        'max_sla_days', c.max_sla_days,
        'default_owner_role', c.default_owner_role,
        'allowed_owner_roles', to_jsonb(c.allowed_owner_roles),
        'completion_criterion_code', c.completion_criterion_code,
        'allowed_evidence_kinds', to_jsonb(c.allowed_evidence_kinds),
        'default_gate_scope', c.default_gate_scope
      ) order by c.task_type)
      from nav_v2_private.nav_v2_task_contract_catalog() c
    ), '[]'::jsonb),
    'items', v_items
  );
end;
$$;

revoke execute on function nav_v2_private.nav_v2_task_contract_catalog()
  from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_suggest_bounded_task_contract(text, public.nav_v2_user_role)
  from public, anon, authenticated;
revoke execute on function public.nav_v2_get_bounded_task_contract_preview(integer)
  from public, anon, authenticated;
grant execute on function public.nav_v2_get_bounded_task_contract_preview(integer)
  to authenticated, service_role;

-- Explicit non-goals:
-- no update, insert or delete of existing task rows;
-- no automatic backfill of task_type, SLA, evidence or outcomes;
-- no generic operational_task, quality_warning or system_recommendation in contract v2;
-- no task title, description, address, client name, phone or free-form evidence in preview DTO;
-- no change to deal readiness, risk gates or deal status.
