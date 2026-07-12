create or replace function public.nav_v2_get_operational_readiness_preview(
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
  v_items jsonb;
  v_summary jsonb;
  v_spn_workload jsonb;
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
    raise exception 'Операционная очередь доступна owner, admin и manager' using errcode = '42501';
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
  ), activity as (
    select
      d.id,
      greatest(
        d.updated_at,
        coalesce((select max(t.updated_at) from public.nav_deal_tasks_v2 t where t.deal_id = d.id), '-infinity'::timestamptz),
        coalesce((select max(doc.updated_at) from public.nav_deal_documents_v2 doc where doc.deal_id = d.id), '-infinity'::timestamptz),
        coalesce((select max(r.updated_at) from public.nav_deal_risks_v2 r where r.deal_id = d.id), '-infinity'::timestamptz),
        coalesce((select max(e.created_at) from public.nav_deal_events_v2 e where e.deal_id = d.id), '-infinity'::timestamptz)
      ) as last_activity_at
    from scoped_deals d
  ), next_tasks as (
    select d.id as deal_id, task.*
    from scoped_deals d
    left join lateral (
      select
        t.id as task_id,
        t.title as task_title,
        t.assigned_to as task_owner_id,
        t.assigned_role as task_owner_role,
        t.due_date as task_due_date,
        t.priority as task_priority,
        t.source as task_source
      from public.nav_deal_tasks_v2 t
      where t.deal_id = d.id
        and t.status in ('open', 'in_progress')
        and coalesce(t.source, '') not like 'auto_quality_%'
      order by
        t.due_date asc nulls last,
        case t.priority when 'urgent' then 0 when 'high' then 1 else 2 end,
        t.created_at asc
      limit 1
    ) task on true
  ), task_counts as (
    select
      d.id as deal_id,
      count(t.id) filter (where t.status in ('open', 'in_progress'))::int as open_tasks_count,
      count(t.id) filter (
        where t.status in ('open', 'in_progress')
          and t.priority in ('urgent', 'high')
      )::int as urgent_high_tasks_count,
      count(t.id) filter (
        where t.status in ('open', 'in_progress')
          and t.due_date < current_date
      )::int as overdue_tasks_count
    from scoped_deals d
    left join public.nav_deal_tasks_v2 t on t.deal_id = d.id
    group by d.id
  ), risk_counts as (
    select
      d.id as deal_id,
      count(r.id) filter (
        where r.is_resolved is false
          and (r.blocks_deposit is true or r.blocks_deal is true)
      )::int as blocking_risks_count
    from scoped_deals d
    left join public.nav_deal_risks_v2 r on r.deal_id = d.id
    group by d.id
  ), document_counts as (
    select
      d.id as deal_id,
      count(doc.id) filter (
        where doc.is_required is true
          and doc.status not in ('received', 'checked')
          and doc.due_date < current_date
      )::int as overdue_required_documents_count,
      count(doc.id) filter (
        where doc.required_for_deposit is true
          and doc.status not in ('received', 'checked')
          and doc.due_date < current_date
      )::int as overdue_deposit_documents_count,
      count(doc.id) filter (
        where doc.required_for_deal is true
          and doc.status not in ('received', 'checked')
          and doc.due_date < current_date
      )::int as overdue_deal_documents_count
    from scoped_deals d
    left join public.nav_deal_documents_v2 doc on doc.deal_id = d.id
    group by d.id
  ), raw as (
    select
      d.*,
      a.last_activity_at,
      greatest(0, (current_date - a.last_activity_at::date))::int as stale_days,
      nt.task_id,
      coalesce(nt.task_title, nullif(trim(d.next_action), '')) as calculated_next_action,
      coalesce(
        nt.task_owner_id,
        case when nt.task_id is null then coalesce(d.manager_id, d.seller_spn_id, d.buyer_spn_id) end
      ) as calculated_owner_id,
      coalesce(
        nt.task_owner_role,
        case
          when nt.task_id is null and d.manager_id is not null then 'manager'::public.nav_v2_user_role
          when nt.task_id is null and coalesce(d.seller_spn_id, d.buyer_spn_id) is not null then 'spn'::public.nav_v2_user_role
        end
      ) as calculated_owner_role,
      nt.task_due_date as calculated_due_date,
      nt.task_priority,
      nt.task_source,
      coalesce(tc.open_tasks_count, 0) as open_tasks_count,
      coalesce(tc.urgent_high_tasks_count, 0) as urgent_high_tasks_count,
      coalesce(tc.overdue_tasks_count, 0) as overdue_tasks_count,
      coalesce(rc.blocking_risks_count, 0) as blocking_risks_count,
      coalesce(dc.overdue_required_documents_count, 0) as overdue_required_documents_count,
      coalesce(dc.overdue_deposit_documents_count, 0) as overdue_deposit_documents_count,
      coalesce(dc.overdue_deal_documents_count, 0) as overdue_deal_documents_count,
      nullif(trim(coalesce(d.deal_summary #>> '{operational,manager_exception_reason}', '')), '') as manager_exception_reason,
      array_remove(array[
        case when nullif(trim(coalesce(d.seller_name, '')), '') is null then 'Не заполнено имя продавца' end,
        case when nullif(trim(coalesce(d.buyer_name, '')), '') is null then 'Не заполнено имя покупателя' end,
        case
          when d.manager_id is null
            and nullif(trim(coalesce(d.deal_summary #>> '{operational,manager_exception_reason}', '')), '') is null
          then 'Не назначен менеджер и нет документированного исключения'
        end,
        case when d.seller_spn_id is null and d.buyer_spn_id is null then 'Не назначен ответственный СПН' end,
        case when d.lawyer_needed is true and d.lawyer_id is null and d.manager_id is null then 'Юрист ожидает распределения, но нет ответственного менеджера' end,
        case when d.broker_needed is true and d.broker_id is null and d.manager_id is null then 'Брокер ожидает распределения, но нет ответственного менеджера' end,
        case when coalesce(nt.task_title, nullif(trim(d.next_action), '')) is null then 'Не указан следующий шаг' end,
        case
          when coalesce(nt.task_title, nullif(trim(d.next_action), '')) is not null
            and coalesce(nt.task_owner_id, case when nt.task_id is null then coalesce(d.manager_id, d.seller_spn_id, d.buyer_spn_id) end) is null
            and coalesce(nt.task_owner_role, case when nt.task_id is null and d.manager_id is not null then 'manager'::public.nav_v2_user_role when nt.task_id is null and coalesce(d.seller_spn_id, d.buyer_spn_id) is not null then 'spn'::public.nav_v2_user_role end) is null
          then 'У следующего шага нет владельца'
        end,
        case when coalesce(nt.task_title, nullif(trim(d.next_action), '')) is not null and nt.task_due_date is null then 'У следующего шага нет контрольного срока' end
      ]::text[], null) as missing_critical_data,
      array_remove(array[
        case when coalesce(rc.blocking_risks_count, 0) > 0 then format('Открытых блокирующих рисков: %s', rc.blocking_risks_count) end,
        case when coalesce(dc.overdue_required_documents_count, 0) > 0 then format('Просроченных обязательных документов: %s', dc.overdue_required_documents_count) end,
        case when coalesce(tc.overdue_tasks_count, 0) > 0 then format('Просроченных открытых задач: %s', tc.overdue_tasks_count) end,
        case when greatest(0, (current_date - a.last_activity_at::date)) >= 7 then format('Нет активности %s дн.', greatest(0, (current_date - a.last_activity_at::date))) end,
        case when d.lawyer_needed is true and d.lawyer_id is null then 'Юрист ожидает распределения' end,
        case when d.broker_needed is true and d.broker_id is null then 'Брокер ожидает распределения' end
      ]::text[], null) as operational_blockers
    from scoped_deals d
    join activity a on a.id = d.id
    left join next_tasks nt on nt.deal_id = d.id
    left join task_counts tc on tc.deal_id = d.id
    left join risk_counts rc on rc.deal_id = d.id
    left join document_counts dc on dc.deal_id = d.id
  ), scored as (
    select
      r.*,
      greatest(0,
        100
        - 15 * coalesce(array_length(r.missing_critical_data, 1), 0)
        - case when r.overdue_tasks_count > 0 then 10 else 0 end
        - case when r.stale_days >= 7 then 10 else 0 end
        - case when r.lawyer_needed is true and r.lawyer_id is null and r.manager_id is not null then 5 else 0 end
        - case when r.broker_needed is true and r.broker_id is null and r.manager_id is not null then 5 else 0 end
      )::int as uncapped_readiness
    from raw r
  ), ready as (
    select
      s.*,
      least(
        s.uncapped_readiness,
        case when coalesce(array_length(s.missing_critical_data, 1), 0) > 0 then 79 else 100 end,
        case when s.blocking_risks_count > 0 then 60 else 100 end,
        case when s.overdue_required_documents_count > 0 then 65 else 100 end,
        case
          when nullif(trim(coalesce(s.seller_name, '')), '') is null
            or nullif(trim(coalesce(s.buyer_name, '')), '') is null
            or (s.manager_id is null and s.manager_exception_reason is null)
          then 59
          else 100
        end
      )::int as operational_readiness_percent
    from scored s
  ), final as (
    select
      r.*,
      (
        coalesce(array_length(r.missing_critical_data, 1), 0) > 0
        or coalesce(array_length(r.operational_blockers, 1), 0) > 0
        or r.urgent_high_tasks_count > 0
      ) as needs_manager_attention,
      coalesce(
        r.missing_critical_data[1],
        r.operational_blockers[1],
        'Операционных препятствий для следующего этапа не найдено'
      ) as attention_reason,
      case
        when coalesce(array_length(r.missing_critical_data, 1), 0) > 0 then r.missing_critical_data[1]
        when r.blocking_risks_count > 0 then 'Сначала устраните открытый блокирующий риск'
        when r.overdue_deposit_documents_count > 0 then 'Сначала получите просроченные документы, обязательные до задатка'
        when r.overdue_tasks_count > 0 then 'Сначала закройте или перенесите просроченное обязательство с обоснованием'
        else 'Переход к задатку не заблокирован операционным минимумом'
      end as cannot_advance_deposit_reason,
      case
        when coalesce(array_length(r.missing_critical_data, 1), 0) > 0 then r.missing_critical_data[1]
        when r.blocking_risks_count > 0 then 'Сначала устраните открытый блокирующий риск'
        when r.overdue_deal_documents_count > 0 then 'Сначала получите просроченные документы, обязательные до сделки'
        when r.overdue_tasks_count > 0 then 'Сначала закройте или перенесите просроченное обязательство с обоснованием'
        else 'Переход к сделке не заблокирован операционным минимумом'
      end as cannot_advance_deal_reason
    from ready r
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'deal_id', f.id,
      'title', case
        when f.title is null
          or f.title ilike '%Продавец не указан%'
          or f.title ilike '%Покупатель не указан%'
          or f.title ilike '%адрес не указан%'
        then concat_ws(' — ',
          case f.object_type
            when 'flat_mkd' then 'Квартира в МКД'
            when 'flat_ground' then 'Квартира на земле'
            when 'room' then 'Комната'
            when 'share' then 'Доля'
            when 'share_room' then 'Доля / комната'
            when 'house_land' then 'Дом с участком'
            when 'house' then 'Дом'
            when 'land' then 'Земельный участок'
            when 'new_building' then 'Новостройка'
            when 'commercial' then 'Коммерция'
            else 'Объект'
          end,
          coalesce(nullif(trim(f.address), ''), 'адрес уточняется')
        )
        else f.title
      end,
      'status', f.status,
      'operational_readiness_percent', f.operational_readiness_percent,
      'legacy_readiness_deposit_percent', f.readiness_deposit,
      'legacy_readiness_deal_percent', f.readiness_deal,
      'readiness_delta_from_deposit', f.operational_readiness_percent - coalesce(f.readiness_deposit, 0),
      'operational_blockers', to_jsonb(f.operational_blockers),
      'missing_critical_data', to_jsonb(f.missing_critical_data),
      'next_action', f.calculated_next_action,
      'next_action_owner_id', f.calculated_owner_id,
      'next_action_owner_role', f.calculated_owner_role,
      'next_action_owner_name', owner_profile.full_name,
      'next_action_due_date', f.calculated_due_date,
      'next_action_priority', f.task_priority,
      'stale_days', f.stale_days,
      'last_activity_at', f.last_activity_at,
      'needs_manager_attention', f.needs_manager_attention,
      'attention_reason', f.attention_reason,
      'cannot_advance_reason', f.cannot_advance_deposit_reason,
      'cannot_advance_deposit_reason', f.cannot_advance_deposit_reason,
      'cannot_advance_deal_reason', f.cannot_advance_deal_reason,
      'manager_id', f.manager_id,
      'manager_name', manager_profile.full_name,
      'manager_exception_reason', f.manager_exception_reason,
      'responsible_spn_id', coalesce(f.seller_spn_id, f.buyer_spn_id),
      'responsible_spn_name', coalesce(seller_spn.full_name, buyer_spn.full_name),
      'lawyer_assignment_state', case when f.lawyer_needed is not true then 'not_needed' when f.lawyer_id is not null then 'assigned' else 'waiting_assignment' end,
      'broker_assignment_state', case when f.broker_needed is not true then 'not_needed' when f.broker_id is not null then 'assigned' else 'waiting_assignment' end,
      'open_tasks_count', f.open_tasks_count,
      'urgent_high_tasks_count', f.urgent_high_tasks_count,
      'overdue_tasks_count', f.overdue_tasks_count,
      'blocking_risks_count', f.blocking_risks_count,
      'overdue_required_documents_count', f.overdue_required_documents_count,
      'main_action', coalesce(f.calculated_next_action, 'Назначить следующий шаг, владельца и срок'),
      'card_url', format('./deal-card-v2.html?id=%s', f.id)
    ) order by
      f.needs_manager_attention desc,
      f.operational_readiness_percent asc,
      f.calculated_due_date asc nulls first,
      f.stale_days desc), '[]'::jsonb)
  into v_items
  from (
    select *
    from final
    order by
      needs_manager_attention desc,
      operational_readiness_percent asc,
      calculated_due_date asc nulls first,
      stale_days desc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  ) f
  left join public.nav_user_profiles owner_profile on owner_profile.id = f.calculated_owner_id
  left join public.nav_user_profiles manager_profile on manager_profile.id = f.manager_id
  left join public.nav_user_profiles seller_spn on seller_spn.id = f.seller_spn_id
  left join public.nav_user_profiles buyer_spn on buyer_spn.id = f.buyer_spn_id;

  with items as (
    select value as item
    from jsonb_array_elements(v_items)
  )
  select jsonb_build_object(
    'real_deals', count(*)::int,
    'needs_manager_attention', count(*) filter (where (item ->> 'needs_manager_attention')::boolean)::int,
    'without_manager', count(*) filter (where item ->> 'manager_id' is null and item ->> 'manager_exception_reason' is null)::int,
    'without_spn', count(*) filter (where item ->> 'responsible_spn_id' is null)::int,
    'lawyer_waiting', count(*) filter (where item ->> 'lawyer_assignment_state' = 'waiting_assignment')::int,
    'broker_waiting', count(*) filter (where item ->> 'broker_assignment_state' = 'waiting_assignment')::int,
    'with_blocking_risk', count(*) filter (where (item ->> 'blocking_risks_count')::int > 0)::int,
    'with_overdue_required_document', count(*) filter (where (item ->> 'overdue_required_documents_count')::int > 0)::int,
    'with_overdue_task', count(*) filter (where (item ->> 'overdue_tasks_count')::int > 0)::int,
    'without_complete_next_action', count(*) filter (
      where item ->> 'next_action' is null
        or item ->> 'next_action_due_date' is null
        or (item ->> 'next_action_owner_id' is null and item ->> 'next_action_owner_role' is null)
    )::int,
    'legacy_deposit_green', count(*) filter (where (item ->> 'legacy_readiness_deposit_percent')::int >= 80)::int,
    'operational_green', count(*) filter (where (item ->> 'operational_readiness_percent')::int >= 80)::int,
    'legacy_green_but_operational_blocked', count(*) filter (
      where (item ->> 'legacy_readiness_deposit_percent')::int >= 80
        and (item ->> 'operational_readiness_percent')::int < 80
    )::int,
    'average_legacy_deposit_percent', coalesce(round(avg((item ->> 'legacy_readiness_deposit_percent')::numeric), 1), 0),
    'average_operational_readiness_percent', coalesce(round(avg((item ->> 'operational_readiness_percent')::numeric), 1), 0)
  )
  into v_summary
  from items;

  with items as (
    select value as item
    from jsonb_array_elements(v_items)
    where value ->> 'responsible_spn_id' is not null
  ), grouped as (
    select
      item ->> 'responsible_spn_id' as spn_id,
      max(item ->> 'responsible_spn_name') as spn_name,
      count(*)::int as deals_count,
      count(*) filter (where (item ->> 'needs_manager_attention')::boolean)::int as attention_count,
      count(*) filter (where (item ->> 'overdue_tasks_count')::int > 0)::int as overdue_count
    from items
    group by item ->> 'responsible_spn_id'
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by attention_count desc, deals_count desc, spn_name), '[]'::jsonb)
  into v_spn_workload
  from grouped;

  return jsonb_build_object(
    'profile', v_profile,
    'preview_only', true,
    'generated_at', now(),
    'summary', v_summary,
    'spn_workload', v_spn_workload,
    'items', v_items
  );
end;
$function$;

revoke all on function public.nav_v2_get_operational_readiness_preview(integer) from public;
revoke execute on function public.nav_v2_get_operational_readiness_preview(integer) from anon;
grant execute on function public.nav_v2_get_operational_readiness_preview(integer) to authenticated, service_role;

comment on function public.nav_v2_get_operational_readiness_preview(integer) is
  'Read-only operational readiness and manager queue preview for real Navigator v2 deals; never mutates deal data.';

do $migration$
declare
  v_definition text;
  v_marker text;
begin
  select pg_get_functiondef('public.nav_v2_get_rpc_grant_health()'::regprocedure)
  into v_definition;

  v_marker := '(''frontend_api'', ''nav_v2_get_deals_list''),';
  if position(v_marker in v_definition) = 0 then
    raise exception 'RPC grant health marker not found';
  end if;

  if position('nav_v2_get_operational_readiness_preview' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      v_marker,
      v_marker || E'\n      (''frontend_api'', ''nav_v2_get_operational_readiness_preview''),'
    );
    execute v_definition;
  end if;

  select pg_get_functiondef('public.nav_v2_get_frontend_rpc_coverage_health()'::regprocedure)
  into v_definition;

  v_marker := '(''nav_v2_get_deals_list'', ''dashboard/deals/spn/admin/system''),';
  if position(v_marker in v_definition) = 0 then
    raise exception 'Frontend RPC coverage marker not found';
  end if;

  if position('nav_v2_get_operational_readiness_preview' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      v_marker,
      v_marker || E'\n      (''nav_v2_get_operational_readiness_preview'', ''manager operational queue''),'
    );
    execute v_definition;
  end if;
end
$migration$;

notify pgrst, 'reload schema';
