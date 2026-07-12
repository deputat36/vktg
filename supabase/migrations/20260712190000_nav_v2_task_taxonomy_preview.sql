create or replace function public.nav_v2_get_task_taxonomy_preview(
  p_limit integer default 200
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
  v_items jsonb;
  v_summary jsonb;
  v_type_counts jsonb;
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
    raise exception 'Разбор задач доступен владельцу, администратору и менеджеру' using errcode = '42501';
  end if;

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
  ), classified as (
    select
      t.id as task_id,
      t.deal_id,
      d.title as deal_title,
      d.address,
      d.status as deal_status,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.source,
      t.assigned_to,
      t.assigned_role,
      assignee.full_name as assigned_to_name,
      t.due_date,
      t.created_at,
      t.updated_at,
      case
        when coalesce(t.source, '') like 'auto_quality_%' then 'quality_warning'
        when coalesce(t.source, '') in ('auto_lawyer', 'auto_children') then 'legal_blocker'
        when coalesce(t.source, '') = 'auto_broker' then 'broker_task'
        when coalesce(t.source, '') in ('auto_expenses', 'auto_settlements') then 'operational_task'
        when coalesce(t.source, '') like 'auto_%' then 'system_recommendation'
        else 'operational_task'
      end as task_type,
      case
        when coalesce(t.source, '') like 'auto_quality_%' then 3
        when coalesce(t.source, '') in ('auto_lawyer', 'auto_children') then 1
        when coalesce(t.source, '') = 'auto_broker' then 2
        when coalesce(t.source, '') in ('auto_expenses', 'auto_settlements') then 2
        when coalesce(t.source, '') like 'auto_%' then 5
        else 2
      end as sla_days,
      case
        when t.assigned_to is not null then 'person_assigned'
        when t.assigned_role is not null then 'role_assigned'
        else 'unassigned'
      end as assignment_state
    from scoped_deals d
    join public.nav_deal_tasks_v2 t on t.deal_id = d.id
    left join public.nav_user_profiles assignee on assignee.id = t.assigned_to
    where t.status in ('open', 'in_progress')
  ), prepared as (
    select
      c.*,
      coalesce(c.due_date, c.created_at::date + c.sla_days) as control_due_date,
      coalesce(c.due_date, c.created_at::date + c.sla_days) < current_date as is_overdue,
      greatest(0, current_date - coalesce(c.due_date, c.created_at::date + c.sla_days))::int as days_overdue,
      c.assignment_state = 'unassigned' as needs_assignment,
      c.task_type in ('operational_task', 'legal_blocker', 'broker_task') as is_client_action,
      case
        when c.assignment_state = 'unassigned' then 'Не назначен ответственный'
        when c.due_date is null and c.created_at::date + c.sla_days < current_date then 'Контрольная дата рассчитана по SLA и уже истекла'
        when c.due_date is null then 'Контрольная дата рассчитана по SLA'
        when c.due_date < current_date then 'Установленный срок задачи истёк'
        else null
      end as overdue_reason,
      case c.task_type
        when 'legal_blocker' then 'Юридический стоп-фактор'
        when 'broker_task' then 'Задача брокера'
        when 'quality_warning' then 'Проверка качества данных'
        when 'system_recommendation' then 'Системная рекомендация'
        else 'Рабочая задача сделки'
      end as task_type_label
    from classified c
  ), limited as (
    select *
    from prepared
    order by
      is_overdue desc,
      needs_assignment desc,
      case task_type
        when 'legal_blocker' then 0
        when 'operational_task' then 1
        when 'broker_task' then 2
        when 'quality_warning' then 3
        else 4
      end,
      case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
      control_due_date asc,
      created_at asc
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'task_id', l.task_id,
    'deal_id', l.deal_id,
    'deal_title', l.deal_title,
    'address', l.address,
    'deal_status', l.deal_status,
    'title', l.title,
    'description', l.description,
    'status', l.status,
    'priority', l.priority,
    'source', l.source,
    'task_type', l.task_type,
    'task_type_label', l.task_type_label,
    'sla_days', l.sla_days,
    'assigned_to', l.assigned_to,
    'assigned_to_name', l.assigned_to_name,
    'assigned_role', l.assigned_role,
    'assignment_state', l.assignment_state,
    'needs_assignment', l.needs_assignment,
    'due_date', l.due_date,
    'control_due_date', l.control_due_date,
    'is_overdue', l.is_overdue,
    'days_overdue', l.days_overdue,
    'overdue_reason', l.overdue_reason,
    'is_client_action', l.is_client_action,
    'card_url', format('./deal-card-v2.html?id=%s', l.deal_id)
  ) order by
    l.is_overdue desc,
    l.needs_assignment desc,
    case l.task_type
      when 'legal_blocker' then 0
      when 'operational_task' then 1
      when 'broker_task' then 2
      when 'quality_warning' then 3
      else 4
    end,
    case l.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
    l.control_due_date asc,
    l.created_at asc), '[]'::jsonb)
  into v_items
  from limited l;

  with items as (
    select value as item
    from jsonb_array_elements(v_items)
  )
  select jsonb_build_object(
    'open_tasks', count(*)::int,
    'overdue_tasks', count(*) filter (where (item ->> 'is_overdue')::boolean)::int,
    'needs_assignment', count(*) filter (where (item ->> 'needs_assignment')::boolean)::int,
    'quality_warnings', count(*) filter (where item ->> 'task_type' = 'quality_warning')::int,
    'operational_tasks', count(*) filter (where item ->> 'task_type' = 'operational_task')::int,
    'legal_blockers', count(*) filter (where item ->> 'task_type' = 'legal_blocker')::int,
    'broker_tasks', count(*) filter (where item ->> 'task_type' = 'broker_task')::int,
    'system_recommendations', count(*) filter (where item ->> 'task_type' = 'system_recommendation')::int,
    'client_actions', count(*) filter (where (item ->> 'is_client_action')::boolean)::int,
    'without_explicit_due_date', count(*) filter (where item ->> 'due_date' is null)::int
  )
  into v_summary
  from items;

  with items as (
    select value as item
    from jsonb_array_elements(v_items)
  ), grouped as (
    select
      item ->> 'task_type' as task_type,
      max(item ->> 'task_type_label') as task_type_label,
      count(*)::int as task_count,
      count(*) filter (where (item ->> 'is_overdue')::boolean)::int as overdue_count,
      count(*) filter (where (item ->> 'needs_assignment')::boolean)::int as unassigned_count
    from items
    group by item ->> 'task_type'
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by task_count desc, task_type), '[]'::jsonb)
  into v_type_counts
  from grouped;

  return jsonb_build_object(
    'profile', v_profile,
    'preview_only', true,
    'generated_at', now(),
    'summary', v_summary,
    'type_counts', v_type_counts,
    'items', v_items
  );
end;
$function$;

revoke all on function public.nav_v2_get_task_taxonomy_preview(integer) from public;
revoke execute on function public.nav_v2_get_task_taxonomy_preview(integer) from anon;
grant execute on function public.nav_v2_get_task_taxonomy_preview(integer) to authenticated, service_role;

comment on function public.nav_v2_get_task_taxonomy_preview(integer) is
  'Read-only task taxonomy, SLA and sorting preview for owner/admin/manager; never mutates task rows.';

do $migration$
declare
  v_definition text;
  v_marker text;
begin
  select pg_get_functiondef('public.nav_v2_get_rpc_grant_health()'::regprocedure)
  into v_definition;

  v_marker := '(''frontend_api'', ''nav_v2_get_operational_readiness_preview''),';
  if position(v_marker in v_definition) = 0 then
    raise exception 'RPC grant health marker not found';
  end if;

  if position('nav_v2_get_task_taxonomy_preview' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      v_marker,
      v_marker || E'\n      (''frontend_api'', ''nav_v2_get_task_taxonomy_preview''),'
    );
    execute v_definition;
  end if;

  select pg_get_functiondef('public.nav_v2_get_frontend_rpc_coverage_health()'::regprocedure)
  into v_definition;

  v_marker := '(''nav_v2_get_operational_readiness_preview'', ''manager operational queue''),';
  if position(v_marker in v_definition) = 0 then
    raise exception 'Frontend RPC coverage marker not found';
  end if;

  if position('nav_v2_get_task_taxonomy_preview' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      v_marker,
      v_marker || E'\n      (''nav_v2_get_task_taxonomy_preview'', ''manager task taxonomy preview''),'
    );
    execute v_definition;
  end if;
end
$migration$;

notify pgrst, 'reload schema';
