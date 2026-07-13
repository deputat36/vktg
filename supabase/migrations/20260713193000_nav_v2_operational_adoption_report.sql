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
  v_profile jsonb;
  v_role public.nav_v2_user_role;
  v_days integer := greatest(7, least(coalesce(p_days, 30), 90));
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_cutoff timestamptz;
  v_all_items jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  select
    jsonb_build_object(
      'id', p.id,
      'email', p.email,
      'full_name', p.full_name,
      'role', p.role
    ),
    p.role
  into v_profile, v_role
  from public.nav_user_profiles p
  where p.id = v_uid
    and p.is_active is true
  limit 1;

  if v_role not in ('owner', 'admin', 'manager') then
    raise exception 'Отчёт внедрения доступен владельцу, администратору и менеджеру' using errcode = '42501';
  end if;

  v_cutoff := now() - make_interval(days => v_days);

  with scoped_deals as (
    select d.*
    from public.nav_deals_v2 d
    where not (
      coalesce((d.deal_summary ->> 'demo') = 'true', false)
      or coalesce((d.wizard_snapshot ->> 'demo') = 'true', false)
      or coalesce(d.title, '') like 'ДЕМО:%'
    )
      and (
        v_role in ('owner', 'admin')
        or d.created_by = v_uid
        or d.manager_id = v_uid
        or d.seller_spn_id = v_uid
        or d.buyer_spn_id = v_uid
        or exists (
          select 1
          from public.nav_deal_participants_v2 participant
          where participant.deal_id = d.id
            and participant.user_id = v_uid
        )
        or exists (
          select 1
          from public.nav_user_profiles spn
          where spn.id in (d.seller_spn_id, d.buyer_spn_id)
            and spn.manager_id = v_uid
            and spn.is_active is true
        )
      )
  ), adoption as (
    select
      d.id as deal_id,
      d.title as deal_title,
      d.address,
      d.status::text as deal_status,
      d.created_at as deal_created_at,
      d.updated_at as deal_updated_at,
      d.next_action,
      d.manager_id,
      manager.full_name as manager_name,
      d.seller_spn_id,
      seller_spn.full_name as seller_spn_name,
      d.buyer_spn_id,
      buyer_spn.full_name as buyer_spn_name,
      coalesce(events.meaningful_events, 0) as meaningful_events,
      events.last_meaningful_event_at,
      events.latest_event_type,
      events.latest_event_title,
      coalesce(tasks.created_tasks, 0) as created_tasks,
      coalesce(tasks.client_actions_created, 0) as client_actions_created,
      coalesce(tasks.quality_warnings_created, 0) as quality_warnings_created,
      coalesce(tasks.completed_tasks, 0) as completed_tasks,
      coalesce(tasks.open_tasks, 0) as open_tasks,
      coalesce(tasks.overdue_tasks, 0) as overdue_tasks,
      tasks.last_task_activity_at,
      coalesce(risks.created_risks, 0) as created_risks,
      coalesce(risks.resolved_risks, 0) as resolved_risks,
      coalesce(risks.open_risks, 0) as open_risks,
      risks.last_risk_activity_at,
      coalesce(documents.created_documents, 0) as created_documents,
      coalesce(documents.resolved_documents, 0) as resolved_documents,
      coalesce(documents.overdue_required_documents, 0) as overdue_required_documents,
      documents.last_document_activity_at,
      coalesce(tasks.completed_tasks, 0)
        + coalesce(risks.resolved_risks, 0)
        + coalesce(documents.resolved_documents, 0) as confirmed_results,
      coalesce(events.meaningful_events, 0)
        + coalesce(tasks.created_tasks, 0)
        + coalesce(risks.created_risks, 0)
        + coalesce(documents.created_documents, 0) as activity_signals,
      greatest(
        d.created_at,
        events.last_meaningful_event_at,
        tasks.last_task_activity_at,
        risks.last_risk_activity_at,
        documents.last_document_activity_at
      ) as last_meaningful_activity_at,
      d.manager_id is null as missing_manager,
      d.seller_spn_id is null and d.buyer_spn_id is null as missing_spn,
      nullif(btrim(coalesce(d.next_action, '')), '') is null as missing_next_action
    from scoped_deals d
    left join public.nav_user_profiles manager on manager.id = d.manager_id
    left join public.nav_user_profiles seller_spn on seller_spn.id = d.seller_spn_id
    left join public.nav_user_profiles buyer_spn on buyer_spn.id = d.buyer_spn_id
    left join lateral (
      select
        count(*) filter (
          where ev.created_at >= v_cutoff
            and ev.event_type not in (
              'task_due_date_initialized',
              'demo_seed',
              'user_linked',
              'user_profile_updated',
              'user_invited'
            )
        )::int as meaningful_events,
        max(ev.created_at) filter (
          where ev.event_type not in (
            'task_due_date_initialized',
            'demo_seed',
            'user_linked',
            'user_profile_updated',
            'user_invited'
          )
        ) as last_meaningful_event_at,
        (array_agg(ev.event_type order by ev.created_at desc) filter (
          where ev.event_type not in (
            'task_due_date_initialized',
            'demo_seed',
            'user_linked',
            'user_profile_updated',
            'user_invited'
          )
        ))[1] as latest_event_type,
        (array_agg(ev.event_title order by ev.created_at desc) filter (
          where ev.event_type not in (
            'task_due_date_initialized',
            'demo_seed',
            'user_linked',
            'user_profile_updated',
            'user_invited'
          )
        ))[1] as latest_event_title
      from public.nav_deal_events_v2 ev
      where ev.deal_id = d.id
    ) events on true
    left join lateral (
      select
        count(*) filter (where task.created_at >= v_cutoff)::int as created_tasks,
        count(*) filter (
          where task.created_at >= v_cutoff
            and coalesce(
              task.task_type,
              case
                when coalesce(task.source, '') like 'auto_quality_%' then 'quality_warning'
                when coalesce(task.source, '') in ('auto_lawyer', 'auto_children') then 'legal_blocker'
                when coalesce(task.source, '') = 'auto_broker' then 'broker_task'
                when coalesce(task.source, '') in ('auto_expenses', 'auto_settlements') then 'operational_task'
                when coalesce(task.source, '') like 'auto_%' then 'system_recommendation'
                else 'operational_task'
              end
            ) in (
              'operational_task',
              'document_request',
              'legal_blocker',
              'broker_task',
              'management_escalation'
            )
        )::int as client_actions_created,
        count(*) filter (
          where task.created_at >= v_cutoff
            and coalesce(
              task.task_type,
              case
                when coalesce(task.source, '') like 'auto_quality_%' then 'quality_warning'
                else null
              end
            ) = 'quality_warning'
        )::int as quality_warnings_created,
        count(*) filter (
          where task.completed_at >= v_cutoff
            or (task.status = 'done' and task.updated_at >= v_cutoff)
        )::int as completed_tasks,
        count(*) filter (where task.status in ('open', 'in_progress'))::int as open_tasks,
        count(*) filter (
          where task.status in ('open', 'in_progress')
            and task.due_date is not null
            and task.due_date < current_date
        )::int as overdue_tasks,
        max(greatest(task.created_at, task.updated_at, task.completed_at)) as last_task_activity_at
      from public.nav_deal_tasks_v2 task
      where task.deal_id = d.id
    ) tasks on true
    left join lateral (
      select
        count(*) filter (where risk.created_at >= v_cutoff)::int as created_risks,
        count(*) filter (where risk.is_resolved and risk.resolved_at >= v_cutoff)::int as resolved_risks,
        count(*) filter (where not risk.is_resolved)::int as open_risks,
        max(greatest(risk.created_at, risk.updated_at, risk.resolved_at)) as last_risk_activity_at
      from public.nav_deal_risks_v2 risk
      where risk.deal_id = d.id
    ) risks on true
    left join lateral (
      select
        count(*) filter (where document.created_at >= v_cutoff)::int as created_documents,
        count(*) filter (
          where coalesce(document.resolved_at, document.checked_at, document.last_status_changed_at) >= v_cutoff
            and document.status in ('checked', 'not_required')
        )::int as resolved_documents,
        count(*) filter (
          where document.is_required is true
            and document.due_date is not null
            and document.due_date < current_date
            and document.status not in ('checked', 'not_required')
        )::int as overdue_required_documents,
        max(greatest(
          document.created_at,
          document.updated_at,
          document.checked_at,
          document.resolved_at,
          document.last_status_changed_at
        )) as last_document_activity_at
      from public.nav_deal_documents_v2 document
      where document.deal_id = d.id
    ) documents on true
  ), prepared as (
    select
      adoption.*,
      greatest(0, current_date - adoption.last_meaningful_activity_at::date)::int as stale_days,
      case
        when adoption.confirmed_results > 0 then 'confirmed_result'
        when adoption.activity_signals > 0 then 'activity_without_result'
        else 'no_recent_activity'
      end as movement_state,
      case
        when adoption.confirmed_results > 0 then 'Есть подтверждённый результат'
        when adoption.activity_signals > 0 then 'Есть активность, но результат не подтверждён'
        else 'Нет активности за выбранный период'
      end as movement_state_label,
      case
        when adoption.missing_manager then 'Не назначен менеджер'
        when adoption.missing_spn then 'Не назначен СПН'
        when adoption.missing_next_action then 'Не указан следующий шаг'
        when adoption.activity_signals = 0 then 'Нет активности за выбранный период'
        when adoption.confirmed_results = 0 then 'Есть активность, но нет подтверждённого результата'
        when adoption.overdue_tasks > 0 then 'Есть просроченные задачи'
        when adoption.open_risks > 0 then 'Есть открытые риски'
        else null
      end as attention_reason,
      adoption.missing_manager
        or adoption.missing_spn
        or adoption.missing_next_action
        or adoption.activity_signals = 0
        or adoption.confirmed_results = 0
        or adoption.overdue_tasks > 0
        or adoption.open_risks > 0 as needs_attention
    from adoption
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'deal_id', prepared.deal_id,
    'deal_title', prepared.deal_title,
    'address', prepared.address,
    'deal_status', prepared.deal_status,
    'deal_created_at', prepared.deal_created_at,
    'next_action', prepared.next_action,
    'manager_id', prepared.manager_id,
    'manager_name', prepared.manager_name,
    'seller_spn_id', prepared.seller_spn_id,
    'seller_spn_name', prepared.seller_spn_name,
    'buyer_spn_id', prepared.buyer_spn_id,
    'buyer_spn_name', prepared.buyer_spn_name,
    'movement_state', prepared.movement_state,
    'movement_state_label', prepared.movement_state_label,
    'meaningful_events', prepared.meaningful_events,
    'latest_event_type', prepared.latest_event_type,
    'latest_event_title', prepared.latest_event_title,
    'created_tasks', prepared.created_tasks,
    'client_actions_created', prepared.client_actions_created,
    'quality_warnings_created', prepared.quality_warnings_created,
    'completed_tasks', prepared.completed_tasks,
    'created_risks', prepared.created_risks,
    'resolved_risks', prepared.resolved_risks,
    'created_documents', prepared.created_documents,
    'resolved_documents', prepared.resolved_documents,
    'confirmed_results', prepared.confirmed_results,
    'activity_signals', prepared.activity_signals,
    'open_tasks', prepared.open_tasks,
    'overdue_tasks', prepared.overdue_tasks,
    'open_risks', prepared.open_risks,
    'overdue_required_documents', prepared.overdue_required_documents,
    'last_meaningful_activity_at', prepared.last_meaningful_activity_at,
    'stale_days', prepared.stale_days,
    'missing_manager', prepared.missing_manager,
    'missing_spn', prepared.missing_spn,
    'missing_next_action', prepared.missing_next_action,
    'needs_attention', prepared.needs_attention,
    'attention_reason', prepared.attention_reason,
    'card_url', format('./deal-card-v2.html?id=%s', prepared.deal_id)
  ) order by
    prepared.needs_attention desc,
    case prepared.movement_state
      when 'no_recent_activity' then 0
      when 'activity_without_result' then 1
      else 2
    end,
    prepared.stale_days desc,
    prepared.overdue_tasks desc,
    prepared.open_risks desc,
    prepared.deal_created_at asc), '[]'::jsonb)
  into v_all_items
  from prepared;

  with rows as (
    select value as item, ordinality
    from jsonb_array_elements(v_all_items) with ordinality
  )
  select coalesce(jsonb_agg(item order by ordinality), '[]'::jsonb)
  into v_items
  from rows
  where ordinality <= v_limit;

  with rows as (
    select value as item
    from jsonb_array_elements(v_all_items)
  )
  select jsonb_build_object(
    'deals_in_scope', count(*)::int,
    'with_confirmed_results', count(*) filter (where item ->> 'movement_state' = 'confirmed_result')::int,
    'active_without_result', count(*) filter (where item ->> 'movement_state' = 'activity_without_result')::int,
    'no_recent_activity', count(*) filter (where item ->> 'movement_state' = 'no_recent_activity')::int,
    'needs_attention', count(*) filter (where (item ->> 'needs_attention')::boolean)::int,
    'missing_manager', count(*) filter (where (item ->> 'missing_manager')::boolean)::int,
    'missing_spn', count(*) filter (where (item ->> 'missing_spn')::boolean)::int,
    'missing_next_action', count(*) filter (where (item ->> 'missing_next_action')::boolean)::int,
    'stale_7_plus', count(*) filter (where (item ->> 'stale_days')::int >= 7)::int,
    'created_tasks', coalesce(sum((item ->> 'created_tasks')::int), 0)::int,
    'client_actions_created', coalesce(sum((item ->> 'client_actions_created')::int), 0)::int,
    'quality_warnings_created', coalesce(sum((item ->> 'quality_warnings_created')::int), 0)::int,
    'completed_tasks', coalesce(sum((item ->> 'completed_tasks')::int), 0)::int,
    'created_risks', coalesce(sum((item ->> 'created_risks')::int), 0)::int,
    'resolved_risks', coalesce(sum((item ->> 'resolved_risks')::int), 0)::int,
    'created_documents', coalesce(sum((item ->> 'created_documents')::int), 0)::int,
    'resolved_documents', coalesce(sum((item ->> 'resolved_documents')::int), 0)::int,
    'confirmed_results', coalesce(sum((item ->> 'confirmed_results')::int), 0)::int,
    'open_tasks', coalesce(sum((item ->> 'open_tasks')::int), 0)::int,
    'overdue_tasks', coalesce(sum((item ->> 'overdue_tasks')::int), 0)::int,
    'open_risks', coalesce(sum((item ->> 'open_risks')::int), 0)::int,
    'overdue_required_documents', coalesce(sum((item ->> 'overdue_required_documents')::int), 0)::int,
    'confirmed_result_rate', case
      when count(*) = 0 then 0
      else round(100.0 * count(*) filter (where item ->> 'movement_state' = 'confirmed_result') / count(*), 1)
    end
  )
  into v_summary
  from rows;

  return jsonb_build_object(
    'profile', v_profile,
    'preview_only', true,
    'report_version', 1,
    'period_days', v_days,
    'cutoff_at', v_cutoff,
    'generated_at', now(),
    'summary', v_summary,
    'items', v_items,
    'items_total', jsonb_array_length(v_all_items),
    'items_limited', jsonb_array_length(v_items)
  );
end;
$function$;

revoke all on function public.nav_v2_get_operational_adoption_report(integer, integer) from public;
revoke execute on function public.nav_v2_get_operational_adoption_report(integer, integer) from anon;
grant execute on function public.nav_v2_get_operational_adoption_report(integer, integer) to authenticated, service_role;

comment on function public.nav_v2_get_operational_adoption_report(integer, integer) is
  'Read-only operational adoption report for owner/admin/manager: activity, confirmed results, ownership gaps and current backlog.';

create or replace function public.nav_v2_get_rpc_grant_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $health$
declare
  v_uid uuid := auth.uid();
  v_items jsonb;
  v_problem_count integer := 0;
  v_missing_count integer := 0;
  v_duplicate_count integer := 0;
  v_missing_authenticated_count integer := 0;
  v_anon_open_count integer := 0;
  v_public_open_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.nav_user_profiles p
    where p.id = v_uid
      and p.is_active is true
      and p.role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role)
  ) then
    raise exception 'Проверка RPC доступна только owner/admin' using errcode = '42501';
  end if;

  with expected(category, function_name) as (
    values
      ('frontend_api', 'nav_v2_get_my_profile'),
      ('frontend_api', 'nav_v2_get_dashboard'),
      ('frontend_api', 'nav_v2_get_deals_list'),
      ('frontend_api', 'nav_v2_get_operational_readiness_preview'),
      ('frontend_api', 'nav_v2_get_operational_adoption_report'),
      ('frontend_api', 'nav_v2_get_task_taxonomy_preview'),
      ('frontend_api', 'nav_v2_get_broker_queue_preview'),
      ('frontend_api', 'nav_v2_get_handoff_scores'),
      ('frontend_api', 'nav_v2_get_deal_card'),
      ('frontend_api', 'nav_v2_get_deal_card_lite'),
      ('frontend_api', 'nav_v2_get_deal_responsibility_snapshot'),
      ('frontend_api', 'nav_v2_get_deal_status_options'),
      ('frontend_api', 'nav_v2_update_deal_parties'),
      ('frontend_api', 'nav_v2_update_deal_status'),
      ('frontend_api', 'nav_v2_add_comment'),
      ('frontend_api', 'nav_v2_add_deal_review'),
      ('frontend_api', 'nav_v2_return_spn_rework'),
      ('frontend_api', 'nav_v2_submit_spn_rework'),
      ('frontend_api', 'nav_v2_add_document'),
      ('frontend_api', 'nav_v2_update_document_status'),
      ('frontend_api', 'nav_v2_update_document_assignment'),
      ('frontend_api', 'nav_v2_update_document_workflow'),
      ('frontend_api', 'nav_v2_add_task'),
      ('frontend_api', 'nav_v2_update_task_status'),
      ('frontend_api', 'nav_v2_update_task_due_date'),
      ('frontend_api', 'nav_v2_add_risk'),
      ('frontend_api', 'nav_v2_update_risk_resolution'),
      ('frontend_api', 'nav_v2_add_expense'),
      ('frontend_api', 'nav_v2_save_wizard_result'),
      ('frontend_api', 'nav_v2_get_lawyer_queue'),
      ('frontend_api', 'nav_v2_get_lawyer_review_summary'),
      ('admin_api', 'nav_v2_list_users'),
      ('admin_api', 'nav_v2_link_user_by_email'),
      ('admin_api', 'nav_v2_update_user_profile'),
      ('admin_api', 'nav_v2_check_deal_access'),
      ('admin_api', 'nav_v2_get_access_audit'),
      ('admin_api', 'nav_v2_get_data_quality_dashboard'),
      ('admin_api', 'nav_v2_get_team_profile_quality_health'),
      ('admin_api', 'nav_v2_get_data_integrity_health'),
      ('admin_api', 'nav_v2_get_frontend_rpc_coverage_health'),
      ('admin_api', 'nav_v2_get_frontend_coverage_health'),
      ('admin_api', 'nav_v2_get_rpc_grant_health'),
      ('admin_api', 'nav_v2_get_security_hardening_health'),
      ('admin_api', 'nav_v2_get_rls_policy_health'),
      ('admin_api', 'nav_v2_get_storage_security_health'),
      ('admin_api', 'nav_v2_get_index_health'),
      ('admin_api', 'nav_v2_get_internal_rpc_lockdown_health'),
      ('demo_api', 'nav_v2_seed_demo_data'),
      ('demo_api', 'nav_v2_clear_demo_data')
  ), matched as (
    select
      e.category,
      e.function_name,
      p.oid,
      case when p.oid is null then null else format(
        '%I.%I(%s)',
        n.nspname,
        p.proname,
        pg_get_function_identity_arguments(p.oid)
      ) end as signature,
      case when p.oid is null then false else has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_can_execute,
      case when p.oid is null then false else has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_can_execute,
      case when p.oid is null then false else has_function_privilege('public', p.oid, 'EXECUTE') end as public_can_execute
    from expected e
    left join pg_proc p on p.proname = e.function_name
    left join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.oid is null or n.nspname = 'public'
  ), summarized as (
    select
      category,
      function_name,
      count(oid)::integer as overload_count,
      coalesce(jsonb_agg(signature order by signature) filter (where oid is not null), '[]'::jsonb) as signatures,
      coalesce(bool_and(authenticated_can_execute) filter (where oid is not null), false) as authenticated_can_execute,
      coalesce(bool_or(anon_can_execute) filter (where oid is not null), false) as anon_can_execute,
      coalesce(bool_or(public_can_execute) filter (where oid is not null), false) as public_can_execute
    from matched
    group by category, function_name
  ), items as (
    select
      category,
      function_name as title,
      function_name,
      overload_count = 1 as exists_in_db,
      overload_count,
      case
        when jsonb_array_length(signatures) = 1 then signatures ->> 0
        else function_name
      end as signature,
      signatures,
      authenticated_can_execute,
      anon_can_execute,
      public_can_execute,
      case
        when overload_count = 0 then 'missing_function'
        when overload_count > 1 then 'unexpected_overload_count'
        when not authenticated_can_execute then 'missing_authenticated_execute'
        when anon_can_execute then 'anon_execute_open'
        when public_can_execute then 'public_execute_open'
        else null
      end as problem
    from summarized
  )
  select
    coalesce(jsonb_agg(to_jsonb(items) order by category, function_name), '[]'::jsonb),
    count(*) filter (where problem is not null)::integer,
    count(*) filter (where problem = 'missing_function')::integer,
    count(*) filter (where problem = 'unexpected_overload_count')::integer,
    count(*) filter (where problem = 'missing_authenticated_execute')::integer,
    count(*) filter (where problem = 'anon_execute_open')::integer,
    count(*) filter (where problem = 'public_execute_open')::integer
  into
    v_items,
    v_problem_count,
    v_missing_count,
    v_duplicate_count,
    v_missing_authenticated_count,
    v_anon_open_count,
    v_public_open_count
  from items;

  return jsonb_build_object(
    'ok', coalesce(v_problem_count, 0) = 0,
    'checked_at', now(),
    'items', v_items,
    'items_count', jsonb_array_length(v_items),
    'problem_count', coalesce(v_problem_count, 0),
    'missing_count', coalesce(v_missing_count, 0),
    'duplicate_count', coalesce(v_duplicate_count, 0),
    'missing_authenticated_count', coalesce(v_missing_authenticated_count, 0),
    'anon_open_count', coalesce(v_anon_open_count, 0),
    'public_open_count', coalesce(v_public_open_count, 0),
    'scope', 'browser_callable_only'
  );
end;
$health$;

revoke all on function public.nav_v2_get_rpc_grant_health() from public;
revoke execute on function public.nav_v2_get_rpc_grant_health() from anon;
grant execute on function public.nav_v2_get_rpc_grant_health() to authenticated, service_role;

do $assertions$
declare
  v_definition text;
  v_health_definition text;
  v_public_execute boolean;
  v_anon_execute boolean;
begin
  select pg_get_functiondef('public.nav_v2_get_operational_adoption_report(integer, integer)'::regprocedure)
  into v_definition;

  if position('activity_without_result' in v_definition) = 0
    or position('confirmed_results' in v_definition) = 0
    or position('missing_manager' in v_definition) = 0
    or position('preview_only' in v_definition) = 0 then
    raise exception 'Operational adoption report definition drifted';
  end if;

  select has_function_privilege('public', 'public.nav_v2_get_operational_adoption_report(integer, integer)', 'EXECUTE')
  into v_public_execute;
  select has_function_privilege('anon', 'public.nav_v2_get_operational_adoption_report(integer, integer)', 'EXECUTE')
  into v_anon_execute;

  if v_public_execute or v_anon_execute then
    raise exception 'Operational adoption report must remain closed to public and anon';
  end if;

  select pg_get_functiondef('public.nav_v2_get_rpc_grant_health()'::regprocedure)
  into v_health_definition;

  if position('nav_v2_get_operational_adoption_report' in v_health_definition) = 0 then
    raise exception 'RPC grant health is missing operational adoption report';
  end if;
end
$assertions$;

notify pgrst, 'reload schema';
