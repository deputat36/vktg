create or replace function nav_v2_private.nav_v2_get_operational_pilot_shortlist_unchecked_20260714(
  p_days integer default 30,
  p_limit integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_days integer := greatest(7, least(coalesce(p_days, 30), 90));
  v_limit integer := greatest(1, least(coalesce(p_limit, 3), 3));
  v_adoption jsonb;
  v_evidence jsonb;
  v_items jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  select profile.role
  into v_role
  from public.nav_user_profiles profile
  where profile.id = v_uid
    and profile.is_active is true
  limit 1;

  if v_role is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'Пилотный shortlist доступен владельцу, администратору и менеджеру' using errcode = '42501';
  end if;

  v_adoption := nav_v2_private.nav_v2_get_operational_adoption_report_unchecked_20260713(v_days, 500);
  v_evidence := nav_v2_private.nav_v2_get_responsibility_evidence_unchecked_20260713(500);

  with adoption_items as (
    select item->>'deal_id' as deal_id, item
    from jsonb_array_elements(coalesce(v_adoption->'items', '[]'::jsonb)) item
  ),
  evidence_items as (
    select item->>'deal_id' as deal_id, item
    from jsonb_array_elements(coalesce(v_evidence->'items', '[]'::jsonb)) item
  ),
  base_rows as (
    select
      deal.id,
      deal.title,
      deal.address,
      deal.status::text as deal_status,
      deal.risk_level::text as risk_level,
      deal.readiness_deposit,
      deal.readiness_deal,
      deal.created_at,
      deal.updated_at,
      deal.manager_id,
      manager.full_name as manager_name,
      deal.seller_spn_id,
      seller.full_name as seller_spn_name,
      seller.role::text as seller_profile_role,
      deal.buyer_spn_id,
      buyer.full_name as buyer_spn_name,
      buyer.role::text as buyer_profile_role,
      ((seller.role = 'spn'::public.nav_v2_user_role and seller.is_active is true)
        or (buyer.role = 'spn'::public.nav_v2_user_role and buyer.is_active is true)) as has_active_spn,
      lower(regexp_replace(coalesce(nullif(btrim(deal.address), ''), nullif(btrim(deal.title), ''), deal.id::text), '[^0-9a-zа-яё]+', '', 'g')) as duplicate_key,
      coalesce((adoption.item->>'meaningful_events')::integer, 0) as meaningful_events,
      coalesce((adoption.item->>'activity_signals')::integer, 0) as activity_signals,
      coalesce((adoption.item->>'open_tasks')::integer, 0) as open_tasks,
      coalesce((adoption.item->>'overdue_tasks')::integer, 0) as overdue_tasks,
      coalesce((adoption.item->>'open_risks')::integer, 0) as open_risks,
      coalesce((adoption.item->>'stale_days')::integer, 0) as stale_days,
      adoption.item->>'last_meaningful_activity_at' as last_meaningful_activity_at,
      coalesce(evidence.item->>'evidence_state', 'no_active_spn_evidence') as evidence_state,
      coalesce((evidence.item->>'strongest_signal_types')::integer, 0) as strongest_signal_types,
      coalesce((evidence.item->'candidates'->0->>'total_signal_count')::integer, 0) as strongest_signal_count,
      evidence.item->'candidates'->0->>'candidate_id' as evidence_candidate_id,
      evidence.item->'candidates'->0->>'candidate_name' as evidence_candidate_name,
      evidence.item->'candidates'->0->>'manager_link_status' as evidence_manager_link_status,
      coalesce(task_stats.high_open_tasks, 0) as high_open_tasks,
      coalesce(task_stats.done_tasks, 0) as done_tasks,
      coalesce(risk_stats.blocking_deal_risks, 0) as blocking_deal_risks,
      coalesce(risk_stats.blocking_deposit_risks, 0) as blocking_deposit_risks,
      coalesce(risk_stats.resolved_risks, 0) as resolved_risks,
      coalesce(document_stats.open_required_documents, 0) as open_required_documents,
      coalesce(document_stats.overdue_required_documents, 0) as overdue_required_documents,
      coalesce(document_stats.resolved_documents, 0) as resolved_documents,
      coalesce(document_stats.unowned_required_documents, 0) as unowned_required_documents
    from adoption_items adoption
    join public.nav_deals_v2 deal on deal.id::text = adoption.deal_id
    left join evidence_items evidence on evidence.deal_id = adoption.deal_id
    left join public.nav_user_profiles manager on manager.id = deal.manager_id
    left join public.nav_user_profiles seller on seller.id = deal.seller_spn_id
    left join public.nav_user_profiles buyer on buyer.id = deal.buyer_spn_id
    left join lateral (
      select
        count(*) filter (where task.status::text in ('open', 'in_progress') and task.priority::text in ('urgent', 'high'))::integer as high_open_tasks,
        count(*) filter (where task.status::text = 'done')::integer as done_tasks
      from public.nav_deal_tasks_v2 task
      where task.deal_id = deal.id
    ) task_stats on true
    left join lateral (
      select
        count(*) filter (where risk.is_resolved is false and risk.blocks_deal is true)::integer as blocking_deal_risks,
        count(*) filter (where risk.is_resolved is false and risk.blocks_deposit is true)::integer as blocking_deposit_risks,
        count(*) filter (where risk.is_resolved is true)::integer as resolved_risks
      from public.nav_deal_risks_v2 risk
      where risk.deal_id = deal.id
    ) risk_stats on true
    left join lateral (
      select
        count(*) filter (where document.is_required is true and document.status not in ('checked', 'not_required'))::integer as open_required_documents,
        count(*) filter (where document.is_required is true and document.due_date is not null and document.due_date < current_date and document.status not in ('checked', 'not_required'))::integer as overdue_required_documents,
        count(*) filter (where document.status in ('checked', 'not_required'))::integer as resolved_documents,
        count(*) filter (where document.is_required is true and document.assigned_to is null and document.responsible_role is null and document.status not in ('checked', 'not_required'))::integer as unowned_required_documents
      from public.nav_deal_documents_v2 document
      where document.deal_id = deal.id
    ) document_stats on true
  ),
  scoped as (
    select base_rows.*, count(*) over (partition by duplicate_key)::integer as duplicate_group_size
    from base_rows
  ),
  quick_result as (
    select row.*
    from scoped row
    where nullif(btrim(row.address), '') is not null
      and row.duplicate_group_size = 1
      and row.unowned_required_documents = 0
      and row.evidence_state <> 'strong_single_evidence'
    order by row.overdue_required_documents asc, row.open_required_documents asc, row.resolved_documents desc,
      row.blocking_deal_risks asc, row.high_open_tasks asc, row.overdue_tasks asc,
      row.meaningful_events desc, row.readiness_deal desc, row.created_at desc
    limit 1
  ),
  responsibility_confirmation as (
    select row.*
    from scoped row
    where row.evidence_state = 'strong_single_evidence'
      and nullif(btrim(row.address), '') is not null
      and row.id not in (select id from quick_result)
      and row.duplicate_key not in (select duplicate_key from quick_result)
    order by row.duplicate_group_size asc, row.blocking_deal_risks asc, row.high_open_tasks asc,
      row.open_required_documents asc, row.strongest_signal_types desc, row.strongest_signal_count desc,
      row.meaningful_events desc, row.created_at desc
    limit 1
  ),
  document_workflow as (
    select row.*
    from scoped row
    where row.id not in (select id from quick_result union all select id from responsibility_confirmation)
      and row.duplicate_key not in (select duplicate_key from quick_result union all select duplicate_key from responsibility_confirmation)
      and row.duplicate_group_size = 1
      and row.unowned_required_documents = 0
      and row.resolved_documents > 0
      and row.open_required_documents > 0
    order by row.meaningful_events desc, row.resolved_documents desc, row.open_required_documents asc,
      row.blocking_deal_risks asc, row.overdue_required_documents asc, row.created_at desc
    limit 1
  ),
  selected as (
    select 1 as review_order, 'quick_result'::text as lane, 'Быстрый пилотный цикл'::text as lane_label,
      'Проверить, можно ли получить один подтверждённый результат за короткий цикл без бесхозного документного контура.'::text as lane_goal,
      'Открыть карточку, подтвердить ответственных и выбрать одно проверяемое действие, которое можно завершить и зафиксировать.'::text as safe_action,
      row.* from quick_result row
    union all
    select 2, 'responsibility_confirmation', 'Подтверждение ответственности',
      'Проверить evidence-кандидата, сторону сделки и менеджерскую связь до любых назначений.',
      'Сверить evidence-кандидата с владельцем и карточкой сделки; определить сторону только вручную.',
      row.* from responsibility_confirmation row
    union all
    select 3, 'document_workflow', 'Документный рабочий цикл',
      'Проверить полный путь документа: ответственный, срок, подтверждение результата и следующий шаг.',
      'Выбрать один обязательный документ, назначить ручной контроль и завершить цикл только по факту.',
      row.* from document_workflow row
  ),
  metrics as (
    select
      count(*)::integer as deals_in_scope,
      count(*) filter (where nullif(btrim(address), '') is not null and duplicate_group_size = 1 and unowned_required_documents = 0 and evidence_state <> 'strong_single_evidence')::integer as quick_result_candidates,
      count(*) filter (where evidence_state = 'strong_single_evidence' and nullif(btrim(address), '') is not null)::integer as responsibility_candidates,
      count(*) filter (where duplicate_group_size = 1 and unowned_required_documents = 0 and resolved_documents > 0 and open_required_documents > 0)::integer as document_workflow_candidates,
      count(distinct duplicate_key) filter (where duplicate_group_size > 1)::integer as duplicate_groups
    from scoped
  )
  select
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'review_order', row.review_order,
        'lane', row.lane,
        'lane_label', row.lane_label,
        'lane_goal', row.lane_goal,
        'safe_action', row.safe_action,
        'deal_id', row.id,
        'deal_title', row.title,
        'address', row.address,
        'deal_status', row.deal_status,
        'risk_level', row.risk_level,
        'readiness_deposit', row.readiness_deposit,
        'readiness_deal', row.readiness_deal,
        'manager_id', row.manager_id,
        'manager_name', row.manager_name,
        'seller_spn_id', row.seller_spn_id,
        'seller_spn_name', row.seller_spn_name,
        'seller_profile_role', row.seller_profile_role,
        'buyer_spn_id', row.buyer_spn_id,
        'buyer_spn_name', row.buyer_spn_name,
        'buyer_profile_role', row.buyer_profile_role,
        'has_active_spn', row.has_active_spn,
        'duplicate_group_size', row.duplicate_group_size,
        'evidence_state', row.evidence_state,
        'evidence_candidate_id', row.evidence_candidate_id,
        'evidence_candidate_name', row.evidence_candidate_name,
        'evidence_manager_link_status', row.evidence_manager_link_status,
        'strongest_signal_types', row.strongest_signal_types,
        'strongest_signal_count', row.strongest_signal_count,
        'meaningful_events', row.meaningful_events,
        'activity_signals', row.activity_signals,
        'last_meaningful_activity_at', row.last_meaningful_activity_at,
        'stale_days', row.stale_days,
        'open_tasks', row.open_tasks,
        'overdue_tasks', row.overdue_tasks,
        'high_open_tasks', row.high_open_tasks,
        'done_tasks', row.done_tasks,
        'open_risks', row.open_risks,
        'blocking_deal_risks', row.blocking_deal_risks,
        'blocking_deposit_risks', row.blocking_deposit_risks,
        'resolved_risks', row.resolved_risks,
        'open_required_documents', row.open_required_documents,
        'overdue_required_documents', row.overdue_required_documents,
        'resolved_documents', row.resolved_documents,
        'unowned_required_documents', row.unowned_required_documents,
        'reasons', to_jsonb(array_remove(array[
          case when row.duplicate_group_size = 1 then 'Уникальный адрес: вероятный дубль в текущем scope не найден.' end,
          case when row.lane = 'quick_result' and row.overdue_required_documents = 0 then 'Нет просроченных обязательных документов.' end,
          case when row.lane = 'quick_result' and row.unowned_required_documents = 0 then 'Нет обязательных документов без ответственного или роли.' end,
          case when row.lane = 'quick_result' then format('Значимых событий за период: %s; готовность к сделке: %s%%.', row.meaningful_events, row.readiness_deal) end,
          case when row.lane = 'responsibility_confirmation' then format('Evidence-кандидат: %s; независимых типов сигналов: %s; действий: %s.', coalesce(row.evidence_candidate_name, 'не указан'), row.strongest_signal_types, row.strongest_signal_count) end,
          case when row.lane = 'document_workflow' then format('Документы дают смешанный проверяемый цикл: подтверждено %s, открыто обязательных %s.', row.resolved_documents, row.open_required_documents) end,
          case when row.lane = 'document_workflow' then format('Значимых событий за период: %s.', row.meaningful_events) end
        ]::text[], null)),
        'cautions', to_jsonb(array_remove(array[
          case when row.duplicate_group_size > 1 then format('Найдена группа из %s вероятных дублей; до пилота выбрать только одну карточку.', row.duplicate_group_size) end,
          case when row.open_required_documents > 0 then format('Открытых обязательных документов: %s.', row.open_required_documents) end,
          case when row.overdue_required_documents > 0 then format('Просроченных обязательных документов: %s.', row.overdue_required_documents) end,
          case when row.unowned_required_documents > 0 then format('Обязательных документов без ответственного или роли: %s.', row.unowned_required_documents) end,
          case when row.blocking_deal_risks > 0 then format('Рисков, блокирующих сделку: %s.', row.blocking_deal_risks) end,
          case when row.overdue_tasks > 0 then format('Просроченных задач: %s.', row.overdue_tasks) end,
          case when row.lane = 'responsibility_confirmation' and row.evidence_manager_link_status = 'missing' then 'У evidence-кандидата отсутствует manager_id.' end,
          case when row.lane <> 'responsibility_confirmation' and row.evidence_state = 'no_active_spn_evidence' then 'История действий не подтверждает активного СПН; ответственность нужно уточнить вручную.' end
        ]::text[], null)),
        'owner_decision_required', true,
        'selection_available', false,
        'mutation_available', false,
        'card_url', format('./deal-card-v2.html?id=%s', row.id)
      ) order by row.review_order)
      from selected row where row.review_order <= v_limit
    ), '[]'::jsonb),
    (select jsonb_build_object(
      'deals_in_scope', metrics.deals_in_scope,
      'shortlist_count', (select count(*)::integer from selected row where row.review_order <= v_limit),
      'quick_result_candidates', metrics.quick_result_candidates,
      'responsibility_candidates', metrics.responsibility_candidates,
      'document_workflow_candidates', metrics.document_workflow_candidates,
      'duplicate_groups', metrics.duplicate_groups,
      'selection_available', false,
      'mutation_available', false
    ) from metrics)
  into v_items, v_summary;

  return jsonb_build_object(
    'pilot_version', 1,
    'generated_at', now(),
    'period_days', v_days,
    'preview_only', true,
    'selection_available', false,
    'mutation_available', false,
    'ranking_is_not_employee_rating', true,
    'summary', coalesce(v_summary, '{}'::jsonb),
    'lanes', jsonb_build_array(
      jsonb_build_object('code', 'quick_result', 'label', 'Быстрый пилотный цикл', 'goal', 'Получить один подтверждённый результат за короткий цикл.'),
      jsonb_build_object('code', 'responsibility_confirmation', 'label', 'Подтверждение ответственности', 'goal', 'Подтвердить фактического СПН, сторону и менеджерскую связь.'),
      jsonb_build_object('code', 'document_workflow', 'label', 'Документный рабочий цикл', 'goal', 'Проверить назначение, срок, подтверждение и следующий шаг документа.')
    ),
    'items', v_items,
    'methodology_note', 'Shortlist формируется по трём различным рабочим сценариям. Вероятные дубли не занимают несколько мест; backlog и блокировки показываются явно и не скрываются итоговым баллом.',
    'decision_note', 'Это предложения для ручного выбора владельца. Shortlist не назначает сотрудников, не меняет статусы и не включает сделку в пилот автоматически.'
  );
end;
$function$;

revoke all on function nav_v2_private.nav_v2_get_operational_pilot_shortlist_unchecked_20260714(integer, integer) from public;
revoke execute on function nav_v2_private.nav_v2_get_operational_pilot_shortlist_unchecked_20260714(integer, integer) from anon, authenticated;
grant execute on function nav_v2_private.nav_v2_get_operational_pilot_shortlist_unchecked_20260714(integer, integer) to service_role;

comment on function nav_v2_private.nav_v2_get_operational_pilot_shortlist_unchecked_20260714(integer, integer) is
  'Private read-only three-lane operational pilot shortlist; excludes demo deals, avoids duplicate slots and never mutates or auto-selects deals.';

create or replace function public.nav_v2_get_operational_adoption_report(
  p_days integer default 30,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_report jsonb;
  v_comparison jsonb;
  v_manager_proposal jsonb;
  v_remediation_plan jsonb;
  v_responsibility_evidence jsonb;
  v_confirmation_context jsonb;
  v_pilot_shortlist jsonb;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.nav_user_profiles profile
    where profile.id = v_uid and profile.is_active is true
      and profile.role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role, 'manager'::public.nav_v2_user_role)
  ) then
    raise exception 'Отчёт внедрения доступен владельцу, администратору и менеджеру' using errcode = '42501';
  end if;

  v_report := nav_v2_private.nav_v2_get_operational_adoption_report_unchecked_20260713(p_days, p_limit);
  v_comparison := nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(p_days);
  v_manager_proposal := nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(p_limit);
  v_remediation_plan := nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(p_limit);
  v_responsibility_evidence := nav_v2_private.nav_v2_get_responsibility_evidence_unchecked_20260713(p_limit);
  v_confirmation_context := nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(p_limit);
  v_pilot_shortlist := nav_v2_private.nav_v2_get_operational_pilot_shortlist_unchecked_20260714(p_days, 3);

  return v_report || jsonb_build_object(
    'report_version', 7,
    'comparison', v_comparison,
    'manager_assignment_proposal', v_manager_proposal,
    'manager_source_remediation_plan', v_remediation_plan,
    'responsibility_evidence', v_responsibility_evidence,
    'responsibility_confirmation_context', v_confirmation_context,
    'operational_pilot_shortlist', v_pilot_shortlist
  );
end;
$function$;

revoke all on function public.nav_v2_get_operational_adoption_report(integer, integer) from public;
revoke execute on function public.nav_v2_get_operational_adoption_report(integer, integer) from anon;
grant execute on function public.nav_v2_get_operational_adoption_report(integer, integer) to authenticated, service_role;

comment on function public.nav_v2_get_operational_adoption_report(integer, integer) is
  'Role-gated read-only adoption report with comparison, responsibility remediation and three-lane operational pilot shortlist.';

do $assertions$
declare
  v_wrapper_definition text;
  v_private_definition text;
  v_public_execute boolean;
  v_anon_execute boolean;
  v_authenticated_execute boolean;
  v_private_public_execute boolean;
  v_private_anon_execute boolean;
  v_private_authenticated_execute boolean;
  v_private_service_execute boolean;
begin
  select pg_get_functiondef('public.nav_v2_get_operational_adoption_report(integer, integer)'::regprocedure) into v_wrapper_definition;
  select pg_get_functiondef('nav_v2_private.nav_v2_get_operational_pilot_shortlist_unchecked_20260714(integer, integer)'::regprocedure) into v_private_definition;

  if position('nav_v2_get_operational_pilot_shortlist_unchecked_20260714' in v_wrapper_definition) = 0
    or position('operational_pilot_shortlist' in v_wrapper_definition) = 0
    or position('report_version' in v_wrapper_definition) = 0
    or position('7' in v_wrapper_definition) = 0 then
    raise exception 'Operational pilot shortlist wrapper definition drifted';
  end if;

  if position('quick_result' in v_private_definition) = 0
    or position('responsibility_confirmation' in v_private_definition) = 0
    or position('document_workflow' in v_private_definition) = 0
    or position('duplicate_group_size' in v_private_definition) = 0
    or position('mutation_available' in v_private_definition) = 0 then
    raise exception 'Operational pilot shortlist implementation drifted';
  end if;

  select has_function_privilege('public', 'public.nav_v2_get_operational_adoption_report(integer, integer)', 'EXECUTE') into v_public_execute;
  select has_function_privilege('anon', 'public.nav_v2_get_operational_adoption_report(integer, integer)', 'EXECUTE') into v_anon_execute;
  select has_function_privilege('authenticated', 'public.nav_v2_get_operational_adoption_report(integer, integer)', 'EXECUTE') into v_authenticated_execute;
  select has_function_privilege('public', 'nav_v2_private.nav_v2_get_operational_pilot_shortlist_unchecked_20260714(integer, integer)', 'EXECUTE') into v_private_public_execute;
  select has_function_privilege('anon', 'nav_v2_private.nav_v2_get_operational_pilot_shortlist_unchecked_20260714(integer, integer)', 'EXECUTE') into v_private_anon_execute;
  select has_function_privilege('authenticated', 'nav_v2_private.nav_v2_get_operational_pilot_shortlist_unchecked_20260714(integer, integer)', 'EXECUTE') into v_private_authenticated_execute;
  select has_function_privilege('service_role', 'nav_v2_private.nav_v2_get_operational_pilot_shortlist_unchecked_20260714(integer, integer)', 'EXECUTE') into v_private_service_execute;

  if v_public_execute or v_anon_execute or not v_authenticated_execute then
    raise exception 'Operational adoption wrapper grants drifted after pilot shortlist';
  end if;

  if v_private_public_execute or v_private_anon_execute or v_private_authenticated_execute or not v_private_service_execute then
    raise exception 'Operational pilot shortlist implementation must remain private';
  end if;
end
$assertions$;

notify pgrst, 'reload schema';
