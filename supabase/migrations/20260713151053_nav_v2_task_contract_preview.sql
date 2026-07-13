alter table public.nav_deal_tasks_v2
  add column if not exists task_type text,
  add column if not exists sla_days integer;

comment on column public.nav_deal_tasks_v2.task_type is
  'Optional persisted Navigator task classification. Existing rows remain null until an audited assignment workflow is approved.';
comment on column public.nav_deal_tasks_v2.sla_days is
  'Optional persisted SLA in calendar days. Existing rows remain null until an audited assignment workflow is approved.';

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.nav_deal_tasks_v2'::regclass
      and conname = 'nav_deal_tasks_v2_task_type_check'
  ) then
    alter table public.nav_deal_tasks_v2
      add constraint nav_deal_tasks_v2_task_type_check
      check (
        task_type is null
        or task_type in (
          'operational_task',
          'document_request',
          'quality_warning',
          'system_recommendation',
          'legal_blocker',
          'broker_task',
          'management_escalation'
        )
      ) not valid;
    alter table public.nav_deal_tasks_v2
      validate constraint nav_deal_tasks_v2_task_type_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.nav_deal_tasks_v2'::regclass
      and conname = 'nav_deal_tasks_v2_sla_days_check'
  ) then
    alter table public.nav_deal_tasks_v2
      add constraint nav_deal_tasks_v2_sla_days_check
      check (sla_days is null or sla_days between 1 and 365) not valid;
    alter table public.nav_deal_tasks_v2
      validate constraint nav_deal_tasks_v2_sla_days_check;
  end if;
end
$constraints$;

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
  ), classified_raw as (
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
      t.task_type as persisted_task_type,
      t.sla_days as persisted_sla_days,
      case
        when coalesce(t.source, '') like 'auto_quality_%' then 'quality_warning'
        when coalesce(t.source, '') in ('auto_lawyer', 'auto_children') then 'legal_blocker'
        when coalesce(t.source, '') = 'auto_broker' then 'broker_task'
        when coalesce(t.source, '') in ('auto_expenses', 'auto_settlements') then 'operational_task'
        when coalesce(t.source, '') like 'auto_%' then 'system_recommendation'
        else 'operational_task'
      end as inferred_task_type,
      case
        when coalesce(t.source, '') like 'auto_quality_%' then 3
        when coalesce(t.source, '') in ('auto_lawyer', 'auto_children') then 1
        when coalesce(t.source, '') = 'auto_broker' then 2
        when coalesce(t.source, '') in ('auto_expenses', 'auto_settlements') then 2
        when coalesce(t.source, '') like 'auto_%' then 5
        else 2
      end as inferred_sla_days,
      case
        when t.assigned_to is not null then 'person_assigned'
        when t.assigned_role is not null then 'role_assigned'
        else 'unassigned'
      end as assignment_state
    from scoped_deals d
    join public.nav_deal_tasks_v2 t on t.deal_id = d.id
    left join public.nav_user_profiles assignee on assignee.id = t.assigned_to
    where t.status in ('open', 'in_progress')
  ), classified as (
    select
      r.*,
      coalesce(r.persisted_task_type, r.inferred_task_type) as task_type,
      coalesce(r.persisted_sla_days, r.inferred_sla_days) as sla_days,
      case
        when r.persisted_task_type is null and r.persisted_sla_days is null then 'not_persisted'
        when r.persisted_task_type is null or r.persisted_sla_days is null then 'partial'
        when r.persisted_task_type = r.inferred_task_type
          and r.persisted_sla_days = r.inferred_sla_days then 'matches_inference'
        else 'overrides_inference'
      end as contract_state
    from classified_raw r
  ), prepared as (
    select
      c.*,
      coalesce(c.due_date, c.created_at::date + c.sla_days) as control_due_date,
      coalesce(c.due_date, c.created_at::date + c.sla_days) < current_date as is_overdue,
      greatest(0, current_date - coalesce(c.due_date, c.created_at::date + c.sla_days))::int as days_overdue,
      c.assignment_state = 'unassigned' as needs_assignment,
      c.task_type in (
        'operational_task',
        'document_request',
        'legal_blocker',
        'broker_task',
        'management_escalation'
      ) as is_client_action,
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
        when 'document_request' then 'Запрос документа'
        when 'management_escalation' then 'Управленческая эскалация'
        else 'Рабочая задача сделки'
      end as task_type_label,
      case c.contract_state
        when 'matches_inference' then 'Контракт сохранён и совпадает с расчётом'
        when 'overrides_inference' then 'Сохранённый контракт переопределяет расчёт'
        when 'partial' then 'Контракт заполнен частично'
        else 'Тип и SLA пока только рассчитаны'
      end as contract_state_label
    from classified c
  ), limited as (
    select *
    from prepared
    order by
      is_overdue desc,
      needs_assignment desc,
      case task_type
        when 'legal_blocker' then 0
        when 'management_escalation' then 1
        when 'operational_task' then 2
        when 'document_request' then 3
        when 'broker_task' then 4
        when 'quality_warning' then 5
        else 6
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
    'persisted_task_type', l.persisted_task_type,
    'persisted_sla_days', l.persisted_sla_days,
    'inferred_task_type', l.inferred_task_type,
    'inferred_sla_days', l.inferred_sla_days,
    'contract_state', l.contract_state,
    'contract_state_label', l.contract_state_label,
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
      when 'management_escalation' then 1
      when 'operational_task' then 2
      when 'document_request' then 3
      when 'broker_task' then 4
      when 'quality_warning' then 5
      else 6
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
    'without_explicit_due_date', count(*) filter (where item ->> 'due_date' is null)::int,
    'persisted_contracts', count(*) filter (
      where item ->> 'persisted_task_type' is not null
        and item ->> 'persisted_sla_days' is not null
    )::int,
    'missing_contracts', count(*) filter (where item ->> 'contract_state' = 'not_persisted')::int,
    'partial_contracts', count(*) filter (where item ->> 'contract_state' = 'partial')::int,
    'override_contracts', count(*) filter (where item ->> 'contract_state' = 'overrides_inference')::int
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
      count(*) filter (where (item ->> 'needs_assignment')::boolean)::int as unassigned_count,
      count(*) filter (where item ->> 'contract_state' = 'not_persisted')::int as missing_contract_count
    from items
    group by item ->> 'task_type'
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by task_count desc, task_type), '[]'::jsonb)
  into v_type_counts
  from grouped;

  return jsonb_build_object(
    'profile', v_profile,
    'preview_only', true,
    'contract_version', 1,
    'persisted_contract_enabled', true,
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
  'Read-only effective and persisted task type/SLA contract preview for owner/admin/manager; never mutates existing task rows.';

do $assertions$
declare
  v_definition text;
  v_columns integer;
  v_public_execute boolean;
  v_anon_execute boolean;
begin
  select count(*)::int
  into v_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'nav_deal_tasks_v2'
    and column_name in ('task_type', 'sla_days');

  if v_columns <> 2 then
    raise exception 'Expected persisted task contract columns';
  end if;

  select pg_get_functiondef('public.nav_v2_get_task_taxonomy_preview(integer)'::regprocedure)
  into v_definition;

  if position('persisted_task_type' in v_definition) = 0
    or position('contract_state' in v_definition) = 0
    or position('missing_contracts' in v_definition) = 0 then
    raise exception 'Task contract preview definition drifted';
  end if;

  select has_function_privilege('public', 'public.nav_v2_get_task_taxonomy_preview(integer)', 'EXECUTE')
  into v_public_execute;
  select has_function_privilege('anon', 'public.nav_v2_get_task_taxonomy_preview(integer)', 'EXECUTE')
  into v_anon_execute;

  if v_public_execute or v_anon_execute then
    raise exception 'Task contract preview must remain closed to public and anon';
  end if;
end
$assertions$;

notify pgrst, 'reload schema';
