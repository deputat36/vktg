-- REPOSITORY-ONLY PROTOTYPE.
-- Apply after:
--   1. nav_v2_bounded_task_contract.sql
--   2. nav_v2_bounded_task_mutations.sql
--   3. nav_v2_get_deal_card_lite_explicit_dto.sql
-- Public signature is unchanged. Production grants are intentionally unchanged.

create or replace function public.nav_v2_get_deal_card_lite(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private
as $$
declare
  v_uid uuid := auth.uid();
  v_is_service boolean := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role';
  v_deal jsonb;
  v_documents jsonb;
  v_tasks jsonb;
  v_risks jsonb;
begin
  if v_uid is null and not v_is_service then
    raise exception 'Требуется авторизация' using errcode = '42501';
  end if;

  if not v_is_service and not nav_v2_private.nav_v2_can_view_deal(p_deal_id, v_uid) then
    raise exception 'Нет доступа к сделке' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', d.id,
    'title', nav_v2_private.nav_v2_lite_reference(
      d.id,
      d.object_type,
      d.address,
      coalesce(d.title like 'ДЕМО:%', false)
    ),
    'display_title', nav_v2_private.nav_v2_lite_reference(
      d.id,
      d.object_type,
      d.address,
      coalesce(d.title like 'ДЕМО:%', false)
    ),
    'status', d.status,
    'risk_level', d.risk_level,
    'object_type', d.object_type,
    'address', nav_v2_private.nav_v2_lite_mask_address(d.address),
    'price_total', d.price_total,
    'settlements_agreed', d.settlements_agreed,
    'created_at', d.created_at
  )
  into v_deal
  from public.nav_deals_v2 d
  where d.id = p_deal_id;

  if v_deal is null then
    raise exception 'Сделка не найдена' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'title', case d.side
      when 'seller' then 'Документ продавца'
      when 'buyer' then 'Документ покупателя'
      else 'Документ по сделке'
    end,
    'status', d.status,
    'side', d.side,
    'is_required', d.is_required,
    'responsible_role', d.responsible_role,
    'due_date', d.due_date,
    'can_change_status', case
      when v_is_service then true
      else public.nav_v2_can_change_document_status(d.id, null, v_uid)
    end,
    'can_mark_received', case
      when v_is_service then true
      else public.nav_v2_can_change_document_status(d.id, 'received', v_uid)
    end,
    'can_mark_checked', case
      when v_is_service then true
      else public.nav_v2_can_change_document_status(d.id, 'checked', v_uid)
    end,
    'can_mark_problem', case
      when v_is_service then true
      else public.nav_v2_can_change_document_status(d.id, 'problem', v_uid)
    end
  ) order by d.is_required desc, d.side, d.created_at), '[]'::jsonb)
  into v_documents
  from public.nav_deal_documents_v2 d
  where d.deal_id = p_deal_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'title', case
      when t.task_contract_version = 2 then coalesce(catalog.label, 'Задача по сделке')
      else 'Задача по сделке'
    end,
    'status', t.status,
    'priority', t.priority,
    'assigned_role', t.assigned_role,
    'due_date', t.due_date,
    'task_contract_version', t.task_contract_version,
    'task_type', case when t.task_contract_version = 2 then t.task_type else null end,
    'evidence_kind', case when t.task_contract_version = 2 then t.evidence_kind else null end,
    'completion_criterion_code', case when t.task_contract_version = 2 then t.completion_criterion_code else null end,
    'gate_scope', case when t.task_contract_version = 2 then t.gate_scope else null end,
    'subject_kind', case when t.task_contract_version = 2 then t.subject_kind else null end,
    'outcome_code', case when t.task_contract_version = 2 then t.outcome_code else null end,
    'outcome_state', case when t.task_contract_version = 2 then t.outcome_state else null end,
    'outcome_reason_code', case when t.task_contract_version = 2 then t.outcome_reason_code else null end,
    'outcome_review_date', case when t.task_contract_version = 2 then t.outcome_review_date else null end,
    'is_bounded', t.task_contract_version = 2,
    'legacy_status_path', t.task_contract_version is distinct from 2,
    'requires_evidence_reference', t.task_contract_version = 2,
    'supports_reopen', t.task_contract_version is distinct from 2,
    'can_change_status', case
      when t.task_contract_version = 2 then false
      when v_is_service then true
      else public.nav_v2_can_change_task_status(t.id, v_uid)
    end,
    'can_start', case
      when t.task_contract_version is distinct from 2 then false
      when t.status not in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status) then false
      when t.outcome_state = 'proposed'
        and t.outcome_code in ('not_applicable', 'replaced', 'cancelled') then false
      when v_is_service then true
      else nav_v2_private.nav_v2_can_operate_bounded_task(t.id, v_uid)
    end,
    'can_complete', case
      when t.task_contract_version is distinct from 2 then false
      when t.status not in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status) then false
      when t.outcome_state = 'proposed'
        and t.outcome_code in ('not_applicable', 'replaced', 'cancelled') then false
      when v_is_service then true
      else nav_v2_private.nav_v2_can_operate_bounded_task(t.id, v_uid)
    end,
    'can_set_active_outcome', case
      when t.task_contract_version is distinct from 2 then false
      when t.status not in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status) then false
      when t.outcome_state = 'proposed'
        and t.outcome_code in ('not_applicable', 'replaced', 'cancelled') then false
      when v_is_service then true
      else nav_v2_private.nav_v2_can_operate_bounded_task(t.id, v_uid)
    end,
    'can_propose_terminal_outcome', case
      when t.task_contract_version is distinct from 2 then false
      when t.status not in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status) then false
      when t.outcome_state = 'proposed'
        and t.outcome_code in ('not_applicable', 'replaced', 'cancelled') then false
      when v_is_service then true
      else nav_v2_private.nav_v2_can_operate_bounded_task(t.id, v_uid)
    end,
    'can_decide_terminal_outcome', case
      when t.task_contract_version is distinct from 2 then false
      when t.outcome_state <> 'proposed'
        or t.outcome_code not in ('not_applicable', 'replaced', 'cancelled') then false
      when v_is_service then true
      else nav_v2_private.nav_v2_can_decide_bounded_task(t.id, v_uid)
    end
  ) order by t.created_at desc), '[]'::jsonb)
  into v_tasks
  from public.nav_deal_tasks_v2 t
  left join nav_v2_private.nav_v2_task_contract_catalog() catalog
    on catalog.task_type = t.task_type
  where t.deal_id = p_deal_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'title', 'Риск сделки',
    'level', r.level,
    'is_resolved', r.is_resolved,
    'blocks_deposit', r.blocks_deposit,
    'blocks_deal', r.blocks_deal
  ) order by r.is_resolved, r.level desc, r.created_at), '[]'::jsonb)
  into v_risks
  from public.nav_deal_risks_v2 r
  where r.deal_id = p_deal_id;

  return jsonb_build_object(
    'deal', v_deal,
    'documents', v_documents,
    'tasks', v_tasks,
    'risks', v_risks,
    'comments', jsonb_build_array(),
    'lite', true,
    'task_contract_aware', true,
    'dto_version', 2
  );
end;
$$;

-- Existing EXECUTE grants, ownership and public signature are intentionally not changed.
-- No task, deal, document, risk, readiness or permission row is mutated.
