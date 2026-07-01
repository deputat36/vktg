-- Navigator v2 audit remediation: owner/admin data-quality dashboard.
-- Applied live to Supabase project ofewxuqfjhamgerwzull before being synced here.

create or replace function public.nav_v2_get_data_quality_dashboard(p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
  v_role public.nav_v2_user_role;
  v_summary jsonb;
  v_source_counts jsonb;
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  select jsonb_build_object('id', p.id, 'email', p.email, 'full_name', p.full_name, 'role', p.role), p.role
  into v_profile, v_role
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;

  if v_role not in ('owner', 'admin') then
    raise exception 'Сводка качества данных доступна только owner/admin' using errcode = '42501';
  end if;

  with task_counts as (
    select
      deal_id,
      count(*) filter (where status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)) as open_tasks_count,
      count(*) filter (where source like 'auto_quality_%' and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)) as open_quality_tasks_count,
      count(*) filter (where source like 'auto_quality_%' and priority = 'urgent'::public.nav_v2_task_priority and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)) as urgent_quality_tasks_count
    from public.nav_deal_tasks_v2
    group by deal_id
  ), deals as (
    select
      d.*,
      coalesce(t.open_tasks_count, 0) as open_tasks_count,
      coalesce(t.open_quality_tasks_count, 0) as open_quality_tasks_count,
      coalesce(t.urgent_quality_tasks_count, 0) as urgent_quality_tasks_count,
      coalesce((d.deal_summary ->> 'demo') = 'true', false) or coalesce((d.wizard_snapshot ->> 'demo') = 'true', false) or coalesce(d.title, '') like 'ДЕМО:%' as is_demo,
      nullif(trim(coalesce(d.seller_name, '')), '') is null as missing_seller,
      nullif(trim(coalesce(d.buyer_name, '')), '') is null as missing_buyer,
      nullif(trim(coalesce(d.address, '')), '') is null as missing_address,
      d.seller_spn_id is null and d.buyer_spn_id is null as without_spn,
      d.lawyer_needed is true and d.lawyer_id is null as lawyer_unassigned,
      d.broker_needed is true and d.broker_id is null as broker_unassigned
    from public.nav_deals_v2 d
    left join task_counts t on t.deal_id = d.id
  ), scored as (
    select
      d.*,
      ((missing_seller::int) + (missing_buyer::int) + (missing_address::int) + (without_spn::int) + (lawyer_unassigned::int) + (broker_unassigned::int) + least(open_quality_tasks_count::int, 1)) as issue_count
    from deals d
  )
  select jsonb_build_object(
    'total_deals', count(*)::int,
    'real_deals', count(*) filter (where is_demo is not true)::int,
    'demo_deals', count(*) filter (where is_demo is true)::int,
    'deals_with_issues', count(*) filter (where issue_count > 0)::int,
    'missing_seller', count(*) filter (where missing_seller)::int,
    'missing_buyer', count(*) filter (where missing_buyer)::int,
    'missing_address', count(*) filter (where missing_address)::int,
    'without_spn', count(*) filter (where without_spn)::int,
    'lawyer_unassigned', count(*) filter (where lawyer_unassigned)::int,
    'broker_unassigned', count(*) filter (where broker_unassigned)::int,
    'open_quality_tasks', coalesce(sum(open_quality_tasks_count), 0)::int,
    'urgent_quality_tasks', coalesce(sum(urgent_quality_tasks_count), 0)::int,
    'open_tasks', coalesce(sum(open_tasks_count), 0)::int
  )
  into v_summary
  from scored;

  select coalesce(jsonb_agg(jsonb_build_object('source', source, 'status', status, 'priority', priority, 'count', count) order by source, status, priority), '[]'::jsonb)
  into v_source_counts
  from (
    select source, status, priority, count(*)::int as count
    from public.nav_deal_tasks_v2
    where source like 'auto_quality_%'
    group by source, status, priority
  ) s;

  with task_counts as (
    select
      deal_id,
      count(*) filter (where status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)) as open_tasks_count,
      count(*) filter (where source like 'auto_quality_%' and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)) as open_quality_tasks_count,
      count(*) filter (where source like 'auto_quality_%' and priority = 'urgent'::public.nav_v2_task_priority and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)) as urgent_quality_tasks_count
    from public.nav_deal_tasks_v2
    group by deal_id
  ), deals as (
    select
      d.*,
      coalesce(t.open_tasks_count, 0) as open_tasks_count,
      coalesce(t.open_quality_tasks_count, 0) as open_quality_tasks_count,
      coalesce(t.urgent_quality_tasks_count, 0) as urgent_quality_tasks_count,
      coalesce((d.deal_summary ->> 'demo') = 'true', false) or coalesce((d.wizard_snapshot ->> 'demo') = 'true', false) or coalesce(d.title, '') like 'ДЕМО:%' as is_demo,
      nullif(trim(coalesce(d.seller_name, '')), '') is null as missing_seller,
      nullif(trim(coalesce(d.buyer_name, '')), '') is null as missing_buyer,
      nullif(trim(coalesce(d.address, '')), '') is null as missing_address,
      d.seller_spn_id is null and d.buyer_spn_id is null as without_spn,
      d.lawyer_needed is true and d.lawyer_id is null as lawyer_unassigned,
      d.broker_needed is true and d.broker_id is null as broker_unassigned
    from public.nav_deals_v2 d
    left join task_counts t on t.deal_id = d.id
  ), scored as (
    select
      d.*,
      ((missing_seller::int) + (missing_buyer::int) + (missing_address::int) + (without_spn::int) + (lawyer_unassigned::int) + (broker_unassigned::int) + least(open_quality_tasks_count::int, 1)) as issue_count
    from deals d
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'title', case
      when s.title is null or s.title ilike '%Продавец не указан%' or s.title ilike '%Покупатель не указан%' or s.title ilike '%адрес не указан%'
      then concat_ws(' — ',
        case s.object_type
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
        coalesce(nullif(trim(s.address), ''), 'адрес уточняется')
      )
      else s.title
    end,
    'status', s.status,
    'risk_level', s.risk_level,
    'object_type', s.object_type,
    'address', s.address,
    'updated_at', s.updated_at,
    'is_demo', s.is_demo,
    'issue_count', s.issue_count,
    'open_quality_tasks_count', s.open_quality_tasks_count,
    'urgent_quality_tasks_count', s.urgent_quality_tasks_count,
    'open_tasks_count', s.open_tasks_count,
    'missing_seller', s.missing_seller,
    'missing_buyer', s.missing_buyer,
    'missing_address', s.missing_address,
    'without_spn', s.without_spn,
    'lawyer_unassigned', s.lawyer_unassigned,
    'broker_unassigned', s.broker_unassigned,
    'seller_spn', seller.full_name,
    'buyer_spn', buyer.full_name,
    'manager', manager.full_name,
    'lawyer', lawyer.full_name,
    'broker', broker.full_name
  ) order by s.issue_count desc, s.urgent_quality_tasks_count desc, s.updated_at desc), '[]'::jsonb)
  into v_items
  from (
    select *
    from scored
    where issue_count > 0
    order by issue_count desc, urgent_quality_tasks_count desc, updated_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ) s
  left join public.nav_user_profiles seller on seller.id = s.seller_spn_id
  left join public.nav_user_profiles buyer on buyer.id = s.buyer_spn_id
  left join public.nav_user_profiles manager on manager.id = s.manager_id
  left join public.nav_user_profiles lawyer on lawyer.id = s.lawyer_id
  left join public.nav_user_profiles broker on broker.id = s.broker_id;

  return jsonb_build_object('profile', v_profile, 'summary', v_summary, 'source_counts', v_source_counts, 'items', v_items);
end;
$$;

revoke execute on function public.nav_v2_get_data_quality_dashboard(integer) from anon, public;
grant execute on function public.nav_v2_get_data_quality_dashboard(integer) to authenticated;

-- Keep the owner/admin RPC-grant health check aware of this intentional public RPC.
create or replace function public.nav_v2_get_rpc_grant_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_items jsonb;
  v_missing_authenticated_count integer := 0;
  v_anon_open_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор';
  end if;

  select role into v_role
  from public.nav_user_profiles
  where id = v_uid
    and is_active is true;

  if v_role not in ('owner', 'admin') then
    raise exception 'Проверка RPC grants доступна только owner/admin';
  end if;

  with expected(title, signature) as (
    values
      ('Профиль', 'public.nav_v2_get_my_profile()'),
      ('Рабочий стол', 'public.nav_v2_get_dashboard()'),
      ('Список сделок', 'public.nav_v2_get_deals_list(integer)'),
      ('Карточка сделки', 'public.nav_v2_get_deal_card(uuid)'),
      ('Легкая карточка сделки', 'public.nav_v2_get_deal_card_lite(uuid)'),
      ('Качество данных', 'public.nav_v2_get_data_quality_dashboard(integer)'),
      ('Ответственные по сделке', 'public.nav_v2_get_deal_responsibility_snapshot(uuid)'),
      ('Варианты статусов сделки', 'public.nav_v2_get_deal_status_options(uuid)'),
      ('Handoff scores', 'public.nav_v2_get_handoff_scores(jsonb)'),
      ('Юридическая очередь', 'public.nav_v2_get_lawyer_queue(integer)'),
      ('Сводка юриста', 'public.nav_v2_get_lawyer_review_summary()'),
      ('Команда', 'public.nav_v2_list_users()'),
      ('Аудит доступов', 'public.nav_v2_get_access_audit()'),
      ('Создание сделки', 'public.nav_v2_save_wizard_result(jsonb)'),
      ('Комментарий', 'public.nav_v2_add_comment(uuid, text, text)'),
      ('Ревью сделки', 'public.nav_v2_add_deal_review(uuid, text, text, boolean, boolean)'),
      ('Документ', 'public.nav_v2_add_document(uuid, nav_v2_side, text, text, boolean, boolean, text, text)'),
      ('Расход', 'public.nav_v2_add_expense(uuid, nav_v2_side, text, text, numeric, text, boolean, boolean, boolean, text)'),
      ('Риск', 'public.nav_v2_add_risk(uuid, nav_v2_risk_level, text, text, text, text, boolean, boolean, nav_v2_user_role)'),
      ('Задача', 'public.nav_v2_add_task(uuid, text, text, nav_v2_user_role, nav_v2_task_priority, text)'),
      ('Статус сделки', 'public.nav_v2_update_deal_status(uuid, nav_v2_deal_status)'),
      ('Стороны сделки', 'public.nav_v2_update_deal_parties(uuid, text, text, text, text, text)'),
      ('Статус документа', 'public.nav_v2_update_document_status(uuid, text)'),
      ('Назначение документа', 'public.nav_v2_update_document_assignment(uuid, uuid, nav_v2_user_role, date, boolean, boolean)'),
      ('Workflow документа', 'public.nav_v2_update_document_workflow(uuid, text, uuid, nav_v2_user_role, date, text)'),
      ('Статус задачи', 'public.nav_v2_update_task_status(uuid, nav_v2_task_status)'),
      ('Срок задачи', 'public.nav_v2_update_task_due_date(uuid, date)'),
      ('Профиль пользователя', 'public.nav_v2_update_user_profile(uuid, text, nav_v2_user_role, uuid, text, boolean)'),
      ('Связать пользователя', 'public.nav_v2_link_user_by_email(text, text, nav_v2_user_role, uuid, text)'),
      ('Возврат СПН', 'public.nav_v2_return_spn_rework(uuid, text)'),
      ('Отправка доработки СПН', 'public.nav_v2_submit_spn_rework(uuid, text)')
  ), resolved as (
    select title, signature, to_regprocedure(signature) as oid
    from expected
  ), checked as (
    select
      title,
      signature,
      oid is not null as exists_in_db,
      case when oid is null then false else has_function_privilege('authenticated', oid, 'EXECUTE') end as authenticated_can_execute,
      case when oid is null then false else has_function_privilege('anon', oid, 'EXECUTE') end as anon_can_execute
    from resolved
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'title', title,
      'signature', signature,
      'exists_in_db', exists_in_db,
      'authenticated_can_execute', authenticated_can_execute,
      'anon_can_execute', anon_can_execute
    ) order by title), '[]'::jsonb),
    count(*) filter (where not exists_in_db or not authenticated_can_execute),
    count(*) filter (where anon_can_execute)
  into v_items, v_missing_authenticated_count, v_anon_open_count
  from checked;

  return jsonb_build_object(
    'ok', v_missing_authenticated_count = 0 and v_anon_open_count = 0,
    'missing_authenticated_count', v_missing_authenticated_count,
    'anon_open_count', v_anon_open_count,
    'items', v_items
  );
end;
$$;
