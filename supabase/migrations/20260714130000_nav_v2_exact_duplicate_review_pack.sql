create or replace function nav_v2_private.nav_v2_get_exact_duplicate_review_pack_unchecked_20260714(
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
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
    raise exception 'Разбор дублей доступен владельцу, администратору и менеджеру' using errcode = '42501';
  end if;

  return (
    with duplicate_candidates as (
      select
        deal.created_by,
        md5(deal.wizard_snapshot::text) as group_key,
        count(*)::integer as deal_count,
        min(deal.created_at) as first_created_at,
        max(deal.created_at) as last_created_at
      from public.nav_deals_v2 deal
      where deal.wizard_snapshot is not null
        and coalesce(deal.title, '') not ilike 'ДЕМО:%'
      group by deal.created_by, md5(deal.wizard_snapshot::text)
      having count(*) > 1
    ),
    duplicate_groups as (
      select candidate.*
      from duplicate_candidates candidate
      order by candidate.first_created_at, candidate.group_key
      limit v_limit
    ),
    deal_rows as (
      select
        group_row.group_key,
        group_row.created_by,
        creator.full_name as created_by_name,
        group_row.deal_count,
        group_row.first_created_at,
        group_row.last_created_at,
        deal.id,
        deal.title,
        deal.address,
        deal.status::text as status,
        deal.risk_level::text as risk_level,
        deal.readiness_deposit,
        deal.readiness_deal,
        deal.created_at,
        deal.updated_at,
        deal.next_action,
        deal.manager_id,
        manager.full_name as manager_name,
        deal.seller_spn_id,
        seller.full_name as seller_spn_name,
        deal.buyer_spn_id,
        buyer.full_name as buyer_spn_name,
        deal.lawyer_id,
        lawyer.full_name as lawyer_name,
        deal.broker_id,
        broker.full_name as broker_name,
        md5((to_jsonb(deal) - array['id','created_at','updated_at','wizard_snapshot'])::text) as deal_hash,
        task_stats.row_count as task_count,
        task_stats.latest_at as task_latest_at,
        task_stats.semantic_hash as task_hash,
        task_stats.completed_count as completed_tasks,
        risk_stats.row_count as risk_count,
        risk_stats.latest_at as risk_latest_at,
        risk_stats.semantic_hash as risk_hash,
        risk_stats.resolved_count as resolved_risks,
        document_stats.row_count as document_count,
        document_stats.latest_at as document_latest_at,
        document_stats.semantic_hash as document_hash,
        document_stats.resolved_count as resolved_documents,
        event_stats.row_count as event_count,
        event_stats.latest_at as event_latest_at,
        event_stats.semantic_hash as event_hash,
        comment_stats.row_count as comment_count,
        comment_stats.latest_at as comment_latest_at,
        comment_stats.semantic_hash as comment_hash,
        review_stats.row_count as review_count,
        review_stats.latest_at as review_latest_at,
        review_stats.semantic_hash as review_hash,
        participant_stats.row_count as participant_count,
        participant_stats.latest_at as participant_latest_at,
        participant_stats.semantic_hash as participant_hash,
        expense_stats.row_count as expense_count,
        expense_stats.latest_at as expense_latest_at,
        expense_stats.semantic_hash as expense_hash,
        greatest(
          deal.updated_at,
          coalesce(task_stats.latest_at, deal.updated_at),
          coalesce(risk_stats.latest_at, deal.updated_at),
          coalesce(document_stats.latest_at, deal.updated_at),
          coalesce(event_stats.latest_at, deal.updated_at),
          coalesce(comment_stats.latest_at, deal.updated_at),
          coalesce(review_stats.latest_at, deal.updated_at),
          coalesce(participant_stats.latest_at, deal.updated_at),
          coalesce(expense_stats.latest_at, deal.updated_at)
        ) as latest_activity_at
      from duplicate_groups group_row
      join public.nav_deals_v2 deal
        on deal.created_by = group_row.created_by
       and md5(deal.wizard_snapshot::text) = group_row.group_key
       and coalesce(deal.title, '') not ilike 'ДЕМО:%'
      left join public.nav_user_profiles creator on creator.id = deal.created_by
      left join public.nav_user_profiles manager on manager.id = deal.manager_id
      left join public.nav_user_profiles seller on seller.id = deal.seller_spn_id
      left join public.nav_user_profiles buyer on buyer.id = deal.buyer_spn_id
      left join public.nav_user_profiles lawyer on lawyer.id = deal.lawyer_id
      left join public.nav_user_profiles broker on broker.id = deal.broker_id
      left join lateral (
        select
          count(*)::integer as row_count,
          max(task.updated_at) as latest_at,
          count(*) filter (where task.status::text = 'done')::integer as completed_count,
          md5(coalesce((
            select jsonb_agg(normalized.row_value order by normalized.row_value::text)
            from (
              select to_jsonb(item) - array['id','deal_id','created_at','updated_at'] as row_value
              from public.nav_deal_tasks_v2 item
              where item.deal_id = deal.id
            ) normalized
          ), '[]'::jsonb)::text) as semantic_hash
        from public.nav_deal_tasks_v2 task
        where task.deal_id = deal.id
      ) task_stats on true
      left join lateral (
        select
          count(*)::integer as row_count,
          max(risk.updated_at) as latest_at,
          count(*) filter (where risk.is_resolved is true)::integer as resolved_count,
          md5(coalesce((
            select jsonb_agg(normalized.row_value order by normalized.row_value::text)
            from (
              select to_jsonb(item) - array['id','deal_id','created_at','updated_at'] as row_value
              from public.nav_deal_risks_v2 item
              where item.deal_id = deal.id
            ) normalized
          ), '[]'::jsonb)::text) as semantic_hash
        from public.nav_deal_risks_v2 risk
        where risk.deal_id = deal.id
      ) risk_stats on true
      left join lateral (
        select
          count(*)::integer as row_count,
          max(document.updated_at) as latest_at,
          count(*) filter (where document.status in ('checked', 'not_required'))::integer as resolved_count,
          md5(coalesce((
            select jsonb_agg(normalized.row_value order by normalized.row_value::text)
            from (
              select to_jsonb(item) - array['id','deal_id','created_at','updated_at','requested_at'] as row_value
              from public.nav_deal_documents_v2 item
              where item.deal_id = deal.id
            ) normalized
          ), '[]'::jsonb)::text) as semantic_hash
        from public.nav_deal_documents_v2 document
        where document.deal_id = deal.id
      ) document_stats on true
      left join lateral (
        select
          count(*)::integer as row_count,
          max(event.created_at) as latest_at,
          md5(coalesce((
            select jsonb_agg(normalized.row_value order by normalized.row_value::text)
            from (
              select jsonb_build_object(
                'actor_id', item.actor_id,
                'event_type', item.event_type,
                'event_title', item.event_title,
                'event_data', coalesce(item.event_data, '{}'::jsonb)
                  - array['deal_id','task_id','document_id','risk_id','review_id']
              ) as row_value
              from public.nav_deal_events_v2 item
              where item.deal_id = deal.id
            ) normalized
          ), '[]'::jsonb)::text) as semantic_hash
        from public.nav_deal_events_v2 event
        where event.deal_id = deal.id
      ) event_stats on true
      left join lateral (
        select
          count(*)::integer as row_count,
          max(comment.created_at) as latest_at,
          md5(coalesce((
            select jsonb_agg(normalized.row_value order by normalized.row_value::text)
            from (
              select to_jsonb(item) - array['id','deal_id','created_at'] as row_value
              from public.nav_deal_comments_v2 item
              where item.deal_id = deal.id
            ) normalized
          ), '[]'::jsonb)::text) as semantic_hash
        from public.nav_deal_comments_v2 comment
        where comment.deal_id = deal.id
      ) comment_stats on true
      left join lateral (
        select
          count(*)::integer as row_count,
          max(review.created_at) as latest_at,
          md5(coalesce((
            select jsonb_agg(normalized.row_value order by normalized.row_value::text)
            from (
              select to_jsonb(item) - array['id','deal_id','created_at'] as row_value
              from public.nav_deal_reviews_v2 item
              where item.deal_id = deal.id
            ) normalized
          ), '[]'::jsonb)::text) as semantic_hash
        from public.nav_deal_reviews_v2 review
        where review.deal_id = deal.id
      ) review_stats on true
      left join lateral (
        select
          count(*)::integer as row_count,
          max(participant.created_at) as latest_at,
          md5(coalesce((
            select jsonb_agg(normalized.row_value order by normalized.row_value::text)
            from (
              select to_jsonb(item) - array['id','deal_id','created_at'] as row_value
              from public.nav_deal_participants_v2 item
              where item.deal_id = deal.id
            ) normalized
          ), '[]'::jsonb)::text) as semantic_hash
        from public.nav_deal_participants_v2 participant
        where participant.deal_id = deal.id
      ) participant_stats on true
      left join lateral (
        select
          count(*)::integer as row_count,
          max(expense.created_at) as latest_at,
          md5(coalesce((
            select jsonb_agg(normalized.row_value order by normalized.row_value::text)
            from (
              select to_jsonb(item) - array['id','deal_id','created_at'] as row_value
              from public.nav_deal_expenses_v2 item
              where item.deal_id = deal.id
            ) normalized
          ), '[]'::jsonb)::text) as semantic_hash
        from public.nav_deal_expenses_v2 expense
        where expense.deal_id = deal.id
      ) expense_stats on true
    ),
    group_rows as (
      select
        row.group_key,
        row.created_by,
        row.created_by_name,
        max(row.deal_count) as deal_count,
        min(row.first_created_at) as first_created_at,
        max(row.last_created_at) as last_created_at,
        extract(epoch from max(row.last_created_at) - min(row.first_created_at)) as interval_seconds,
        (array_agg(row.id order by row.created_at, row.id))[1] as suggested_canonical_deal_id,
        count(distinct row.deal_hash) = 1 as deal_equal,
        count(distinct row.task_hash) = 1 as tasks_equal,
        count(distinct row.risk_hash) = 1 as risks_equal,
        count(distinct row.document_hash) = 1 as documents_equal,
        count(distinct row.event_hash) = 1 as events_equal,
        count(distinct row.comment_hash) = 1 as comments_equal,
        count(distinct row.review_hash) = 1 as reviews_equal,
        count(distinct row.participant_hash) = 1 as participants_equal,
        count(distinct row.expense_hash) = 1 as expenses_equal,
        sum(row.comment_count + row.review_count)::integer as comments_and_reviews,
        jsonb_agg(jsonb_build_object(
          'deal_id', row.id,
          'deal_title', row.title,
          'address', row.address,
          'status', row.status,
          'risk_level', row.risk_level,
          'readiness_deposit', row.readiness_deposit,
          'readiness_deal', row.readiness_deal,
          'created_at', row.created_at,
          'updated_at', row.updated_at,
          'latest_activity_at', row.latest_activity_at,
          'next_action', row.next_action,
          'created_by', row.created_by,
          'created_by_name', row.created_by_name,
          'manager_id', row.manager_id,
          'manager_name', row.manager_name,
          'seller_spn_id', row.seller_spn_id,
          'seller_spn_name', row.seller_spn_name,
          'buyer_spn_id', row.buyer_spn_id,
          'buyer_spn_name', row.buyer_spn_name,
          'lawyer_id', row.lawyer_id,
          'lawyer_name', row.lawyer_name,
          'broker_id', row.broker_id,
          'broker_name', row.broker_name,
          'counts', jsonb_build_object(
            'tasks', row.task_count,
            'completed_tasks', row.completed_tasks,
            'risks', row.risk_count,
            'resolved_risks', row.resolved_risks,
            'documents', row.document_count,
            'resolved_documents', row.resolved_documents,
            'events', row.event_count,
            'comments', row.comment_count,
            'reviews', row.review_count,
            'participants', row.participant_count,
            'expenses', row.expense_count
          ),
          'latest', jsonb_build_object(
            'tasks', row.task_latest_at,
            'risks', row.risk_latest_at,
            'documents', row.document_latest_at,
            'events', row.event_latest_at,
            'comments', row.comment_latest_at,
            'reviews', row.review_latest_at,
            'participants', row.participant_latest_at,
            'expenses', row.expense_latest_at
          ),
          'semantic_hashes', jsonb_build_object(
            'deal', row.deal_hash,
            'tasks', row.task_hash,
            'risks', row.risk_hash,
            'documents', row.document_hash,
            'events', row.event_hash,
            'comments', row.comment_hash,
            'reviews', row.review_hash,
            'participants', row.participant_hash,
            'expenses', row.expense_hash
          ),
          'card_url', './deal-card-v2.html?id=' || row.id::text
        ) order by row.created_at, row.id) as deals
      from deal_rows row
      group by row.group_key, row.created_by, row.created_by_name
    ),
    final_rows as (
      select
        grouped.*,
        grouped.deal_equal
          and grouped.tasks_equal
          and grouped.risks_equal
          and grouped.documents_equal
          and grouped.events_equal
          and grouped.comments_equal
          and grouped.reviews_equal
          and grouped.participants_equal
          and grouped.expenses_equal as all_semantic_equal
      from group_rows grouped
    )
    select jsonb_build_object(
      'review_version', 1,
      'generated_at', now(),
      'summary', jsonb_build_object(
        'groups', count(*),
        'deals', coalesce(sum(final.deal_count), 0),
        'exact_semantic_groups', count(*) filter (where final.all_semantic_equal),
        'diverged_groups', count(*) filter (where not final.all_semantic_equal),
        'groups_with_comments_or_reviews', count(*) filter (where final.comments_and_reviews > 0),
        'selection_available', false,
        'mutation_available', false,
        'cleanup_execution_available', false,
        'owner_decision_required', true
      ),
      'items', coalesce(jsonb_agg(jsonb_build_object(
        'group_key', final.group_key,
        'created_by', final.created_by,
        'created_by_name', final.created_by_name,
        'deal_count', final.deal_count,
        'first_created_at', final.first_created_at,
        'last_created_at', final.last_created_at,
        'interval_seconds', final.interval_seconds,
        'suggested_canonical_deal_id', final.suggested_canonical_deal_id,
        'suggestion_basis', 'earliest_created_only',
        'suggestion_confidence', case when final.all_semantic_equal then 'medium' else 'low' end,
        'all_semantic_equal', final.all_semantic_equal,
        'has_post_creation_divergence', not final.all_semantic_equal,
        'entity_comparison', jsonb_build_object(
          'deal', final.deal_equal,
          'tasks', final.tasks_equal,
          'risks', final.risks_equal,
          'documents', final.documents_equal,
          'events', final.events_equal,
          'comments', final.comments_equal,
          'reviews', final.reviews_equal,
          'participants', final.participants_equal,
          'expenses', final.expenses_equal
        ),
        'comments_and_reviews', final.comments_and_reviews,
        'manual_review_reasons', to_jsonb(array_remove(array[
          case when final.all_semantic_equal
            then 'Текущие карточки и дочерние сущности семантически совпадают.'
            else 'После создания карточки разошлись; нужен перенос уникальных данных.' end,
          case when not final.deal_equal then 'Различаются поля основной карточки.' end,
          case when not final.tasks_equal then 'Различаются задачи.' end,
          case when not final.risks_equal then 'Различаются риски.' end,
          case when not final.documents_equal then 'Различаются документы.' end,
          case when not final.events_equal then 'Различаются события.' end,
          case when not final.comments_equal then 'Различаются комментарии.' end,
          case when not final.reviews_equal then 'Различаются проверки.' end,
          case when not final.participants_equal then 'Различаются участники.' end,
          case when not final.expenses_equal then 'Различаются расходы.' end,
          'Раннейшая карточка предложена только как отправная точка; owner/admin обязан подтвердить выбор.'
        ], null)),
        'deals', final.deals,
        'selection_available', false,
        'mutation_available', false,
        'owner_decision_required', true
      ) order by final.first_created_at), '[]'::jsonb)
    )
    from final_rows final
  );
end;
$function$;

revoke all on function nav_v2_private.nav_v2_get_exact_duplicate_review_pack_unchecked_20260714(integer) from public;
revoke execute on function nav_v2_private.nav_v2_get_exact_duplicate_review_pack_unchecked_20260714(integer) from anon, authenticated;
grant execute on function nav_v2_private.nav_v2_get_exact_duplicate_review_pack_unchecked_20260714(integer) to service_role;

comment on function nav_v2_private.nav_v2_get_exact_duplicate_review_pack_unchecked_20260714(integer) is
  'Private read-only exact wizard duplicate review pack. Excludes demo seed, compares current deal and child entities, and never selects or mutates a canonical deal.';

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
  v_duplicate_review jsonb;
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
  v_confirmation_context := nav_v2_private.nav_v2_get_responsibility_confirmation_context_unchecked_20260713(p_limit);
  v_pilot_shortlist := nav_v2_private.nav_v2_get_operational_pilot_shortlist_unchecked_20260714(p_days, 3);
  v_duplicate_review := nav_v2_private.nav_v2_get_exact_duplicate_review_pack_unchecked_20260714(20);

  return v_report || jsonb_build_object(
    'report_version', 8,
    'comparison', v_comparison,
    'manager_assignment_proposal', v_manager_proposal,
    'manager_source_remediation_plan', v_remediation_plan,
    'responsibility_evidence', v_responsibility_evidence,
    'responsibility_confirmation_context', v_confirmation_context,
    'operational_pilot_shortlist', v_pilot_shortlist,
    'exact_duplicate_review_pack', v_duplicate_review
  );
end;
$function$;

revoke all on function public.nav_v2_get_operational_adoption_report(integer, integer) from public;
revoke execute on function public.nav_v2_get_operational_adoption_report(integer, integer) from anon;
grant execute on function public.nav_v2_get_operational_adoption_report(integer, integer) to authenticated, service_role;

comment on function public.nav_v2_get_operational_adoption_report(integer, integer) is
  'Role-gated read-only adoption report with comparison, responsibility remediation, pilot shortlist and exact duplicate review pack.';

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
  select pg_get_functiondef(
    'public.nav_v2_get_operational_adoption_report(integer, integer)'::regprocedure
  ) into v_wrapper_definition;

  select pg_get_functiondef(
    'nav_v2_private.nav_v2_get_exact_duplicate_review_pack_unchecked_20260714(integer)'::regprocedure
  ) into v_private_definition;

  if position('nav_v2_get_exact_duplicate_review_pack_unchecked_20260714' in v_wrapper_definition) = 0
    or position('exact_duplicate_review_pack' in v_wrapper_definition) = 0
    or position('report_version' in v_wrapper_definition) = 0
    or position('8' in v_wrapper_definition) = 0 then
    raise exception 'Operational adoption duplicate review wrapper definition drifted';
  end if;

  if position('ДЕМО:' in v_private_definition) = 0
    or position('wizard_snapshot' in v_private_definition) = 0
    or position('all_semantic_equal' in v_private_definition) = 0
    or position('suggested_canonical_deal_id' in v_private_definition) = 0
    or position('earliest_created_only' in v_private_definition) = 0
    or position('selection_available' in v_private_definition) = 0
    or position('mutation_available' in v_private_definition) = 0
    or position('owner_decision_required' in v_private_definition) = 0 then
    raise exception 'Exact duplicate review implementation drifted';
  end if;

  select has_function_privilege(
    'public',
    'public.nav_v2_get_operational_adoption_report(integer, integer)',
    'EXECUTE'
  ) into v_public_execute;
  select has_function_privilege(
    'anon',
    'public.nav_v2_get_operational_adoption_report(integer, integer)',
    'EXECUTE'
  ) into v_anon_execute;
  select has_function_privilege(
    'authenticated',
    'public.nav_v2_get_operational_adoption_report(integer, integer)',
    'EXECUTE'
  ) into v_authenticated_execute;

  select has_function_privilege(
    'public',
    'nav_v2_private.nav_v2_get_exact_duplicate_review_pack_unchecked_20260714(integer)',
    'EXECUTE'
  ) into v_private_public_execute;
  select has_function_privilege(
    'anon',
    'nav_v2_private.nav_v2_get_exact_duplicate_review_pack_unchecked_20260714(integer)',
    'EXECUTE'
  ) into v_private_anon_execute;
  select has_function_privilege(
    'authenticated',
    'nav_v2_private.nav_v2_get_exact_duplicate_review_pack_unchecked_20260714(integer)',
    'EXECUTE'
  ) into v_private_authenticated_execute;
  select has_function_privilege(
    'service_role',
    'nav_v2_private.nav_v2_get_exact_duplicate_review_pack_unchecked_20260714(integer)',
    'EXECUTE'
  ) into v_private_service_execute;

  if v_public_execute or v_anon_execute or not v_authenticated_execute then
    raise exception 'Operational adoption wrapper grants drifted after duplicate review pack';
  end if;

  if v_private_public_execute
    or v_private_anon_execute
    or v_private_authenticated_execute
    or not v_private_service_execute then
    raise exception 'Exact duplicate review implementation must remain private';
  end if;
end
$assertions$;

notify pgrst, 'reload schema';
