create or replace function nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(
  p_days integer default 30
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
  v_current_end timestamptz := now();
  v_current_start timestamptz;
  v_previous_start timestamptz;
  v_summaries jsonb := '{}'::jsonb;
  v_current jsonb := '{}'::jsonb;
  v_previous jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  select p.role
  into v_role
  from public.nav_user_profiles p
  where p.id = v_uid
    and p.is_active is true
  limit 1;

  if v_role not in ('owner', 'admin', 'manager') then
    raise exception 'Сравнение внедрения доступно владельцу, администратору и менеджеру' using errcode = '42501';
  end if;

  v_current_start := v_current_end - make_interval(days => v_days);
  v_previous_start := v_current_end - make_interval(days => v_days * 2);

  with periods as (
    select
      'current'::text as period_key,
      v_current_start as period_start,
      v_current_end as period_end
    union all
    select
      'previous'::text,
      v_previous_start,
      v_current_start
  ), scoped_deals as (
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
  ), period_deals as (
    select
      period.period_key,
      period.period_start,
      period.period_end,
      deal.id as deal_id
    from periods period
    join scoped_deals deal
      on deal.created_at < period.period_end
  ), measured as (
    select
      period_deal.*,
      coalesce(events.meaningful_events, 0) as meaningful_events,
      coalesce(tasks.created_tasks, 0) as created_tasks,
      coalesce(tasks.client_actions_created, 0) as client_actions_created,
      coalesce(tasks.quality_warnings_created, 0) as quality_warnings_created,
      coalesce(tasks.completed_tasks, 0) as completed_tasks,
      coalesce(risks.created_risks, 0) as created_risks,
      coalesce(risks.resolved_risks, 0) as resolved_risks,
      coalesce(documents.created_documents, 0) as created_documents,
      coalesce(documents.resolved_documents, 0) as resolved_documents
    from period_deals period_deal
    left join lateral (
      select count(*)::integer as meaningful_events
      from public.nav_deal_events_v2 event
      where event.deal_id = period_deal.deal_id
        and event.created_at >= period_deal.period_start
        and event.created_at < period_deal.period_end
        and event.event_type not in (
          'task_due_date_initialized',
          'demo_seed',
          'user_linked',
          'user_profile_updated',
          'user_invited'
        )
    ) events on true
    left join lateral (
      select
        count(*) filter (
          where task.created_at >= period_deal.period_start
            and task.created_at < period_deal.period_end
        )::integer as created_tasks,
        count(*) filter (
          where task.created_at >= period_deal.period_start
            and task.created_at < period_deal.period_end
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
        )::integer as client_actions_created,
        count(*) filter (
          where task.created_at >= period_deal.period_start
            and task.created_at < period_deal.period_end
            and coalesce(
              task.task_type,
              case
                when coalesce(task.source, '') like 'auto_quality_%' then 'quality_warning'
                else null
              end
            ) = 'quality_warning'
        )::integer as quality_warnings_created,
        count(*) filter (
          where (
            task.completed_at >= period_deal.period_start
            and task.completed_at < period_deal.period_end
          )
          or (
            task.status = 'done'
            and task.updated_at >= period_deal.period_start
            and task.updated_at < period_deal.period_end
          )
        )::integer as completed_tasks
      from public.nav_deal_tasks_v2 task
      where task.deal_id = period_deal.deal_id
    ) tasks on true
    left join lateral (
      select
        count(*) filter (
          where risk.created_at >= period_deal.period_start
            and risk.created_at < period_deal.period_end
        )::integer as created_risks,
        count(*) filter (
          where risk.is_resolved is true
            and risk.resolved_at >= period_deal.period_start
            and risk.resolved_at < period_deal.period_end
        )::integer as resolved_risks
      from public.nav_deal_risks_v2 risk
      where risk.deal_id = period_deal.deal_id
    ) risks on true
    left join lateral (
      select
        count(*) filter (
          where document.created_at >= period_deal.period_start
            and document.created_at < period_deal.period_end
        )::integer as created_documents,
        count(*) filter (
          where coalesce(
              document.resolved_at,
              document.checked_at,
              document.last_status_changed_at
            ) >= period_deal.period_start
            and coalesce(
              document.resolved_at,
              document.checked_at,
              document.last_status_changed_at
            ) < period_deal.period_end
            and document.status in ('checked', 'not_required')
        )::integer as resolved_documents
      from public.nav_deal_documents_v2 document
      where document.deal_id = period_deal.deal_id
    ) documents on true
  ), classified as (
    select
      measured.*,
      measured.completed_tasks
        + measured.resolved_risks
        + measured.resolved_documents as confirmed_results,
      measured.meaningful_events
        + measured.created_tasks
        + measured.created_risks
        + measured.created_documents as activity_signals
    from measured
  ), grouped as (
    select
      period_key,
      min(period_start) as period_start,
      max(period_end) as period_end,
      count(*)::integer as deals_in_scope,
      count(*) filter (where confirmed_results > 0)::integer as with_confirmed_results,
      count(*) filter (
        where confirmed_results = 0
          and activity_signals > 0
      )::integer as active_without_result,
      count(*) filter (
        where confirmed_results = 0
          and activity_signals = 0
      )::integer as no_recent_activity,
      coalesce(sum(meaningful_events), 0)::integer as meaningful_events,
      coalesce(sum(created_tasks), 0)::integer as created_tasks,
      coalesce(sum(client_actions_created), 0)::integer as client_actions_created,
      coalesce(sum(quality_warnings_created), 0)::integer as quality_warnings_created,
      coalesce(sum(completed_tasks), 0)::integer as completed_tasks,
      coalesce(sum(created_risks), 0)::integer as created_risks,
      coalesce(sum(resolved_risks), 0)::integer as resolved_risks,
      coalesce(sum(created_documents), 0)::integer as created_documents,
      coalesce(sum(resolved_documents), 0)::integer as resolved_documents,
      coalesce(sum(confirmed_results), 0)::integer as confirmed_results,
      coalesce(sum(activity_signals), 0)::integer as activity_signals,
      case
        when count(*) = 0 then 0::numeric
        else round(
          100.0 * count(*) filter (where confirmed_results > 0) / count(*),
          1
        )
      end as confirmed_result_rate
    from classified
    group by period_key
  )
  select coalesce(
    jsonb_object_agg(
      grouped.period_key,
      jsonb_build_object(
        'period_start', grouped.period_start,
        'period_end', grouped.period_end,
        'deals_in_scope', grouped.deals_in_scope,
        'with_confirmed_results', grouped.with_confirmed_results,
        'active_without_result', grouped.active_without_result,
        'no_recent_activity', grouped.no_recent_activity,
        'meaningful_events', grouped.meaningful_events,
        'created_tasks', grouped.created_tasks,
        'client_actions_created', grouped.client_actions_created,
        'quality_warnings_created', grouped.quality_warnings_created,
        'completed_tasks', grouped.completed_tasks,
        'created_risks', grouped.created_risks,
        'resolved_risks', grouped.resolved_risks,
        'created_documents', grouped.created_documents,
        'resolved_documents', grouped.resolved_documents,
        'confirmed_results', grouped.confirmed_results,
        'activity_signals', grouped.activity_signals,
        'confirmed_result_rate', grouped.confirmed_result_rate
      )
    ),
    '{}'::jsonb
  )
  into v_summaries
  from grouped;

  v_current := coalesce(v_summaries -> 'current', '{}'::jsonb);
  v_previous := coalesce(v_summaries -> 'previous', '{}'::jsonb);

  return jsonb_build_object(
    'comparison_version', 1,
    'period_days', v_days,
    'generated_at', v_current_end,
    'current_period', v_current,
    'previous_period', v_previous,
    'delta', jsonb_build_object(
      'deals_in_scope',
        coalesce((v_current ->> 'deals_in_scope')::integer, 0)
        - coalesce((v_previous ->> 'deals_in_scope')::integer, 0),
      'with_confirmed_results',
        coalesce((v_current ->> 'with_confirmed_results')::integer, 0)
        - coalesce((v_previous ->> 'with_confirmed_results')::integer, 0),
      'active_without_result',
        coalesce((v_current ->> 'active_without_result')::integer, 0)
        - coalesce((v_previous ->> 'active_without_result')::integer, 0),
      'no_recent_activity',
        coalesce((v_current ->> 'no_recent_activity')::integer, 0)
        - coalesce((v_previous ->> 'no_recent_activity')::integer, 0),
      'completed_tasks',
        coalesce((v_current ->> 'completed_tasks')::integer, 0)
        - coalesce((v_previous ->> 'completed_tasks')::integer, 0),
      'resolved_risks',
        coalesce((v_current ->> 'resolved_risks')::integer, 0)
        - coalesce((v_previous ->> 'resolved_risks')::integer, 0),
      'resolved_documents',
        coalesce((v_current ->> 'resolved_documents')::integer, 0)
        - coalesce((v_previous ->> 'resolved_documents')::integer, 0),
      'confirmed_results',
        coalesce((v_current ->> 'confirmed_results')::integer, 0)
        - coalesce((v_previous ->> 'confirmed_results')::integer, 0),
      'client_actions_created',
        coalesce((v_current ->> 'client_actions_created')::integer, 0)
        - coalesce((v_previous ->> 'client_actions_created')::integer, 0),
      'quality_warnings_created',
        coalesce((v_current ->> 'quality_warnings_created')::integer, 0)
        - coalesce((v_previous ->> 'quality_warnings_created')::integer, 0),
      'confirmed_result_rate_points', round(
        coalesce((v_current ->> 'confirmed_result_rate')::numeric, 0)
        - coalesce((v_previous ->> 'confirmed_result_rate')::numeric, 0),
        1
      )
    ),
    'historical_backlog_included', false,
    'comparison_note',
      'Сравниваются только события и подтверждённые результаты внутри двух равных окон. Текущие открытые и просроченные остатки не выдаются за исторические значения.',
    'employee_score', false
  );
end;
$function$;

revoke all on function nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(integer) from public;
revoke execute on function nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(integer) from anon, authenticated;
grant execute on function nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(integer) to service_role;

comment on function nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(integer) is
  'Private read-only current-versus-previous equal-period comparison for Navigator operational adoption; never exposes historical backlog guesses.';

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
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.nav_user_profiles p
    where p.id = v_uid
      and p.is_active is true
      and p.role in (
        'owner'::public.nav_v2_user_role,
        'admin'::public.nav_v2_user_role,
        'manager'::public.nav_v2_user_role
      )
  ) then
    raise exception 'Отчёт внедрения доступен владельцу, администратору и менеджеру' using errcode = '42501';
  end if;

  v_report := nav_v2_private.nav_v2_get_operational_adoption_report_unchecked_20260713(
    p_days,
    p_limit
  );
  v_comparison := nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(
    p_days
  );

  return v_report || jsonb_build_object(
    'report_version', 2,
    'comparison', v_comparison
  );
end;
$function$;

revoke all on function public.nav_v2_get_operational_adoption_report(integer, integer) from public;
revoke execute on function public.nav_v2_get_operational_adoption_report(integer, integer) from anon;
grant execute on function public.nav_v2_get_operational_adoption_report(integer, integer) to authenticated, service_role;

comment on function public.nav_v2_get_operational_adoption_report(integer, integer) is
  'Role-gated read-only Navigator adoption report with current-versus-previous equal-period comparison for owner/admin/manager.';

do $assertions$
declare
  v_wrapper_definition text;
  v_private_definition text;
  v_public_execute boolean;
  v_anon_execute boolean;
  v_authenticated_execute boolean;
  v_private_authenticated_execute boolean;
begin
  select pg_get_functiondef(
    'public.nav_v2_get_operational_adoption_report(integer, integer)'::regprocedure
  )
  into v_wrapper_definition;

  select pg_get_functiondef(
    'nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(integer)'::regprocedure
  )
  into v_private_definition;

  if position('nav_v2_get_operational_adoption_period_comparison_unchecked_20260713' in v_wrapper_definition) = 0
    or position('comparison' in v_wrapper_definition) = 0
    or position('report_version' in v_wrapper_definition) = 0 then
    raise exception 'Operational adoption public comparison wrapper definition drifted';
  end if;

  if position('previous_period' in v_private_definition) = 0
    or position('confirmed_result_rate_points' in v_private_definition) = 0
    or position('historical_backlog_included' in v_private_definition) = 0
    or position('employee_score' in v_private_definition) = 0 then
    raise exception 'Operational adoption period comparison definition drifted';
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
    'authenticated',
    'nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(integer)',
    'EXECUTE'
  ) into v_private_authenticated_execute;

  if v_public_execute or v_anon_execute or not v_authenticated_execute then
    raise exception 'Operational adoption public comparison wrapper grants drifted';
  end if;

  if v_private_authenticated_execute then
    raise exception 'Operational adoption comparison implementation must remain private';
  end if;
end
$assertions$;

notify pgrst, 'reload schema';
