create or replace function public.nav_v2_get_deal_responsibility_snapshot(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_deal public.nav_deals_v2%rowtype;
  v_seller_spn jsonb;
  v_buyer_spn jsonb;
  v_lawyer jsonb;
  v_manager jsonb;
  v_broker jsonb;
  v_client_docs int := 0;
  v_legal_docs int := 0;
  v_client_tasks int := 0;
  v_legal_tasks int := 0;
  v_broker_tasks int := 0;
  v_client_owner_text text;
  v_legal_owner_text text;
begin
  if v_uid is null and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Требуется авторизация';
  end if;

  if not public.nav_v2_can_view_deal(p_deal_id, v_uid) then
    raise exception 'Нет доступа к сделке';
  end if;

  select * into v_deal
  from public.nav_deals_v2
  where id = p_deal_id;

  if not found then
    raise exception 'Сделка не найдена';
  end if;

  select jsonb_build_object('id', p.id, 'name', coalesce(p.full_name, p.email, 'СПН'), 'phone', p.phone)
  into v_seller_spn
  from public.nav_user_profiles p
  where p.id = v_deal.seller_spn_id;

  select jsonb_build_object('id', p.id, 'name', coalesce(p.full_name, p.email, 'СПН'), 'phone', p.phone)
  into v_buyer_spn
  from public.nav_user_profiles p
  where p.id = v_deal.buyer_spn_id;

  select jsonb_build_object('id', p.id, 'name', coalesce(p.full_name, p.email, 'Юрист'), 'phone', p.phone)
  into v_lawyer
  from public.nav_user_profiles p
  where p.id = v_deal.lawyer_id;

  select jsonb_build_object('id', p.id, 'name', coalesce(p.full_name, p.email, 'Менеджер'), 'phone', p.phone)
  into v_manager
  from public.nav_user_profiles p
  where p.id = v_deal.manager_id;

  select jsonb_build_object('id', p.id, 'name', coalesce(p.full_name, p.email, 'Брокер'), 'phone', p.phone)
  into v_broker
  from public.nav_user_profiles p
  where p.id = v_deal.broker_id;

  select count(*) into v_client_docs
  from public.nav_deal_documents_v2 d
  where d.deal_id = p_deal_id
    and coalesce(d.status, 'needed') not in ('checked', 'not_required')
    and (
      d.responsible_role = 'spn'::public.nav_v2_user_role
      or d.side in ('seller'::public.nav_v2_side, 'buyer'::public.nav_v2_side)
    );

  select count(*) into v_legal_docs
  from public.nav_deal_documents_v2 d
  where d.deal_id = p_deal_id
    and coalesce(d.status, 'needed') not in ('checked', 'not_required')
    and d.responsible_role = 'lawyer'::public.nav_v2_user_role;

  select count(*) into v_client_tasks
  from public.nav_deal_tasks_v2 t
  where t.deal_id = p_deal_id
    and t.status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)
    and t.assigned_role = 'spn'::public.nav_v2_user_role;

  select count(*) into v_legal_tasks
  from public.nav_deal_tasks_v2 t
  where t.deal_id = p_deal_id
    and t.status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)
    and t.assigned_role = 'lawyer'::public.nav_v2_user_role;

  select count(*) into v_broker_tasks
  from public.nav_deal_tasks_v2 t
  where t.deal_id = p_deal_id
    and t.status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)
    and t.assigned_role = 'broker'::public.nav_v2_user_role;

  v_client_owner_text := case
    when v_deal.seller_spn_id is not null and v_deal.buyer_spn_id is not null and v_deal.seller_spn_id = v_deal.buyer_spn_id
      then coalesce(v_seller_spn->>'name', 'СПН') || ' ведёт продавца и покупателя'
    when v_deal.seller_spn_id is not null and v_deal.buyer_spn_id is not null
      then coalesce(v_seller_spn->>'name', 'СПН продавца') || ' ведёт продавца; ' || coalesce(v_buyer_spn->>'name', 'СПН покупателя') || ' ведёт покупателя'
    when v_deal.seller_spn_id is not null
      then coalesce(v_seller_spn->>'name', 'СПН') || ' ведёт продавца'
    when v_deal.buyer_spn_id is not null
      then coalesce(v_buyer_spn->>'name', 'СПН') || ' ведёт покупателя'
    else 'СПН по клиентам не назначен'
  end;

  v_legal_owner_text := case
    when v_deal.lawyer_id is not null then coalesce(v_lawyer->>'name', 'Юрист') || ' отвечает за юридическую оценку, риски и договоры'
    when v_deal.lawyer_needed then 'Юрист нужен, но ещё не назначен'
    else 'Юрист подключается при наличии юридических рисков или подготовки договора'
  end;

  return jsonb_build_object(
    'deal_id', p_deal_id,
    'policy_version', '2026-06-25-spn-client-owner',
    'client_owner_role', 'spn',
    'legal_owner_role', 'lawyer',
    'broker_owner_role', 'broker',
    'client_owner_text', v_client_owner_text,
    'legal_owner_text', v_legal_owner_text,
    'manager', v_manager,
    'seller_spn', v_seller_spn,
    'buyer_spn', v_buyer_spn,
    'lawyer', v_lawyer,
    'broker', v_broker,
    'handoff_contract', jsonb_build_object(
      'spn_must_provide', jsonb_build_array(
        'данные продавца',
        'данные покупателя',
        'данные объекта',
        'условия задатка',
        'условия сделки',
        'условия расчетов',
        'расходы сторон',
        'известные документы и стоп-факторы'
      ),
      'lawyer_must_provide', jsonb_build_array(
        'оценку юридических рисков',
        'перечень недостающих данных и документов',
        'позицию по предварительному договору',
        'позицию по основному договору',
        'юридические ограничения и стоп-факторы'
      ),
      'spn_after_lawyer', jsonb_build_array(
        'запрашивает недостающее у клиентов',
        'передает клиентам информацию юриста понятным языком',
        'возвращает юристу обновленные данные',
        'контролирует коммуникацию до задатка и сделки'
      )
    ),
    'open_counts', jsonb_build_object(
      'client_documents', v_client_docs,
      'legal_documents', v_legal_docs,
      'client_tasks', v_client_tasks,
      'legal_tasks', v_legal_tasks,
      'broker_tasks', v_broker_tasks
    ),
    'next_handoff_action', case
      when v_client_docs + v_client_tasks > 0 then 'СПН собирает и уточняет данные у продавца/покупателя'
      when v_legal_docs + v_legal_tasks > 0 then 'Юрист проверяет риски, документы и договорную часть'
      when v_broker_tasks > 0 then 'Брокер уточняет ипотеку/финансирование, СПН держит связь с клиентом'
      else 'СПН поддерживает коммуникацию с клиентами и контролирует актуальность условий'
    end
  );
end;
$$;

revoke all on function public.nav_v2_get_deal_responsibility_snapshot(uuid) from public;
revoke all on function public.nav_v2_get_deal_responsibility_snapshot(uuid) from anon;
grant execute on function public.nav_v2_get_deal_responsibility_snapshot(uuid) to authenticated, service_role;
