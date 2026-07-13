create or replace function nav_v2_private.nav_v2_get_responsibility_evidence_unchecked_20260713(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
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
    raise exception 'Источники ответственности доступны владельцу, администратору и менеджеру' using errcode = '42501';
  end if;

  with scoped_deals as (
    select deal.*
    from public.nav_deals_v2 deal
    where not (
      coalesce((deal.deal_summary ->> 'demo') = 'true', false)
      or coalesce((deal.wizard_snapshot ->> 'demo') = 'true', false)
      or coalesce(deal.title, '') like 'ДЕМО:%'
    )
      and (
        v_role in ('owner', 'admin')
        or deal.created_by = v_uid
        or deal.manager_id = v_uid
        or deal.seller_spn_id = v_uid
        or deal.buyer_spn_id = v_uid
        or exists (
          select 1
          from public.nav_deal_participants_v2 participant
          where participant.deal_id = deal.id
            and participant.user_id = v_uid
        )
        or exists (
          select 1
          from public.nav_user_profiles spn
          where spn.id in (deal.seller_spn_id, deal.buyer_spn_id)
            and spn.manager_id = v_uid
            and spn.is_active is true
        )
      )
  ),
  active_spn as (
    select
      profile.id,
      profile.full_name,
      profile.manager_id,
      manager.full_name as manager_name
    from public.nav_user_profiles profile
    left join public.nav_user_profiles manager on manager.id = profile.manager_id
    where profile.is_active is true
      and profile.role = 'spn'
  ),
  signals as (
    select
      deal.id as deal_id,
      deal.created_by as candidate_id,
      'deal_creator'::text as signal_type,
      1::integer as signal_count,
      deal.created_at as last_signal_at
    from scoped_deals deal
    where deal.created_by is not null

    union all

    select
      participant.deal_id,
      participant.user_id,
      'participant'::text,
      count(*)::integer,
      max(participant.created_at)
    from public.nav_deal_participants_v2 participant
    join scoped_deals deal on deal.id = participant.deal_id
    where participant.user_id is not null
    group by participant.deal_id, participant.user_id

    union all

    select
      event.deal_id,
      event.actor_id,
      'event_actor'::text,
      count(*)::integer,
      max(event.created_at)
    from public.nav_deal_events_v2 event
    join scoped_deals deal on deal.id = event.deal_id
    where event.actor_id is not null
    group by event.deal_id, event.actor_id

    union all

    select
      task.deal_id,
      task.created_by,
      'task_creator'::text,
      count(*)::integer,
      max(task.created_at)
    from public.nav_deal_tasks_v2 task
    join scoped_deals deal on deal.id = task.deal_id
    where task.created_by is not null
    group by task.deal_id, task.created_by

    union all

    select
      task.deal_id,
      task.assigned_to,
      'task_assignee'::text,
      count(*)::integer,
      max(task.updated_at)
    from public.nav_deal_tasks_v2 task
    join scoped_deals deal on deal.id = task.deal_id
    where task.assigned_to is not null
    group by task.deal_id, task.assigned_to

    union all

    select
      task.deal_id,
      task.completed_by,
      'task_completer'::text,
      count(*)::integer,
      max(task.completed_at)
    from public.nav_deal_tasks_v2 task
    join scoped_deals deal on deal.id = task.deal_id
    where task.completed_by is not null
    group by task.deal_id, task.completed_by

    union all

    select
      document.deal_id,
      document.assigned_to,
      'document_assignee'::text,
      count(*)::integer,
      max(document.updated_at)
    from public.nav_deal_documents_v2 document
    join scoped_deals deal on deal.id = document.deal_id
    where document.assigned_to is not null
    group by document.deal_id, document.assigned_to

    union all

    select
      document.deal_id,
      document.checked_by,
      'document_checker'::text,
      count(*)::integer,
      max(document.checked_at)
    from public.nav_deal_documents_v2 document
    join scoped_deals deal on deal.id = document.deal_id
    where document.checked_by is not null
    group by document.deal_id, document.checked_by
  ),
  candidate_evidence as (
    select
      signal.deal_id,
      signal.candidate_id,
      spn.full_name as candidate_name,
      spn.manager_id,
      spn.manager_name,
      count(distinct signal.signal_type)::integer as independent_signal_types,
      sum(signal.signal_count)::integer as total_signal_count,
      max(signal.last_signal_at) as last_signal_at,
      jsonb_object_agg(
        signal.signal_type,
        jsonb_build_object(
          'count', signal.signal_count,
          'last_at', signal.last_signal_at
        )
        order by signal.signal_type
      ) as signal_breakdown
    from signals signal
    join active_spn spn on spn.id = signal.candidate_id
    group by
      signal.deal_id,
      signal.candidate_id,
      spn.full_name,
      spn.manager_id,
      spn.manager_name
  ),
  candidate_rollup as (
    select
      evidence.deal_id,
      count(*)::integer as candidate_count,
      max(evidence.independent_signal_types)::integer as strongest_signal_types,
      jsonb_agg(
        jsonb_build_object(
          'candidate_id', evidence.candidate_id,
          'candidate_name', evidence.candidate_name,
          'manager_id', evidence.manager_id,
          'manager_name', evidence.manager_name,
          'manager_link_status', case when evidence.manager_id is null then 'missing' else 'present' end,
          'independent_signal_types', evidence.independent_signal_types,
          'total_signal_count', evidence.total_signal_count,
          'last_signal_at', evidence.last_signal_at,
          'signal_breakdown', evidence.signal_breakdown,
          'selection_available', false,
          'mutation_available', false
        )
        order by
          evidence.independent_signal_types desc,
          evidence.total_signal_count desc,
          evidence.candidate_name
      ) as candidates
    from candidate_evidence evidence
    group by evidence.deal_id
  ),
  deal_rows as (
    select
      deal.id as deal_id,
      coalesce(nullif(deal.title, ''), nullif(deal.address, ''), 'Сделка без названия') as deal_title,
      deal.address,
      deal.status as deal_status,
      deal.created_at,
      deal.seller_spn_id,
      seller.full_name as seller_spn_name,
      seller.role::text as seller_profile_role,
      deal.buyer_spn_id,
      buyer.full_name as buyer_spn_name,
      buyer.role::text as buyer_profile_role,
      coalesce(rollup.candidate_count, 0)::integer as candidate_count,
      coalesce(rollup.strongest_signal_types, 0)::integer as strongest_signal_types,
      coalesce(rollup.candidates, '[]'::jsonb) as candidates,
      case
        when coalesce(rollup.candidate_count, 0) = 0 then 'no_active_spn_evidence'
        when rollup.candidate_count = 1 and rollup.strongest_signal_types >= 3 then 'strong_single_evidence'
        when rollup.candidate_count = 1 then 'weak_single_evidence'
        else 'multiple_candidates'
      end as evidence_state,
      case
        when coalesce(rollup.candidate_count, 0) = 0 then 'Активный СПН по истории действий не найден'
        when rollup.candidate_count = 1 and rollup.strongest_signal_types >= 3 then 'Один активный СПН подтверждается несколькими независимыми типами действий'
        when rollup.candidate_count = 1 then 'Найден один активный СПН, но подтверждений недостаточно'
        else 'История действий указывает на нескольких активных СПН'
      end as evidence_state_label,
      case
        when coalesce(rollup.candidate_count, 0) = 0 then 'Уточнить фактического СПН у владельца сделки; не назначать по косвенным данным.'
        when rollup.candidate_count = 1 and rollup.strongest_signal_types >= 3 then 'Сверить кандидата с владельцем и карточкой сделки; доказательства не являются назначением.'
        when rollup.candidate_count = 1 then 'Запросить дополнительное подтверждение до изменения поля СПН.'
        else 'Разобрать роли кандидатов вручную и подтвердить сторону каждого СПН.'
      end as safe_action,
      false as selection_available,
      false as mutation_available,
      format('./deal-card-v2.html?id=%s', deal.id) as card_url
    from scoped_deals deal
    left join public.nav_user_profiles seller on seller.id = deal.seller_spn_id
    left join public.nav_user_profiles buyer on buyer.id = deal.buyer_spn_id
    left join candidate_rollup rollup on rollup.deal_id = deal.id
  ),
  limited as (
    select *
    from deal_rows
    order by
      case evidence_state
        when 'strong_single_evidence' then 1
        when 'multiple_candidates' then 2
        when 'weak_single_evidence' then 3
        else 4
      end,
      deal_title,
      deal_id
    limit v_limit
  )
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'deal_id', row.deal_id,
            'deal_title', row.deal_title,
            'address', row.address,
            'deal_status', row.deal_status,
            'created_at', row.created_at,
            'seller_spn_id', row.seller_spn_id,
            'seller_spn_name', row.seller_spn_name,
            'seller_profile_role', row.seller_profile_role,
            'buyer_spn_id', row.buyer_spn_id,
            'buyer_spn_name', row.buyer_spn_name,
            'buyer_profile_role', row.buyer_profile_role,
            'candidate_count', row.candidate_count,
            'strongest_signal_types', row.strongest_signal_types,
            'candidates', row.candidates,
            'evidence_state', row.evidence_state,
            'evidence_state_label', row.evidence_state_label,
            'safe_action', row.safe_action,
            'selection_available', row.selection_available,
            'mutation_available', row.mutation_available,
            'card_url', row.card_url
          )
          order by
            case row.evidence_state
              when 'strong_single_evidence' then 1
              when 'multiple_candidates' then 2
              when 'weak_single_evidence' then 3
              else 4
            end,
            row.deal_title,
            row.deal_id
        )
        from limited row
      ),
      '[]'::jsonb
    ),
    jsonb_build_object(
      'deals_in_scope', (select count(*) from deal_rows),
      'with_any_active_spn_evidence', (select count(*) from deal_rows where candidate_count > 0),
      'strong_single_evidence', (select count(*) from deal_rows where evidence_state = 'strong_single_evidence'),
      'weak_single_evidence', (select count(*) from deal_rows where evidence_state = 'weak_single_evidence'),
      'multiple_candidates', (select count(*) from deal_rows where evidence_state = 'multiple_candidates'),
      'no_active_spn_evidence', (select count(*) from deal_rows where evidence_state = 'no_active_spn_evidence'),
      'selection_available', false,
      'mutation_available', false
    )
  into v_items, v_summary;

  return jsonb_build_object(
    'evidence_version', 1,
    'generated_at', now(),
    'preview_only', true,
    'selection_available', false,
    'mutation_available', false,
    'summary', v_summary,
    'items', v_items,
    'signal_definitions', jsonb_build_array(
      jsonb_build_object('code', 'deal_creator', 'label', 'Создал сделку'),
      jsonb_build_object('code', 'participant', 'label', 'Участник сделки'),
      jsonb_build_object('code', 'event_actor', 'label', 'Автор событий'),
      jsonb_build_object('code', 'task_creator', 'label', 'Создавал задачи'),
      jsonb_build_object('code', 'task_assignee', 'label', 'Исполнитель задач'),
      jsonb_build_object('code', 'task_completer', 'label', 'Завершал задачи'),
      jsonb_build_object('code', 'document_assignee', 'label', 'Ответственный за документы'),
      jsonb_build_object('code', 'document_checker', 'label', 'Проверял документы')
    ),
    'decision_note', 'История действий показывает подтверждающие сигналы, но не определяет сторону сделки и не назначает СПН или менеджера.'
  );
end;
$function$;

revoke all on function nav_v2_private.nav_v2_get_responsibility_evidence_unchecked_20260713(integer) from public;
revoke execute on function nav_v2_private.nav_v2_get_responsibility_evidence_unchecked_20260713(integer) from anon, authenticated;
grant execute on function nav_v2_private.nav_v2_get_responsibility_evidence_unchecked_20260713(integer) to service_role;

comment on function nav_v2_private.nav_v2_get_responsibility_evidence_unchecked_20260713(integer) is
  'Private read-only evidence aggregation for active SPN involvement; never selects or mutates responsibility assignments.';

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
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.nav_user_profiles profile
    where profile.id = v_uid
      and profile.is_active is true
      and profile.role in (
        'owner'::public.nav_v2_user_role,
        'admin'::public.nav_v2_user_role,
        'manager'::public.nav_v2_user_role
      )
  ) then
    raise exception 'Отчёт внедрения доступен владельцу, администратору и менеджеру' using errcode = '42501';
  end if;

  v_report := nav_v2_private.nav_v2_get_operational_adoption_report_unchecked_20260713(p_days, p_limit);
  v_comparison := nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(p_days);
  v_manager_proposal := nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(p_limit);
  v_remediation_plan := nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(p_limit);
  v_responsibility_evidence := nav_v2_private.nav_v2_get_responsibility_evidence_unchecked_20260713(p_limit);

  return v_report || jsonb_build_object(
    'report_version', 5,
    'comparison', v_comparison,
    'manager_assignment_proposal', v_manager_proposal,
    'manager_source_remediation_plan', v_remediation_plan,
    'responsibility_evidence', v_responsibility_evidence
  );
end;
$function$;

revoke all on function public.nav_v2_get_operational_adoption_report(integer, integer) from public;
revoke execute on function public.nav_v2_get_operational_adoption_report(integer, integer) from anon;
grant execute on function public.nav_v2_get_operational_adoption_report(integer, integer) to authenticated, service_role;

comment on function public.nav_v2_get_operational_adoption_report(integer, integer) is
  'Role-gated read-only adoption report with exact period comparison, manager proposal, grouped remediation plan and responsibility evidence.';

do $assertions$
declare
  v_wrapper_definition text;
  v_private_definition text;
  v_public_execute boolean;
  v_anon_execute boolean;
  v_authenticated_execute boolean;
  v_private_authenticated_execute boolean;
begin
  select pg_get_functiondef('public.nav_v2_get_operational_adoption_report(integer, integer)'::regprocedure)
  into v_wrapper_definition;

  select pg_get_functiondef(
    'nav_v2_private.nav_v2_get_responsibility_evidence_unchecked_20260713(integer)'::regprocedure
  ) into v_private_definition;

  if position('nav_v2_get_responsibility_evidence_unchecked_20260713' in v_wrapper_definition) = 0
    or position('responsibility_evidence' in v_wrapper_definition) = 0
    or position('report_version' in v_wrapper_definition) = 0 then
    raise exception 'Operational adoption responsibility evidence wrapper definition drifted';
  end if;

  if position('deal_creator' in v_private_definition) = 0
    or position('participant' in v_private_definition) = 0
    or position('event_actor' in v_private_definition) = 0
    or position('task_creator' in v_private_definition) = 0
    or position('document_checker' in v_private_definition) = 0
    or position('selection_available' in v_private_definition) = 0
    or position('mutation_available' in v_private_definition) = 0 then
    raise exception 'Responsibility evidence implementation drifted';
  end if;

  select has_function_privilege('public', 'public.nav_v2_get_operational_adoption_report(integer, integer)', 'EXECUTE')
  into v_public_execute;
  select has_function_privilege('anon', 'public.nav_v2_get_operational_adoption_report(integer, integer)', 'EXECUTE')
  into v_anon_execute;
  select has_function_privilege('authenticated', 'public.nav_v2_get_operational_adoption_report(integer, integer)', 'EXECUTE')
  into v_authenticated_execute;
  select has_function_privilege(
    'authenticated',
    'nav_v2_private.nav_v2_get_responsibility_evidence_unchecked_20260713(integer)',
    'EXECUTE'
  ) into v_private_authenticated_execute;

  if v_public_execute or v_anon_execute or not v_authenticated_execute then
    raise exception 'Operational adoption responsibility evidence wrapper grants drifted';
  end if;

  if v_private_authenticated_execute then
    raise exception 'Responsibility evidence implementation must remain private';
  end if;
end
$assertions$;

notify pgrst, 'reload schema';
