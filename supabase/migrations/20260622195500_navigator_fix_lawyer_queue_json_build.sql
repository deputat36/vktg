create or replace function public.nav_v2_get_lawyer_queue(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
  v_role public.nav_v2_user_role;
  v_items jsonb;
  v_counts jsonb;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  select jsonb_build_object('id', id, 'email', email, 'full_name', full_name, 'role', role), role
  into v_profile, v_role
  from public.nav_user_profiles
  where id = v_uid and is_active = true
  limit 1;

  if v_role is null then
    raise exception 'Нет активного профиля CRM Навигатор сделок' using errcode = '42501';
  end if;

  with visible_deals as (
    select d.*
    from public.nav_deals_v2 d
    where
      v_role in ('admin', 'owner')
      or d.created_by = v_uid
      or d.seller_spn_id = v_uid
      or d.buyer_spn_id = v_uid
      or d.manager_id = v_uid
      or d.lawyer_id = v_uid
      or (v_role = 'lawyer' and d.lawyer_needed = true)
      or exists (
        select 1
        from public.nav_deal_participants_v2 p
        where p.deal_id = d.id and p.user_id = v_uid
      )
    order by d.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 150))
  ),
  task_counts as (
    select deal_id, count(*) as open_tasks_count
    from public.nav_deal_tasks_v2
    where status in ('open', 'in_progress')
      and deal_id in (select id from visible_deals)
    group by deal_id
  ),
  risk_counts as (
    select deal_id,
      count(*) filter (where level = 'red' and is_resolved = false) as red_risks_count,
      count(*) filter (where level = 'yellow' and is_resolved = false) as yellow_risks_count
    from public.nav_deal_risks_v2
    where deal_id in (select id from visible_deals)
    group by deal_id
  ),
  doc_counts as (
    select deal_id,
      count(*) filter (where status not in ('received', 'checked')) as missing_documents_count,
      count(*) filter (where status = 'requested') as requested_documents_count,
      count(*) filter (where status = 'requested' and coalesce(requested_at, created_at) <= now() - interval '3 days') as overdue_requested_documents_count,
      min(coalesce(requested_at, created_at)) filter (where status = 'requested') as oldest_requested_document_at,
      count(*) filter (where status = 'problem') as problem_documents_count,
      count(*) filter (where status not in ('received', 'checked', 'requested', 'problem')) as not_requested_documents_count
    from public.nav_deal_documents_v2
    where is_required = true
      and deal_id in (select id from visible_deals)
    group by deal_id
  ),
  review_counts as (
    select deal_id,
      count(*)::int as reviews_count,
      count(*) filter (where decision = 'approved')::int as approved_reviews_count,
      count(*) filter (where decision = 'need_info')::int as need_info_reviews_count,
      count(*) filter (where decision = 'blocked')::int as blocked_reviews_count,
      count(*) filter (where blocks_deposit or blocks_deal or decision = 'blocked')::int as blocking_reviews_count
    from public.nav_deal_reviews_v2
    where deal_id in (select id from visible_deals)
    group by deal_id
  ),
  latest_reviews as (
    select distinct on (deal_id)
      deal_id,
      decision as latest_review_decision,
      reviewer_role as latest_reviewer_role,
      created_at as latest_review_at,
      body as latest_review_body,
      blocks_deposit as latest_blocks_deposit,
      blocks_deal as latest_blocks_deal
    from public.nav_deal_reviews_v2
    where deal_id in (select id from visible_deals)
    order by deal_id, created_at desc
  ),
  rework_submits as (
    select deal_id, max(created_at) as last_spn_rework_at
    from public.nav_deal_events_v2
    where event_type = 'spn_rework_submitted'
      and deal_id in (select id from visible_deals)
    group by deal_id
  ),
  enriched as (
    select
      d.*,
      coalesce(t.open_tasks_count, 0)::int as open_tasks_count,
      coalesce(r.red_risks_count, 0)::int as red_risks_count,
      coalesce(r.yellow_risks_count, 0)::int as yellow_risks_count,
      coalesce(doc.missing_documents_count, 0)::int as missing_documents_count,
      coalesce(doc.requested_documents_count, 0)::int as requested_documents_count,
      coalesce(doc.overdue_requested_documents_count, 0)::int as overdue_requested_documents_count,
      doc.oldest_requested_document_at,
      coalesce(doc.problem_documents_count, 0)::int as problem_documents_count,
      coalesce(doc.not_requested_documents_count, 0)::int as not_requested_documents_count,
      coalesce(rv.reviews_count, 0)::int as reviews_count,
      coalesce(rv.approved_reviews_count, 0)::int as approved_reviews_count,
      coalesce(rv.need_info_reviews_count, 0)::int as need_info_reviews_count,
      coalesce(rv.blocked_reviews_count, 0)::int as blocked_reviews_count,
      coalesce(rv.blocking_reviews_count, 0)::int as blocking_reviews_count,
      lr.latest_review_decision,
      lr.latest_reviewer_role,
      lr.latest_review_at,
      lr.latest_review_body,
      lr.latest_blocks_deposit,
      lr.latest_blocks_deal,
      rs.last_spn_rework_at,
      bp.full_name as buyer_spn,
      sp.full_name as seller_spn,
      mp.full_name as manager_name,
      case
        when coalesce(rv.blocking_reviews_count, 0) > 0 then 'urgent'
        when d.status::text = 'need_info' then 'rework'
        when d.risk_level::text = 'red' or coalesce(r.red_risks_count, 0) > 0 then 'urgent'
        when coalesce(doc.problem_documents_count, 0) > 0 then 'problem_docs'
        when coalesce(doc.overdue_requested_documents_count, 0) > 0 then 'overdue_docs'
        when d.has_children = true or d.has_matcap = true or d.has_nominal_child_money = true then 'urgent'
        when d.status::text = 'ready_for_deposit' and (d.expenses_agreed = false or d.settlements_agreed = false) then 'urgent'
        when d.status::text = 'need_lawyer' and rs.last_spn_rework_at is not null then 'resubmitted'
        when coalesce(doc.missing_documents_count, 0) > 0 or d.status::text = 'need_documents' then 'docs'
        when d.status::text in ('ready_for_deposit','need_lawyer') or d.readiness_deposit >= 70 or coalesce(d.deposit_amount, 0) > 0 then 'deposit'
        when d.status::text in ('ready_for_deal','preparing_deal','registration','registered') or d.readiness_deal >= 80 then 'deal'
        when d.lawyer_needed = true then 'active'
        else 'other'
      end as lawyer_queue,
      (
        (case when coalesce(rv.blocking_reviews_count, 0) > 0 then 45 else 0 end) +
        (case when d.risk_level::text = 'red' or coalesce(r.red_risks_count, 0) > 0 then 40 else 0 end) +
        (case when d.status::text = 'need_lawyer' and rs.last_spn_rework_at is not null then 35 else 0 end) +
        (case when coalesce(doc.problem_documents_count, 0) > 0 then 30 else 0 end) +
        (case when d.status::text = 'need_info' then 25 else 0 end) +
        (case when coalesce(doc.overdue_requested_documents_count, 0) > 0 then 22 else 0 end) +
        (case when d.has_children = true then 20 else 0 end) +
        (case when d.has_matcap = true or d.has_nominal_child_money = true then 20 else 0 end) +
        (case when coalesce(rv.need_info_reviews_count, 0) > 0 then 12 else 0 end) +
        (case when coalesce(doc.not_requested_documents_count, 0) > 0 then 15 else 0 end) +
        (case when coalesce(doc.requested_documents_count, 0) > 0 then 8 else 0 end) +
        (case when d.expenses_agreed = false or d.settlements_agreed = false then 10 else 0 end) +
        (case when d.status::text = 'ready_for_deposit' then 10 else 0 end)
      )::int as priority_score
    from visible_deals d
    left join task_counts t on t.deal_id = d.id
    left join risk_counts r on r.deal_id = d.id
    left join doc_counts doc on doc.deal_id = d.id
    left join review_counts rv on rv.deal_id = d.id
    left join latest_reviews lr on lr.deal_id = d.id
    left join rework_submits rs on rs.deal_id = d.id
    left join public.nav_user_profiles bp on bp.id = d.buyer_spn_id
    left join public.nav_user_profiles sp on sp.id = d.seller_spn_id
    left join public.nav_user_profiles mp on mp.id = d.manager_id
    where d.lawyer_needed = true
      or d.status::text in ('need_lawyer','need_documents','need_info','ready_for_deposit','preparing_deal','ready_for_deal','registration','registered')
      or d.risk_level::text = 'red'
      or coalesce(r.red_risks_count, 0) > 0
      or coalesce(doc.missing_documents_count, 0) > 0
      or coalesce(rv.reviews_count, 0) > 0
      or d.has_children = true
      or d.has_matcap = true
      or d.has_nominal_child_money = true
      or d.readiness_deposit >= 70
  ),
  final_items as (
    select e.*,
      array_remove(array[
        case when e.blocking_reviews_count > 0 then 'блокирующие решения проверки: ' || e.blocking_reviews_count::text end,
        case when e.latest_review_decision is not null then 'последнее решение: ' || e.latest_review_decision end,
        case when e.lawyer_queue = 'resubmitted' then 'СПН отправил доработку повторно' end,
        case when e.risk_level::text = 'red' or e.red_risks_count > 0 then 'красный риск' end,
        case when e.status::text = 'need_info' then 'вернули СПН на доработку' end,
        case when e.has_children then 'дети в сделке' end,
        case when e.has_matcap then 'маткапитал' end,
        case when e.has_nominal_child_money then 'детские деньги' end,
        case when e.problem_documents_count > 0 then 'проблемы по документам: ' || e.problem_documents_count::text end,
        case when e.overdue_requested_documents_count > 0 then 'просрочены запрошенные документы: ' || e.overdue_requested_documents_count::text end,
        case when e.not_requested_documents_count > 0 then 'документы ещё не запрошены: ' || e.not_requested_documents_count::text end,
        case when e.requested_documents_count > 0 then 'ждём документы от клиента: ' || e.requested_documents_count::text end,
        case when e.missing_documents_count > 0 then 'всего не хватает документов: ' || e.missing_documents_count::text end,
        case when e.settlements_agreed = false then 'не согласованы расчеты' end,
        case when e.expenses_agreed = false then 'не согласованы расходы' end,
        case when e.readiness_deposit < 70 then 'низкая готовность к задатку: ' || e.readiness_deposit::text || '%' end
      ], null) as focus_reasons,
      case
        when e.blocking_reviews_count > 0 then 'Проверить блокирующее решение юриста и зафиксировать следующий шаг: снять блокировку, вернуть СПН или остановить сделку.'
        when e.lawyer_queue = 'resubmitted' then 'Проверить, что СПН исправил замечания, и принять решение: можно продолжать или вернуть повторно.'
        when e.status::text = 'need_info' then 'Дождаться доработки СПН или проверить, что именно нужно исправить.'
        when e.risk_level::text = 'red' or e.red_risks_count > 0 then 'Проверить красный риск и зафиксировать решение: стоп-фактор или условия продолжения.'
        when e.problem_documents_count > 0 then 'Проверить документы со статусом проблема и зафиксировать решение для СПН.'
        when e.overdue_requested_documents_count > 0 then 'Запрошенные документы просрочены: отправить напоминание клиенту или зафиксировать проблему.'
        when e.not_requested_documents_count > 0 then 'Запросить недостающие документы у СПН через карточку сделки.'
        when e.requested_documents_count > 0 then 'Проконтролировать получение запрошенных документов или отправить напоминание клиенту.'
        when e.settlements_agreed = false or e.expenses_agreed = false then 'До задатка согласовать расчеты и расходы сторон.'
        when e.lawyer_queue = 'deposit' then 'Проверить условия задатка: сроки, сумму, расчеты, последствия отказа сторон и комплект документов.'
        when e.lawyer_queue = 'deal' then 'Проверить готовность к основному договору и регистрации.'
        else coalesce(e.next_action, 'Проверить юридическую карточку сделки.')
      end as lawyer_next_action
    from enriched e
  ),
  queue_rows as (
    select
      id,
      title,
      status,
      risk_level,
      object_type,
      address,
      seller_name,
      buyer_name,
      seller_phone,
      buyer_phone,
      price_total,
      readiness_deposit,
      readiness_deal,
      lawyer_needed,
      broker_needed,
      has_children,
      has_mortgage,
      has_matcap,
      has_nominal_child_money,
      expenses_agreed,
      settlements_agreed,
      next_action,
      created_at,
      updated_at,
      open_tasks_count,
      red_risks_count,
      yellow_risks_count,
      missing_documents_count,
      requested_documents_count,
      overdue_requested_documents_count,
      oldest_requested_document_at,
      problem_documents_count,
      not_requested_documents_count,
      reviews_count,
      approved_reviews_count,
      need_info_reviews_count,
      blocked_reviews_count,
      blocking_reviews_count,
      latest_review_decision,
      latest_reviewer_role,
      latest_review_at,
      latest_review_body,
      latest_blocks_deposit,
      latest_blocks_deal,
      buyer_spn,
      seller_spn,
      manager_name as manager,
      lawyer_queue,
      priority_score,
      last_spn_rework_at,
      to_jsonb(focus_reasons) as focus_reasons,
      lawyer_next_action
    from final_items
  )
  select coalesce(jsonb_agg(to_jsonb(q) order by q.priority_score desc, q.updated_at desc), '[]'::jsonb)
  into v_items
  from queue_rows q;

  select jsonb_build_object(
    'total', count(*),
    'urgent', count(*) filter (where item->>'lawyer_queue' = 'urgent'),
    'problem_docs', count(*) filter (where item->>'lawyer_queue' = 'problem_docs'),
    'overdue_docs', count(*) filter (where item->>'lawyer_queue' = 'overdue_docs'),
    'resubmitted', count(*) filter (where item->>'lawyer_queue' = 'resubmitted'),
    'rework', count(*) filter (where item->>'lawyer_queue' = 'rework'),
    'docs', count(*) filter (where item->>'lawyer_queue' = 'docs'),
    'deposit', count(*) filter (where item->>'lawyer_queue' = 'deposit'),
    'deal', count(*) filter (where item->>'lawyer_queue' = 'deal'),
    'active', count(*) filter (where item->>'lawyer_queue' = 'active'),
    'other', count(*) filter (where item->>'lawyer_queue' = 'other'),
    'blocking_reviews', count(*) filter (where coalesce((item->>'blocking_reviews_count')::int, 0) > 0)
  )
  into v_counts
  from jsonb_array_elements(coalesce(v_items, '[]'::jsonb)) as item;

  return jsonb_build_object('profile', v_profile, 'counts', coalesce(v_counts, '{}'::jsonb), 'items', v_items);
end;
$function$;

revoke all on function public.nav_v2_get_lawyer_queue(integer) from public;
revoke execute on function public.nav_v2_get_lawyer_queue(integer) from anon;
grant execute on function public.nav_v2_get_lawyer_queue(integer) to authenticated;
grant execute on function public.nav_v2_get_lawyer_queue(integer) to service_role;
