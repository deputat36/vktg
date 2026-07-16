-- REPOSITORY-ONLY PROTOTYPE.
-- Do not apply to production without the authenticated regression gate or an explicit owner decision.
-- Public signature is intentionally unchanged.

create or replace function nav_v2_private.nav_v2_lite_object_label(p_object_type text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case coalesce(nullif(trim(p_object_type), ''), '')
    when 'flat_mkd' then 'Квартира в МКД'
    when 'flat_ground' then 'Квартира на земле'
    when 'room' then 'Комната'
    when 'share' then 'Доля'
    when 'share_room' then 'Доля / комната'
    when 'house_land' then 'Дом с участком'
    when 'house' then 'Дом'
    when 'land' then 'Земельный участок'
    when 'new_building' then 'Новостройка'
    when 'commercial' then 'Коммерческий объект'
    else 'Объект'
  end;
$$;

create or replace function nav_v2_private.nav_v2_lite_mask_address(p_address text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(trim(both ' ,;.-' from regexp_replace(
    coalesce(p_address, ''),
    '(,\s*|\s+)(кв(артира)?|оф(ис)?|пом(ещение)?|комн(ата)?|апарт(аменты)?)\.?\s*(№|#)?\s*[^,;]+.*$',
    '',
    'i'
  )), '');
$$;

create or replace function nav_v2_private.nav_v2_lite_reference(
  p_deal_id uuid,
  p_object_type text,
  p_address text,
  p_demo boolean default false
)
returns text
language sql
immutable
set search_path = pg_catalog, nav_v2_private
as $$
  select concat(
    case when coalesce(p_demo, false) then 'ДЕМО: ' else '' end,
    nav_v2_private.nav_v2_lite_object_label(p_object_type),
    ' — ',
    coalesce(nav_v2_private.nav_v2_lite_mask_address(p_address), 'ориентир уточняется'),
    ' · ',
    upper(left(coalesce(p_deal_id::text, 'БЕЗ-КОДА'), 8))
  );
$$;

create or replace function public.nav_v2_get_deal_card_lite(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private
as $$
declare
  v_uid uuid := auth.uid();
  v_is_service boolean := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role';
  v_deal jsonb;
  v_documents jsonb;
  v_tasks jsonb;
  v_risks jsonb;
begin
  if v_uid is null and not v_is_service then
    raise exception 'Требуется авторизация' using errcode = '42501';
  end if;

  if not v_is_service and not nav_v2_private.nav_v2_can_view_deal(p_deal_id, v_uid) then
    raise exception 'Нет доступа к сделке' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', d.id,
    'title', nav_v2_private.nav_v2_lite_reference(
      d.id,
      d.object_type,
      d.address,
      coalesce(d.title like 'ДЕМО:%', false)
    ),
    'display_title', nav_v2_private.nav_v2_lite_reference(
      d.id,
      d.object_type,
      d.address,
      coalesce(d.title like 'ДЕМО:%', false)
    ),
    'status', d.status,
    'risk_level', d.risk_level,
    'object_type', d.object_type,
    'address', nav_v2_private.nav_v2_lite_mask_address(d.address),
    'price_total', d.price_total,
    'settlements_agreed', d.settlements_agreed,
    'created_at', d.created_at
  )
  into v_deal
  from public.nav_deals_v2 d
  where d.id = p_deal_id;

  if v_deal is null then
    raise exception 'Сделка не найдена' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'title', case d.side
      when 'seller' then 'Документ продавца'
      when 'buyer' then 'Документ покупателя'
      else 'Документ по сделке'
    end,
    'status', d.status,
    'side', d.side,
    'is_required', d.is_required,
    'responsible_role', d.responsible_role,
    'due_date', d.due_date,
    'can_change_status', case
      when v_is_service then true
      else public.nav_v2_can_change_document_status(d.id, null, v_uid)
    end,
    'can_mark_received', case
      when v_is_service then true
      else public.nav_v2_can_change_document_status(d.id, 'received', v_uid)
    end,
    'can_mark_checked', case
      when v_is_service then true
      else public.nav_v2_can_change_document_status(d.id, 'checked', v_uid)
    end,
    'can_mark_problem', case
      when v_is_service then true
      else public.nav_v2_can_change_document_status(d.id, 'problem', v_uid)
    end
  ) order by d.is_required desc, d.side, d.created_at), '[]'::jsonb)
  into v_documents
  from public.nav_deal_documents_v2 d
  where d.deal_id = p_deal_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'title', 'Задача по сделке',
    'status', t.status,
    'priority', t.priority,
    'assigned_role', t.assigned_role,
    'due_date', t.due_date,
    'can_change_status', case
      when v_is_service then true
      else public.nav_v2_can_change_task_status(t.id, v_uid)
    end
  ) order by t.created_at desc), '[]'::jsonb)
  into v_tasks
  from public.nav_deal_tasks_v2 t
  where t.deal_id = p_deal_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'title', 'Риск сделки',
    'level', r.level,
    'is_resolved', r.is_resolved,
    'blocks_deposit', r.blocks_deposit,
    'blocks_deal', r.blocks_deal
  ) order by r.is_resolved, r.level desc, r.created_at), '[]'::jsonb)
  into v_risks
  from public.nav_deal_risks_v2 r
  where r.deal_id = p_deal_id;

  return jsonb_build_object(
    'deal', v_deal,
    'documents', v_documents,
    'tasks', v_tasks,
    'risks', v_risks,
    'comments', jsonb_build_array(),
    'lite', true,
    'dto_version', 1
  );
end;
$$;

-- Existing EXECUTE grants, ownership and public signature are intentionally not changed in this prototype.
