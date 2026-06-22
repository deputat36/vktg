alter table public.nav_deals_v2
  add column if not exists seller_name text,
  add column if not exists buyer_name text,
  add column if not exists seller_phone text,
  add column if not exists buyer_phone text;

update public.nav_deals_v2
set
  seller_name = coalesce(nullif(seller_name, ''), nullif(wizard_snapshot #>> '{deal,sellerName}', ''), nullif(wizard_snapshot #>> '{deal,seller_name}', '')),
  buyer_name = coalesce(nullif(buyer_name, ''), nullif(wizard_snapshot #>> '{deal,buyerName}', ''), nullif(wizard_snapshot #>> '{deal,buyer_name}', '')),
  seller_phone = coalesce(nullif(seller_phone, ''), nullif(wizard_snapshot #>> '{deal,sellerPhone}', ''), nullif(wizard_snapshot #>> '{deal,seller_phone}', '')),
  buyer_phone = coalesce(nullif(buyer_phone, ''), nullif(wizard_snapshot #>> '{deal,buyerPhone}', ''), nullif(wizard_snapshot #>> '{deal,buyer_phone}', ''));

update public.nav_deals_v2
set title = concat_ws(' — ', concat_ws(' / ', coalesce(nullif(seller_name, ''), 'Продавец не указан'), coalesce(nullif(buyer_name, ''), 'Покупатель не указан')), coalesce(nullif(address, ''), 'адрес не указан'))
where coalesce(deal_summary->>'demo','false') <> 'true'
  and coalesce(wizard_snapshot->>'demo','false') <> 'true'
  and title not like 'ДЕМО:%';

do $body$
declare
  v_sql text;
begin
  select pg_get_functiondef('public.nav_v2_save_wizard_result(jsonb)'::regprocedure) into v_sql;

  if position('v_seller_name text' in v_sql) = 0 then
    v_sql := replace(v_sql,
      $s$  v_address text := nullif(p_result->'deal'->>'address', '');$s$,
      $s$  v_address text := nullif(p_result->'deal'->>'address', '');
  v_seller_name text := nullif(coalesce(d->>'sellerName', d->>'seller_name', d->>'sellerFullName', d->>'seller_fio'), '');
  v_buyer_name text := nullif(coalesce(d->>'buyerName', d->>'buyer_name', d->>'buyerFullName', d->>'buyer_fio'), '');
  v_seller_phone text := nullif(coalesce(d->>'sellerPhone', d->>'seller_phone'), '');
  v_buyer_phone text := nullif(coalesce(d->>'buyerPhone', d->>'buyer_phone'), '');$s$);

    v_sql := replace(v_sql,
      $s$  v_title := concat_ws(' — ', coalesce(v_object_type, 'Сделка'), coalesce(v_address, 'без адреса'));$s$,
      $s$  v_title := concat_ws(' — ', concat_ws(' / ', coalesce(v_seller_name, 'Продавец не указан'), coalesce(v_buyer_name, 'Покупатель не указан')), coalesce(v_address, 'адрес не указан'));$s$);

    v_sql := replace(v_sql,
      $s$    representation_model, preparation_mode, object_type, address, cadastral_number,$s$,
      $s$    representation_model, preparation_mode, object_type, address, seller_name, buyer_name, seller_phone, buyer_phone, cadastral_number,$s$);

    v_sql := replace(v_sql,
      $s$    v_object_type, v_address, nullif(d->>'cadastralNumber',''),$s$,
      $s$    v_object_type, v_address, v_seller_name, v_buyer_name, v_seller_phone, v_buyer_phone, nullif(d->>'cadastralNumber',''),$s$);

    execute v_sql;
  end if;
end;
$body$;

do $body$
declare
  v_sql text;
begin
  select pg_get_functiondef('public.nav_v2_get_deals_list(integer)'::regprocedure) into v_sql;
  if position('''seller_name''' in v_sql) = 0 then
    v_sql := replace(v_sql,
      $s$    'address', d.address,$s$,
      $s$    'address', d.address,
    'seller_name', d.seller_name,
    'buyer_name', d.buyer_name,
    'seller_phone', d.seller_phone,
    'buyer_phone', d.buyer_phone,$s$);
    execute v_sql;
  end if;
end;
$body$;

do $body$
declare
  v_sql text;
begin
  select pg_get_functiondef('public.nav_v2_get_lawyer_queue(integer)'::regprocedure) into v_sql;
  if position('''seller_name''' in v_sql) = 0 then
    v_sql := replace(v_sql,
      $s$    'address', address,$s$,
      $s$    'address', address,
    'seller_name', seller_name,
    'buyer_name', buyer_name,
    'seller_phone', seller_phone,
    'buyer_phone', buyer_phone,$s$);
    execute v_sql;
  end if;
end;
$body$;
