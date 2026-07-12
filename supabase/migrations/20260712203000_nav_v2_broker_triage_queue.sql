create or replace function public.nav_v2_get_broker_queue_preview(
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

  if v_role not in ('owner', 'admin', 'manager', 'broker') then
    raise exception 'Брокерская очередь доступна брокеру, менеджеру и администратору' using errcode = '42501';
  end if;

  with scoped_deals as (
    select
      d.*,
      coalesce(d.wizard_snapshot -> 'deal', '{}'::jsonb) as finance_data
    from public.nav_deals_v2 d
    where d.broker_needed is true
      and not (
        coalesce((d.deal_summary ->> 'demo') = 'true', false)
        or coalesce((d.wizard_snapshot ->> 'demo') = 'true', false)
        or coalesce(d.title, '') like 'ДЕМО:%'
      )
      and nav_v2_private.nav_v2_can_view_deal(d.id, v_uid)
  ), prepared as (
    select
      d.id as deal_id,
      d.title,
      d.address,
      d.status,
      d.risk_level,
      d.price_total,
      d.broker_id,
      broker.full_name as broker_name,
      d.manager_id,
      manager.full_name as manager_name,
      d.seller_spn_id,
      seller_spn.full_name as seller_spn_name,
      d.buyer_spn_id,
      buyer_spn.full_name as buyer_spn_name,
      nullif(trim(d.finance_data ->> 'buyerMode'), '') as buyer_mode,
      nullif(trim(d.finance_data ->> 'buyerNeededAmount'), '') as buyer_needed_amount,
      nullif(trim(d.finance_data ->> 'buyerInitialAmount'), '') as buyer_initial_amount,
      nullif(trim(d.finance_data ->> 'moneyReadyDate'), '') as money_ready_date,
      nullif(trim(d.finance_data ->> 'buyerReadyDate'), '') as buyer_ready_date,
      nullif(trim(d.finance_data ->> 'certificateType'), '') as certificate_type,
      nullif(trim(d.finance_data ->> 'certificateAmount'), '') as certificate_amount,
      nullif(trim(d.finance_data ->> 'certificateDeadline'), '') as certificate_deadline,
      nullif(trim(d.finance_data ->> 'matcapAmount'), '') as matcap_amount,
      nullif(trim(d.finance_data ->> 'bankServiceFee'), '') as bank_service_fee,
      coalesce((d.finance_data ->> 'settlementsAgreed')::boolean, false) as settlements_agreed,
      nullif(trim(d.finance_data ->> 'settlementsComment'), '') as settlements_comment,
      task.id as task_id,
      task.title as task_title,
      task.priority as task_priority,
      task.status as task_status,
      task.due_date as task_due_date,
      task.updated_at as task_updated_at,
      coalesce(task.due_date < current_date, false) as task_overdue,
      array_remove(array[
        case when nullif(trim(d.finance_data ->> 'buyerMode'), '') is null then 'Не указан сценарий финансирования' end,
        case when nullif(trim(d.finance_data ->> 'buyerNeededAmount'), '') is null then 'Не указана требуемая сумма финансирования' end,
        case when nullif(trim(d.finance_data ->> 'buyerInitialAmount'), '') is null then 'Не указан первоначальный взнос' end,
        case when coalesce(
          nullif(trim(d.finance_data ->> 'moneyReadyDate'), ''),
          nullif(trim(d.finance_data ->> 'buyerReadyDate'), '')
        ) is null then 'Не указан срок готовности денежных средств' end,
        case when nullif(trim(d.finance_data ->> 'certificateType'), '') is not null
          and nullif(trim(d.finance_data ->> 'certificateAmount'), '') is null
          then 'Не указана сумма сертификата' end,
        case when nullif(trim(d.finance_data ->> 'certificateType'), '') is not null
          and nullif(trim(d.finance_data ->> 'certificateDeadline'), '') is null
          then 'Не указан срок сертификата' end,
        case when d.broker_id is null then 'Брокер не назначен' end,
        case when task.id is null then 'Не создана брокерская задача' end
      ], null::text) as missing_finance_data
    from scoped_deals d
    left join public.nav_user_profiles broker on broker.id = d.broker_id
    left join public.nav_user_profiles manager on manager.id = d.manager_id
    left join public.nav_user_profiles seller_spn on seller_spn.id = d.seller_spn_id
    left join public.nav_user_profiles buyer_spn on buyer_spn.id = d.buyer_spn_id
    left join lateral (
      select t.id, t.title, t.priority, t.status, t.due_date, t.updated_at
      from public.nav_deal_tasks_v2 t
      where t.deal_id = d.id
        and t.status in ('open', 'in_progress')
        and (t.source = 'auto_broker' or t.assigned_role = 'broker')
      order by
        case t.priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,
        t.due_date asc nulls last,
        t.created_at asc
      limit 1
    ) task on true
  ), scored as (
    select
      p.*,
      case p.buyer_mode
        when 'cash' then 'Собственные средства'
        when 'mortgage' then 'Ипотека'
        when 'certificate' then 'Сертификат'
        when 'matcap' then 'Материнский капитал'
        when 'multiple' then 'Смешанное финансирование'
        else coalesce(p.buyer_mode, 'Сценарий не указан')
      end as funding_scenario_label,
      case
        when p.broker_id is null then 'waiting_assignment'
        when cardinality(p.missing_finance_data) > 0 then 'collecting_data'
        else 'ready_for_review'
      end as triage_status,
      case
        when p.broker_id is null then 'Назначить брокера'
        when cardinality(p.missing_finance_data) > 0 then 'Уточнить финансовые данные'
        when p.task_id is not null then coalesce(p.task_title, 'Проверить финансовый сценарий')
        else 'Проверить финансовый сценарий'
      end as next_action,
      least(100,
        case when p.broker_id is null then 40 else 0 end
        + case when p.task_overdue then 25 else 0 end
        + least(25, cardinality(p.missing_finance_data) * 5)
        + case
            when p.certificate_deadline ~ '^\d{4}-\d{2}-\d{2}$'
              and p.certificate_deadline::date <= current_date + 7
            then 10
            else 0
          end
      ) as urgency_score
    from prepared p
  ), limited as (
    select *
    from scored
    order by
      urgency_score desc,
      task_overdue desc,
      task_due_date asc nulls last,
      title asc nulls last
    limit greatest(1, least(coalesce(p_limit, 100), 300))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'deal_id', l.deal_id,
    'title', l.title,
    'address', l.address,
    'status', l.status,
    'risk_level', l.risk_level,
    'price_total', l.price_total,
    'broker_id', l.broker_id,
    'broker_name', l.broker_name,
    'manager_id', l.manager_id,
    'manager_name', l.manager_name,
    'seller_spn_id', l.seller_spn_id,
    'seller_spn_name', l.seller_spn_name,
    'buyer_spn_id', l.buyer_spn_id,
    'buyer_spn_name', l.buyer_spn_name,
    'buyer_mode', l.buyer_mode,
    'funding_scenario_label', l.funding_scenario_label,
    'buyer_needed_amount', l.buyer_needed_amount,
    'buyer_initial_amount', l.buyer_initial_amount,
    'money_ready_date', l.money_ready_date,
    'buyer_ready_date', l.buyer_ready_date,
    'certificate_type', l.certificate_type,
    'certificate_amount', l.certificate_amount,
    'certificate_deadline', l.certificate_deadline,
    'matcap_amount', l.matcap_amount,
    'bank_service_fee', l.bank_service_fee,
    'settlements_agreed', l.settlements_agreed,
    'settlements_comment', l.settlements_comment,
    'task_id', l.task_id,
    'task_title', l.task_title,
    'task_priority', l.task_priority,
    'task_status', l.task_status,
    'task_due_date', l.task_due_date,
    'task_overdue', l.task_overdue,
    'missing_finance_data', to_jsonb(l.missing_finance_data),
    'triage_status', l.triage_status,
    'next_action', l.next_action,
    'urgency_score', l.urgency_score,
    'card_url', format('./deal-card-v2.html?id=%s', l.deal_id)
  ) order by
    l.urgency_score desc,
    l.task_overdue desc,
    l.task_due_date asc nulls last,
    l.title asc nulls last), '[]'::jsonb)
  into v_items
  from limited l;

  with items as (
    select value as item
    from jsonb_array_elements(v_items)
  )
  select jsonb_build_object(
    'total', count(*)::int,
    'waiting_assignment', count(*) filter (where item ->> 'triage_status' = 'waiting_assignment')::int,
    'collecting_data', count(*) filter (where item ->> 'triage_status' = 'collecting_data')::int,
    'ready_for_review', count(*) filter (where item ->> 'triage_status' = 'ready_for_review')::int,
    'overdue_tasks', count(*) filter (where coalesce((item ->> 'task_overdue')::boolean, false))::int,
    'with_certificate', count(*) filter (where nullif(item ->> 'certificate_type', '') is not null)::int,
    'with_matcap', count(*) filter (where nullif(item ->> 'matcap_amount', '') is not null)::int
  )
  into v_summary
  from items;

  return jsonb_build_object(
    'profile', v_profile,
    'preview_only', true,
    'generated_at', now(),
    'summary', v_summary,
    'items', v_items,
    'data_contract', jsonb_build_object(
      'available', jsonb_build_array(
        'сценарий финансирования',
        'требуемая сумма',
        'первоначальный взнос',
        'готовность денег',
        'сертификат',
        'материнский капитал',
        'расчёты',
        'брокерская задача'
      ),
      'not_yet_supported', jsonb_build_array(
        'банк',
        'статус банковской заявки',
        'дата подачи заявки',
        'причина отказа',
        'решение банка'
      )
    )
  );
end;
$function$;

revoke all on function public.nav_v2_get_broker_queue_preview(integer) from public;
revoke execute on function public.nav_v2_get_broker_queue_preview(integer) from anon;
grant execute on function public.nav_v2_get_broker_queue_preview(integer) to authenticated, service_role;

comment on function public.nav_v2_get_broker_queue_preview(integer) is
  'Read-only broker triage queue using existing deal access rules; does not model a bank application pipeline.';

do $migration$
declare
  v_definition text;
  v_marker text;
begin
  select pg_get_functiondef('public.nav_v2_get_rpc_grant_health()'::regprocedure)
  into v_definition;

  v_marker := '(''frontend_api'', ''nav_v2_get_task_taxonomy_preview''),';
  if position(v_marker in v_definition) = 0 then
    raise exception 'RPC grant health marker not found';
  end if;

  if position('nav_v2_get_broker_queue_preview' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      v_marker,
      v_marker || E'\n      (''frontend_api'', ''nav_v2_get_broker_queue_preview''),'
    );
    execute v_definition;
  end if;

  select pg_get_functiondef('public.nav_v2_get_frontend_rpc_coverage_health()'::regprocedure)
  into v_definition;

  v_marker := '(''nav_v2_get_task_taxonomy_preview'', ''manager task taxonomy preview''),';
  if position(v_marker in v_definition) = 0 then
    raise exception 'Frontend RPC coverage marker not found';
  end if;

  if position('nav_v2_get_broker_queue_preview' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      v_marker,
      v_marker || E'\n      (''nav_v2_get_broker_queue_preview'', ''broker triage queue''),'
    );
    execute v_definition;
  end if;
end
$migration$;

notify pgrst, 'reload schema';
