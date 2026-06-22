create or replace function public.nav_v2_update_deal_parties(
  p_deal_id uuid,
  p_seller_name text default null,
  p_buyer_name text default null,
  p_seller_phone text default null,
  p_buyer_phone text default null,
  p_address text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_seller_name text := nullif(trim(coalesce(p_seller_name, '')), '');
  v_buyer_name text := nullif(trim(coalesce(p_buyer_name, '')), '');
  v_seller_phone text := nullif(trim(coalesce(p_seller_phone, '')), '');
  v_buyer_phone text := nullif(trim(coalesce(p_buyer_phone, '')), '');
  v_address text := nullif(trim(coalesce(p_address, '')), '');
  v_title text;
  v_rows integer := 0;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if p_deal_id is null then
    raise exception 'Не указана сделка' using errcode = '22023';
  end if;

  if not public.nav_v2_can_edit_deal(p_deal_id, v_uid) then
    raise exception 'Нет прав редактировать стороны сделки' using errcode = '42501';
  end if;

  v_title := concat_ws(
    ' — ',
    concat_ws(
      ' / ',
      coalesce(v_seller_name, 'Продавец не указан'),
      coalesce(v_buyer_name, 'Покупатель не указан')
    ),
    coalesce(v_address, 'адрес не указан')
  );

  update public.nav_deals_v2
  set seller_name = v_seller_name,
      buyer_name = v_buyer_name,
      seller_phone = v_seller_phone,
      buyer_phone = v_buyer_phone,
      address = v_address,
      title = v_title,
      updated_at = now()
  where id = p_deal_id;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Сделка не найдена' using errcode = 'P0002';
  end if;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    p_deal_id,
    v_uid,
    'parties_updated',
    'Стороны сделки обновлены',
    jsonb_build_object(
      'seller_name', v_seller_name,
      'buyer_name', v_buyer_name,
      'seller_phone', v_seller_phone,
      'buyer_phone', v_buyer_phone,
      'address', v_address,
      'title', v_title
    )
  );

  return jsonb_build_object(
    'ok', true,
    'deal_id', p_deal_id,
    'title', v_title,
    'seller_name', v_seller_name,
    'buyer_name', v_buyer_name,
    'seller_phone', v_seller_phone,
    'buyer_phone', v_buyer_phone,
    'address', v_address
  );
end;
$function$;
