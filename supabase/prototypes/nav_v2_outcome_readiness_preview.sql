-- REPOSITORY-ONLY PROTOTYPE.
-- Depends on supabase/prototypes/nav_v2_work_item_outcomes.sql.
-- Do not apply to production before authenticated role/mutation regression on isolated synthetic data.
-- This preview is read-only and does not replace production readiness fields or status guards.

create or replace function nav_v2_private.nav_v2_document_outcome_is_terminal_complete(
  p_status text,
  p_outcome_code text,
  p_outcome_state text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(p_status, '') = 'checked'
    or (
      coalesce(p_outcome_state, '') = 'confirmed'
      and coalesce(p_outcome_code, '') in ('not_applicable', 'replaced', 'cancelled')
    );
$$;

create or replace function nav_v2_private.nav_v2_risk_outcome_is_active(
  p_is_resolved boolean,
  p_resolution_code text,
  p_resolution_state text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when coalesce(p_resolution_state, '') = 'confirmed' and nullif(trim(coalesce(p_resolution_code, '')), '') is not null then false
    when coalesce(p_resolution_state, '') in ('proposed', 'rejected') then true
    when coalesce(p_is_resolved, false) is true then false
    else true
  end;
$$;

create or replace function public.nav_v2_get_outcome_readiness_preview(
  p_deal_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_profile jsonb;
  v_items jsonb;
  v_summary jsonb;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  select p.role,
    jsonb_build_object(
      'id', p.id,
      'full_name', p.full_name,
      'role', p.role
    )
  into v_role, v_profile
  from public.nav_user_profiles p
  where p.id = v_uid
    and p.is_active is true
  limit 1;

  if v_role is null then
    raise exception 'Нет активного профиля Навигатора' using errcode = '42501';
  end if;

  with scoped_deals as (
    select d.id, d.status, d.updated_at
    from public.nav_deals_v2 d
    where (p_deal_id is null or d.id = p_deal_id)
      and nav_v2_private.nav_v2_can_view_deal(d.id, v_uid)
    order by d.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  ), document_counts as (
    select
      d.id as deal_id,
      count(doc.id) filter (where doc.status = 'checked')::int as checked,
      count(doc.id) filter (
        where doc.status = 'received'
          and not nav_v2_private.nav_v2_document_outcome_is_terminal_complete(doc.status, doc.outcome_code, doc.outcome_state)
      )::int as received_not_checked,
      count(doc.id) filter (
        where doc.outcome_state = 'confirmed'
          and doc.outcome_code in ('not_applicable', 'replaced', 'cancelled')
      )::int as confirmed_terminal_outcomes,
      count(doc.id) filter (
        where doc.outcome_state = 'proposed'
          and doc.outcome_code in ('not_applicable', 'replaced', 'cancelled')
      )::int as proposed_terminal_outcomes,
      count(doc.id) filter (
        where doc.outcome_code = 'external_wait'
          and doc.outcome_state = 'confirmed'
      )::int as external_wait,
      count(doc.id) filter (
        where doc.outcome_code = 'deferred'
          and doc.outcome_state = 'confirmed'
      )::int as deferred,
      count(doc.id) filter (where doc.status = 'problem')::int as problem,
      count(doc.id) filter (
        where doc.required_for_deposit is true
          and not nav_v2_private.nav_v2_document_outcome_is_terminal_complete(doc.status, doc.outcome_code, doc.outcome_state)
      )::int as active_required_for_deposit,
      count(doc.id) filter (
        where doc.required_for_deal is true
          and not nav_v2_private.nav_v2_document_outcome_is_terminal_complete(doc.status, doc.outcome_code, doc.outcome_state)
      )::int as active_required_for_deal,
      count(doc.id) filter (
        where doc.required_for_deposit is true
          and doc.status not in ('received', 'checked')
      )::int as legacy_unresolved_deposit_documents,
      count(doc.id) filter (
        where doc.required_for_deal is true
          and doc.status not in ('received', 'checked')
      )::int as legacy_unresolved_deal_documents
    from scoped_deals d
    left join public.nav_deal_documents_v2 doc on doc.deal_id = d.id
    group by d.id
  ), risk_counts as (
    select
      d.id as deal_id,
      count(r.id) filter (
        where nav_v2_private.nav_v2_risk_outcome_is_active(r.is_resolved, r.resolution_code, r.resolution_state)
      )::int as active_total,
      count(r.id) filter (
        where nav_v2_private.nav_v2_risk_outcome_is_active(r.is_resolved, r.resolution_code, r.resolution_state)
          and r.blocks_deposit is true
      )::int as active_blocks_deposit,
      count(r.id) filter (
        where nav_v2_private.nav_v2_risk_outcome_is_active(r.is_resolved, r.resolution_code, r.resolution_state)
          and r.blocks_deal is true
      )::int as active_blocks_deal,
      count(r.id) filter (where r.resolution_state = 'proposed')::int as proposed_resolutions,
      count(r.id) filter (where r.resolution_state = 'confirmed')::int as confirmed_resolutions,
      count(r.id) filter (
        where r.is_resolved is true
          and nullif(trim(coalesce(r.resolution_code, '')), '') is null
      )::int as legacy_resolved_without_code
    from scoped_deals d
    left join public.nav_deal_risks_v2 r on r.deal_id = d.id
    group by d.id
  ), review_counts as (
    select
      d.id as deal_id,
      count(rv.id) filter (
        where rv.decision = 'blocked' or rv.blocks_deposit is true
      )::int as blocks_deposit,
      count(rv.id) filter (
        where rv.decision = 'blocked' or rv.blocks_deal is true
      )::int as blocks_deal
    from scoped_deals d
    left join public.nav_deal_reviews_v2 rv on rv.deal_id = d.id
    group by d.id
  ), prepared as (
    select
      d.id,
      d.status,
      d.updated_at,
      coalesce(doc.checked, 0) as checked,
      coalesce(doc.received_not_checked, 0) as received_not_checked,
      coalesce(doc.confirmed_terminal_outcomes, 0) as confirmed_terminal_outcomes,
      coalesce(doc.proposed_terminal_outcomes, 0) as proposed_terminal_outcomes,
      coalesce(doc.external_wait, 0) as external_wait,
      coalesce(doc.deferred, 0) as deferred,
      coalesce(doc.problem, 0) as problem,
      coalesce(doc.active_required_for_deposit, 0) as active_required_for_deposit,
      coalesce(doc.active_required_for_deal, 0) as active_required_for_deal,
      coalesce(doc.legacy_unresolved_deposit_documents, 0) as legacy_unresolved_deposit_documents,
      coalesce(doc.legacy_unresolved_deal_documents, 0) as legacy_unresolved_deal_documents,
      coalesce(risk.active_total, 0) as active_risks_total,
      coalesce(risk.active_blocks_deposit, 0) as active_blocks_deposit,
      coalesce(risk.active_blocks_deal, 0) as active_blocks_deal,
      coalesce(risk.proposed_resolutions, 0) as proposed_resolutions,
      coalesce(risk.confirmed_resolutions, 0) as confirmed_resolutions,
      coalesce(risk.legacy_resolved_without_code, 0) as legacy_resolved_without_code,
      coalesce(review.blocks_deposit, 0) as review_blocks_deposit,
      coalesce(review.blocks_deal, 0) as review_blocks_deal
    from scoped_deals d
    left join document_counts doc on doc.deal_id = d.id
    left join risk_counts risk on risk.deal_id = d.id
    left join review_counts review on review.deal_id = d.id
  ), final as (
    select
      p.*,
      (
        p.active_required_for_deposit = 0
        and p.active_blocks_deposit = 0
        and p.review_blocks_deposit = 0
      ) as deposit_ready,
      (
        p.active_required_for_deal = 0
        and p.active_blocks_deal = 0
        and p.review_blocks_deal = 0
      ) as deal_ready,
      case
        when p.active_required_for_deposit > 0 then format('Обязательных документов к задатку ещё активно: %s', p.active_required_for_deposit)
        when p.active_blocks_deposit > 0 then format('Активных рисков, блокирующих задаток: %s', p.active_blocks_deposit)
        when p.review_blocks_deposit > 0 then format('Блокирующих решений проверки к задатку: %s', p.review_blocks_deposit)
        when p.active_required_for_deal > 0 then format('Обязательных документов к сделке ещё активно: %s', p.active_required_for_deal)
        when p.active_blocks_deal > 0 then format('Активных рисков, блокирующих сделку: %s', p.active_blocks_deal)
        when p.review_blocks_deal > 0 then format('Блокирующих решений проверки к сделке: %s', p.review_blocks_deal)
        else 'Документные, риск- и review-gates по целевому outcome-контракту закрыты'
      end as main_reason
    from prepared p
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'deal_id', f.id,
    'card_url', format('./deal-card-v2.html?id=%s', f.id),
    'status', f.status,
    'deposit', jsonb_build_object(
      'ready', f.deposit_ready,
      'blocking_documents', f.active_required_for_deposit,
      'blocking_risks', f.active_blocks_deposit,
      'blocking_reviews', f.review_blocks_deposit
    ),
    'deal', jsonb_build_object(
      'ready', f.deal_ready,
      'blocking_documents', f.active_required_for_deal,
      'blocking_risks', f.active_blocks_deal,
      'blocking_reviews', f.review_blocks_deal
    ),
    'document_counts', jsonb_build_object(
      'checked', f.checked,
      'received_not_checked', f.received_not_checked,
      'confirmed_terminal_outcomes', f.confirmed_terminal_outcomes,
      'proposed_terminal_outcomes', f.proposed_terminal_outcomes,
      'external_wait', f.external_wait,
      'deferred', f.deferred,
      'problem', f.problem,
      'active_required_for_deposit', f.active_required_for_deposit,
      'active_required_for_deal', f.active_required_for_deal
    ),
    'risk_counts', jsonb_build_object(
      'active_total', f.active_risks_total,
      'active_blocks_deposit', f.active_blocks_deposit,
      'active_blocks_deal', f.active_blocks_deal,
      'proposed_resolutions', f.proposed_resolutions,
      'confirmed_resolutions', f.confirmed_resolutions,
      'legacy_resolved_without_code', f.legacy_resolved_without_code
    ),
    'review_counts', jsonb_build_object(
      'blocks_deposit', f.review_blocks_deposit,
      'blocks_deal', f.review_blocks_deal
    ),
    'legacy_comparison', jsonb_build_object(
      'legacy_unresolved_deposit_documents', f.legacy_unresolved_deposit_documents,
      'legacy_unresolved_deal_documents', f.legacy_unresolved_deal_documents,
      'target_unresolved_deposit_documents', f.active_required_for_deposit,
      'target_unresolved_deal_documents', f.active_required_for_deal,
      'deposit_delta', f.active_required_for_deposit - f.legacy_unresolved_deposit_documents,
      'deal_delta', f.active_required_for_deal - f.legacy_unresolved_deal_documents
    ),
    'main_reason', f.main_reason
  ) order by f.updated_at desc), '[]'::jsonb)
  into v_items
  from final f;

  with rows as (
    select value as item
    from jsonb_array_elements(v_items)
  )
  select jsonb_build_object(
    'deals', count(*)::int,
    'deposit_ready', count(*) filter (where (item #>> '{deposit,ready}')::boolean)::int,
    'deal_ready', count(*) filter (where (item #>> '{deal,ready}')::boolean)::int,
    'with_proposed_document_outcomes', count(*) filter (where (item #>> '{document_counts,proposed_terminal_outcomes}')::int > 0)::int,
    'with_external_wait', count(*) filter (where (item #>> '{document_counts,external_wait}')::int > 0)::int,
    'with_deferred_documents', count(*) filter (where (item #>> '{document_counts,deferred}')::int > 0)::int,
    'with_proposed_risk_resolutions', count(*) filter (where (item #>> '{risk_counts,proposed_resolutions}')::int > 0)::int,
    'with_legacy_resolved_risks_without_code', count(*) filter (where (item #>> '{risk_counts,legacy_resolved_without_code}')::int > 0)::int,
    'legacy_target_document_count_differs', count(*) filter (
      where (item #>> '{legacy_comparison,deposit_delta}')::int <> 0
         or (item #>> '{legacy_comparison,deal_delta}')::int <> 0
    )::int
  )
  into v_summary
  from rows;

  return jsonb_build_object(
    'profile', v_profile,
    'preview_only', true,
    'generated_at', now(),
    'summary', v_summary,
    'items', v_items
  );
end;
$$;

-- No grants are added in this prototype.
-- No status guard, readiness field, document status, outcome state or risk row is changed.
