create or replace function public.nav_save_wizard_deal(p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_deal jsonb;
  v_analysis jsonb;
  v_title text;
  v_id uuid;
  v_ready int := 0;
  v_lawyer_needed boolean := false;
  v_broker_needed boolean := false;
  v_role public.nav_user_role;
  v_object_type text;
  v_address text;
  v_price_fact text;
  v_price_contract text;
  v_representation text;
  v_decision text;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'Некорректный результат мастера: ожидался JSON-объект' using errcode = '22023';
  end if;

  if length(p_result::text) > 200000 then
    raise exception 'Некорректный результат мастера: слишком большой payload' using errcode = '22023';
  end if;

  if p_result ? 'deal' and jsonb_typeof(p_result->'deal') <> 'object' then
    raise exception 'Некорректный результат мастера: deal должен быть объектом' using errcode = '22023';
  end if;

  foreach v_decision in array array['stop', 'warn', 'actions', 'missing', 'to'] loop
    if p_result ? v_decision and jsonb_typeof(p_result->v_decision) <> 'array' then
      raise exception 'Некорректный результат мастера: поле % должно быть массивом', v_decision using errcode = '22023';
    end if;
  end loop;

  v_deal := coalesce(p_result->'deal', '{}'::jsonb);
  v_object_type := btrim(coalesce(v_deal->>'objectType', ''));
  v_address := btrim(coalesce(v_deal->>'address', ''));
  v_price_fact := nullif(btrim(coalesce(v_deal->>'priceFact', '')), '');
  v_price_contract := nullif(btrim(coalesce(v_deal->>'priceContract', '')), '');
  v_representation := coalesce(nullif(btrim(v_deal->>'representation'), ''), 'both');
  v_decision := nullif(btrim(coalesce(p_result->>'decision', '')), '');

  select role
  into v_role
  from public.nav_profiles
  where id = v_uid and is_active = true
  limit 1;

  if v_role is null then
    raise exception 'Нет активного профиля пользователя в nav_profiles' using errcode = '42501';
  end if;

  if not public.nav_can_create_deal(v_uid) then
    raise exception 'Недостаточно прав для создания сделки' using errcode = '42501';
  end if;

  if v_object_type = '' then
    raise exception 'Укажите тип объекта' using errcode = '22023';
  end if;

  if v_address = '' then
    raise exception 'Укажите адрес объекта' using errcode = '22023';
  end if;

  if p_result ? 'ready' then
    if coalesce(p_result->>'ready','') !~ '^[0-9]+$' then
      raise exception 'Готовность сделки должна быть числом от 0 до 100' using errcode = '22023';
    end if;

    v_ready := (p_result->>'ready')::int;

    if v_ready < 0 or v_ready > 100 then
      raise exception 'Готовность сделки должна быть числом от 0 до 100' using errcode = '22023';
    end if;
  end if;

  if v_price_fact is not null and regexp_replace(v_price_fact, '\s+', '', 'g') !~ '^[0-9]+([\.,][0-9]{1,2})?$' then
    raise exception 'Фактическая цена должна быть числом' using errcode = '22023';
  end if;

  if v_price_contract is not null and regexp_replace(v_price_contract, '\s+', '', 'g') !~ '^[0-9]+([\.,][0-9]{1,2})?$' then
    raise exception 'Цена в договоре должна быть числом' using errcode = '22023';
  end if;

  if v_representation not in ('both', 'seller', 'buyer') then
    raise exception 'Некорректная модель представительства' using errcode = '22023';
  end if;

  v_lawyer_needed :=
    coalesce(jsonb_array_length(coalesce(p_result->'stop','[]'::jsonb)),0) > 0
    or coalesce(jsonb_array_length(coalesce(p_result->'warn','[]'::jsonb)),0) > 0
    or exists (select 1 from jsonb_array_elements_text(coalesce(p_result->'to','[]'::jsonb)) x where x = 'lawyer');

  v_broker_needed := exists (
    select 1
    from jsonb_array_elements_text(coalesce(p_result->'to','[]'::jsonb)) x
    where x = 'broker'
  );

  v_title := concat_ws(' — ', v_object_type, v_address);

  v_analysis := jsonb_build_object(
    'score', p_result->'score',
    'stop', coalesce(p_result->'stop','[]'::jsonb),
    'warnings', coalesce(p_result->'warn','[]'::jsonb),
    'actions', coalesce(p_result->'actions','[]'::jsonb),
    'missing', coalesce(p_result->'missing','[]'::jsonb),
    'transfer_to', coalesce(p_result->'to','[]'::jsonb),
    'spn_final', v_deal->'spn_final',
    'source', 'spn_wizard_rpc'
  );

  insert into public.nav_deals (
    title,
    status,
    created_by,
    seller_spn_id,
    preparation_owner_id,
    documents_owner_id,
    object_type,
    address,
    price_fact,
    price_contract,
    risk_level,
    readiness_deposit,
    readiness_deal,
    deal_json,
    analysis_json,
    lawyer_needed,
    broker_needed,
    seller_phone,
    buyer_phone,
    representation_model,
    team_comment
  ) values (
    v_title,
    'draft'::public.nav_deal_status,
    v_uid,
    v_uid,
    v_uid,
    v_uid,
    v_object_type,
    v_address,
    v_price_fact,
    coalesce(v_price_contract, v_price_fact),
    v_decision,
    v_ready,
    0,
    v_deal,
    v_analysis,
    v_lawyer_needed,
    v_broker_needed,
    nullif(btrim(coalesce(v_deal->>'sellerPhone', '')), ''),
    nullif(btrim(coalesce(v_deal->>'buyerPhone', '')), ''),
    v_representation,
    nullif(btrim(coalesce(v_deal->>'teamComment', '')), '')
  )
  returning id into v_id;

  return jsonb_build_object(
    'id', v_id,
    'title', v_title,
    'status', 'draft',
    'created_at', now(),
    'updated_at', now()
  );
end;
$function$;

revoke all on function public.nav_save_wizard_deal(jsonb) from public;
revoke all on function public.nav_save_wizard_deal(jsonb) from anon;
revoke all on function public.nav_save_wizard_deal(jsonb) from authenticated;
grant execute on function public.nav_save_wizard_deal(jsonb) to authenticated, service_role;
