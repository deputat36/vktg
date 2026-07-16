-- REPOSITORY-ONLY PROTOTYPE.
-- Apply after nav_v2_bounded_task_contract.sql in an isolated PostgreSQL 17 environment only.
-- This function is read-only: no legacy task update, recreation, completion or cancellation.

create or replace function public.nav_v2_get_legacy_task_review_pack(
  p_limit integer default 100
)
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
    raise exception 'Legacy task review доступен владельцу, администратору и менеджеру'
      using errcode = '42501';
  end if;

  with scoped as (
    select
      t.id,
      t.deal_id,
      t.status,
      t.priority,
      t.source,
      t.assigned_role,
      t.assigned_to,
      assignee.full_name as assignee_name,
      t.due_date,
      t.created_at,
      case
        when coalesce(t.source, '') like 'auto_quality_%' then 'card_correction'
        when coalesce(t.source, '') in ('auto_settlements', 'auto_expenses') then 'term_approval'
        when coalesce(t.source, '') in ('auto_lawyer', 'auto_children', 'auto_share_lawyer') then 'legal_decision'
        when coalesce(t.source, '') = 'auto_broker'
             and t.assigned_role = 'broker'::public.nav_v2_user_role then 'financial_decision'
        else null
      end as suggested_task_type
    from public.nav_deal_tasks_v2 t
    join public.nav_deals_v2 d on d.id = t.deal_id
    left join public.nav_user_profiles assignee on assignee.id = t.assigned_to
    where t.task_contract_version is null
      and not (
        coalesce((d.deal_summary ->> 'demo') = 'true', false)
        or coalesce((d.wizard_snapshot ->> 'demo') = 'true', false)
        or coalesce(d.title, '') like 'ДЕМО:%'
        or coalesce(t.source, '') = 'demo'
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
  ), enriched as (
    select
      s.*,
      catalog.default_sla_days,
      catalog.max_sla_days,
      catalog.completion_criterion_code,
      catalog.allowed_owner_roles,
      catalog.allowed_evidence_kinds,
      catalog.default_gate_scope,
      (
        s.suggested_task_type is not null
        and s.assigned_role is not null
        and s.assigned_role = any(catalog.allowed_owner_roles)
      ) as role_compatible,
      case
        when s.suggested_task_type is not null
          and s.assigned_role is not null
          and s.assigned_role = any(catalog.allowed_owner_roles)
          then 'high'
        else 'none'
      end as suggestion_confidence
    from scoped s
    left join nav_v2_private.nav_v2_task_contract_catalog() catalog
      on catalog.task_type = s.suggested_task_type
  ), prepared as (
    select
      e.*,
      case
        when e.status in ('done'::public.nav_v2_task_status, 'cancelled'::public.nav_v2_task_status)
          then 'leave_legacy'
        when e.suggestion_confidence = 'high' and e.role_compatible is true
          then 'candidate_for_recreate'
        else 'manual_review'
      end as recommended_decision,
      case
        when e.status in ('done'::public.nav_v2_task_status, 'cancelled'::public.nav_v2_task_status)
          then array['leave_legacy', 'manual_review']::text[]
        else array['leave_legacy', 'candidate_for_recreate', 'manual_review', 'retire_after_evidence']::text[]
      end as allowed_decisions,
      greatest(0, current_date - e.created_at::date) as age_days,
      case
        when e.status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)
          and e.due_date is not null
          and e.due_date < current_date
          then current_date - e.due_date
        else 0
      end as overdue_days
    from enriched e
  ), limited as (
    select *
    from prepared
    order by
      case recommended_decision
        when 'candidate_for_recreate' then 0
        when 'manual_review' then 1
        else 2
      end,
      overdue_days desc,
      due_date asc nulls first,
      created_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'task_id', l.id,
    'task_reference', 'Задача ' || upper(left(replace(l.id::text, '-', ''), 8)),
    'deal_id', l.deal_id,
    'deal_reference', 'Сделка ' || upper(left(replace(l.deal_id::text, '-', ''), 8)),
    'status', l.status,
    'priority', l.priority,
    'source', l.source,
    'assigned_role', l.assigned_role,
    'assigned_to', l.assigned_to,
    'assignee_name', l.assignee_name,
    'due_date', l.due_date,
    'created_at', l.created_at,
    'age_days', l.age_days,
    'overdue_days', l.overdue_days,
    'suggested_task_type', l.suggested_task_type,
    'suggestion_confidence', l.suggestion_confidence,
    'role_compatible', l.role_compatible,
    'recommended_decision', l.recommended_decision,
    'allowed_decisions', to_jsonb(l.allowed_decisions),
    'default_sla_days', l.default_sla_days,
    'max_sla_days', l.max_sla_days,
    'completion_criterion_code', l.completion_criterion_code,
    'allowed_owner_roles', to_jsonb(l.allowed_owner_roles),
    'allowed_evidence_kinds', to_jsonb(l.allowed_evidence_kinds),
    'default_gate_scope', l.default_gate_scope
  ) order by
    case l.recommended_decision
      when 'candidate_for_recreate' then 0
      when 'manual_review' then 1
      else 2
    end,
    l.overdue_days desc,
    l.due_date asc nulls first,
    l.created_at asc), '[]'::jsonb)
  into v_items
  from limited l;

  with items as (
    select value as item from jsonb_array_elements(v_items)
  )
  select jsonb_build_object(
    'reviewed_rows', count(*)::int,
    'active_rows', count(*) filter (
      where item ->> 'status' in ('open', 'in_progress')
    )::int,
    'done_or_cancelled', count(*) filter (
      where item ->> 'status' in ('done', 'cancelled')
    )::int,
    'candidate_for_recreate', count(*) filter (
      where item ->> 'recommended_decision' = 'candidate_for_recreate'
    )::int,
    'manual_review', count(*) filter (
      where item ->> 'recommended_decision' = 'manual_review'
    )::int,
    'leave_legacy', count(*) filter (
      where item ->> 'recommended_decision' = 'leave_legacy'
    )::int,
    'overdue_active', count(*) filter (
      where coalesce((item ->> 'overdue_days')::integer, 0) > 0
    )::int
  ) into v_summary
  from items;

  return jsonb_build_object(
    'profile', v_profile,
    'preview_only', true,
    'production_rows_changed', false,
    'backfill_performed', false,
    'new_tasks_created', false,
    'tasks_completed_or_cancelled', false,
    'employee_evaluation_allowed', false,
    'summary', v_summary,
    'review_decisions', jsonb_build_object(
      'leave_legacy', 'Оставить историческую строку без изменения',
      'candidate_for_recreate', 'Кандидат на явное пересоздание после ручной проверки',
      'manual_review', 'Нужна ручная классификация',
      'retire_after_evidence', 'Закрыть только после отдельного evidence и governed mutation'
    ),
    'items', v_items
  );
end;
$$;

revoke execute on function public.nav_v2_get_legacy_task_review_pack(integer)
  from public, anon, authenticated;
grant execute on function public.nav_v2_get_legacy_task_review_pack(integer)
  to service_role;

-- Explicit non-goals:
-- no update, insert or delete of public.nav_deal_tasks_v2;
-- no bounded task creation or legacy backfill;
-- no task completion or cancellation;
-- no employee evaluation or ranking;
-- no title, description, address, client name, phone, email or document URL in DTO;
-- no readiness, risk gate or deal status changes.
