create or replace function public.nav_v2_save_wizard_result(p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  d jsonb := coalesce(p_result->'deal', '{}'::jsonb);
  v_deal_id uuid;
  v_title text;
  v_preparation_mode text;
  v_representation text;
  v_stage text;
  v_object_type text;
  v_address text;
  v_seller_name text;
  v_buyer_name text;
  v_seller_phone text;
  v_buyer_phone text;
  v_price_text text;
  v_deposit_text text;
  v_price numeric := null;
  v_deposit numeric := null;
  v_flags jsonb;
  v_payments jsonb;
  v_basis jsonb;
  v_has_children boolean := false;
  v_has_mortgage boolean := false;
  v_lawyer_needed boolean := false;
  v_broker_needed boolean := false;
  v_expenses_agreed boolean := false;
  v_settlements_agreed boolean := false;
  v_risk public.nav_v2_risk_level := 'green';
  v_deposit_ready int := 50;
  v_deal_ready int := 35;
  v_next_action text := 'Проверить документы, расходы и порядок расчетов';
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  select role into v_role
  from public.nav_user_profiles
  where id = v_uid and is_active = true
  limit 1;

  if v_role is null then
    raise exception 'Нет активного профиля CRM Навигатор сделок' using errcode = '42501';
  end if;

  if v_role not in ('owner', 'admin', 'manager', 'spn') then
    raise exception 'Создавать сделку из мастера может СПН, менеджер, админ или владелец' using errcode = '42501';
  end if;

  if p_result is null or jsonb_typeof(p_result) <> 'object' then
    raise exception 'Результат мастера должен быть JSON-объектом';
  end if;

  if p_result ? 'deal' and jsonb_typeof(p_result->'deal') <> 'object' then
    raise exception 'Блок deal в результате мастера должен быть JSON-объектом';
  end if;

  v_preparation_mode := coalesce(nullif(trim(d->>'preparationMode'), ''), 'deal');
  v_representation := coalesce(nullif(trim(d->>'representation'), ''), 'unknown');
  v_stage := nullif(trim(d->>'stage'), '');
  v_object_type := nullif(trim(coalesce(d->>'objectType', d->>'object_type')), '');
  v_address := nullif(trim(d->>'address'), '');
  v_seller_name := nullif(trim(coalesce(d->>'sellerName', d->>'seller_name', d->>'sellerFullName', d->>'seller_fio')), '');
  v_buyer_name := nullif(trim(coalesce(d->>'buyerName', d->>'buyer_name', d->>'buyerFullName', d->>'buyer_fio')), '');
  v_seller_phone := nullif(trim(coalesce(d->>'sellerPhone', d->>'seller_phone')), '');
  v_buyer_phone := nullif(trim(coalesce(d->>'buyerPhone', d->>'buyer_phone')), '');
  v_price_text := nullif(replace(trim(coalesce(d->>'priceTotal', '')), ',', '.'), '');
  v_deposit_text := nullif(replace(trim(coalesce(d->>'depositAmount', '')), ',', '.'), '');
  v_flags := coalesce(d->'flags', '[]'::jsonb);
  v_payments := coalesce(d->'payments', '[]'::jsonb);
  v_basis := coalesce(d->'basis', '[]'::jsonb);

  if v_preparation_mode not in ('consult', 'deposit', 'deal', 'check_docs', 'rework') then
    raise exception 'Неизвестный режим подготовки: %', v_preparation_mode;
  end if;

  if v_representation not in ('seller', 'buyer', 'one_spn_both', 'both', 'partner_agency', 'unknown') then
    raise exception 'Неизвестная модель сопровождения: %', v_representation;
  end if;

  if v_stage is not null and v_stage not in ('lead_only', 'object_chosen', 'terms_discussed', 'urgent_deposit', 'deposit_exists', 'main_deal', 'legal_problem') then
    raise exception 'Неизвестная стадия сделки: %', v_stage;
  end if;

  if v_object_type is not null and v_object_type not in ('flat_mkd', 'flat_ground', 'room', 'house_land', 'land', 'new_building', 'commercial') then
    raise exception 'Неизвестный тип объекта: %', v_object_type;
  end if;

  if v_preparation_mode in ('deposit', 'deal', 'check_docs') and coalesce(v_stage, '') <> 'lead_only' and v_object_type is null then
    raise exception 'Для подготовки задатка, сделки или проверки документов нужно выбрать тип объекта';
  end if;

  if v_preparation_mode in ('deposit', 'deal') and coalesce(v_stage, '') <> 'lead_only' and v_address is null then
    raise exception 'Для подготовки задатка или сделки нужен адрес или ориентир объекта';
  end if;

  if jsonb_typeof(v_flags) <> 'array' then
    raise exception 'Поле flags должно быть массивом';
  end if;

  if jsonb_typeof(v_payments) <> 'array' then
    raise exception 'Поле payments должно быть массивом';
  end if;

  if jsonb_typeof(v_basis) <> 'array' then
    raise exception 'Поле basis должно быть массивом';
  end if;

  if v_price_text is not null then
    if v_price_text !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception 'Цена должна быть числом без пробелов и лишних символов';
    end if;
    v_price := v_price_text::numeric;
    if v_price <= 0 then
      raise exception 'Цена должна быть больше нуля';
    end if;
  end if;

  if v_deposit_text is not null then
    if v_deposit_text !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception 'Задаток должен быть числом без пробелов и лишних символов';
    end if;
    v_deposit := v_deposit_text::numeric;
    if v_deposit < 0 then
      raise exception 'Задаток не может быть отрицательным';
    end if;
  end if;

  if v_price is not null and v_deposit is not null and v_deposit > v_price then
    raise exception 'Задаток не может быть больше цены объекта';
  end if;

  if d ? 'expensesAgreed' and lower(d->>'expensesAgreed') not in ('true', 'false') then
    raise exception 'Поле expensesAgreed должно быть true или false';
  end if;

  if d ? 'settlementsAgreed' and lower(d->>'settlementsAgreed') not in ('true', 'false') then
    raise exception 'Поле settlementsAgreed должно быть true или false';
  end if;

  v_expenses_agreed := coalesce((d->>'expensesAgreed')::boolean, false);
  v_settlements_agreed := coalesce((d->>'settlementsAgreed')::boolean, false);

  v_has_children := public.nav_v2_jsonb_has(v_flags, 'minorSeller')
    or public.nav_v2_jsonb_has(v_flags, 'minorBuyer')
    or public.nav_v2_jsonb_has(v_flags, 'minorRegistered')
    or public.nav_v2_jsonb_has(v_payments, 'matcap')
    or public.nav_v2_jsonb_has(v_payments, 'nominalChild')
    or public.nav_v2_jsonb_has(v_payments, 'svoChildAccount');

  v_has_mortgage := public.nav_v2_jsonb_has(v_payments, 'mortgage') or public.nav_v2_jsonb_has(v_payments, 'militaryMortgage');

  v_lawyer_needed := v_has_children
    or public.nav_v2_jsonb_has(v_basis, 'inheritLaw')
    or public.nav_v2_jsonb_has(v_basis, 'inheritWill')
    or public.nav_v2_jsonb_has(v_basis, 'privat')
    or public.nav_v2_jsonb_has(v_basis, 'court')
    or public.nav_v2_jsonb_has(v_flags, 'powerOfAttorney')
    or public.nav_v2_jsonb_has(v_flags, 'shares');

  v_broker_needed := v_has_mortgage or public.nav_v2_jsonb_has(v_payments, 'matcap');

  if v_lawyer_needed or v_broker_needed or not v_expenses_agreed or not v_settlements_agreed then v_risk := 'yellow'; end if;
  if v_has_children then v_risk := 'red'; end if;

  if v_address is not null then v_deposit_ready := v_deposit_ready + 10; v_deal_ready := v_deal_ready + 5; end if;
  if v_object_type is not null then v_deposit_ready := v_deposit_ready + 10; v_deal_ready := v_deal_ready + 5; end if;
  if v_expenses_agreed then v_deposit_ready := v_deposit_ready + 15; v_deal_ready := v_deal_ready + 10; end if;
  if v_settlements_agreed then v_deposit_ready := v_deposit_ready + 15; v_deal_ready := v_deal_ready + 10; end if;
  v_deposit_ready := least(v_deposit_ready, 100);
  v_deal_ready := least(v_deal_ready, 100);

  if v_has_children then
    v_next_action := 'Передать юристу до задатка: дети, опека или детские деньги';
  elsif not v_expenses_agreed then
    v_next_action := 'До задатка согласовать расходы покупателя и продавца';
  elsif not v_settlements_agreed then
    v_next_action := 'До задатка согласовать порядок расчетов';
  elsif v_broker_needed then
    v_next_action := 'Передать брокеру ипотеку, банк или маткапитал';
  elsif v_lawyer_needed then
    v_next_action := 'Передать юристу основания права и риски';
  else
    v_next_action := 'Проверить документы и готовить задаток';
  end if;

  v_title := concat_ws(' — ', concat_ws(' / ', coalesce(v_seller_name, 'Продавец не указан'), coalesce(v_buyer_name, 'Покупатель не указан')), coalesce(v_address, 'адрес не указан'));

  insert into public.nav_deals_v2 (
    title, status, risk_level, created_by, seller_spn_id, buyer_spn_id,
    representation_model, preparation_mode, object_type, address, seller_name, buyer_name, seller_phone, buyer_phone, cadastral_number,
    price_total, price_contract, deposit_amount, readiness_deposit, readiness_deal,
    lawyer_needed, broker_needed, has_children, has_mortgage, has_matcap, has_nominal_child_money,
    expenses_agreed, settlements_agreed, deal_summary, wizard_snapshot, next_action
  ) values (
    v_title, 'draft', v_risk, v_uid,
    case when v_representation in ('seller','both','one_spn_both') then v_uid else null end,
    case when v_representation in ('buyer','both','one_spn_both') then v_uid else null end,
    v_representation,
    v_preparation_mode,
    v_object_type, v_address, v_seller_name, v_buyer_name, v_seller_phone, v_buyer_phone, nullif(trim(d->>'cadastralNumber'), ''),
    v_price, v_price, v_deposit, v_deposit_ready, v_deal_ready,
    v_lawyer_needed, v_broker_needed, v_has_children, v_has_mortgage,
    public.nav_v2_jsonb_has(v_payments, 'matcap'),
    public.nav_v2_jsonb_has(v_payments, 'nominalChild') or public.nav_v2_jsonb_has(v_payments, 'svoChildAccount'),
    v_expenses_agreed, v_settlements_agreed,
    jsonb_build_object('next_action', v_next_action, 'risk_level', v_risk, 'stage', v_stage),
    p_result,
    v_next_action
  ) returning id into v_deal_id;

  insert into public.nav_deal_participants_v2 (deal_id, user_id, role_in_deal, side, can_view, can_edit, can_manage_tasks, can_view_finance, display_name)
  values (v_deal_id, v_uid, 'creator_spn', 'company', true, true, true, true, 'Создатель сделки');

  insert into public.nav_deal_documents_v2 (deal_id, side, category, title, required_for_deposit, required_for_deal, description)
  values
    (v_deal_id, 'seller', 'identity', 'Паспорт продавца / всех продавцов', true, true, 'Базовый документ'),
    (v_deal_id, 'buyer', 'identity', 'Паспорт покупателя / всех покупателей', true, true, 'Базовый документ'),
    (v_deal_id, 'seller', 'identity', 'СНИЛС продавца / всех продавцов', false, true, 'Нужен на сделку'),
    (v_deal_id, 'buyer', 'identity', 'СНИЛС покупателя / всех покупателей', false, true, 'Нужен на сделку'),
    (v_deal_id, 'seller', 'object', 'Выписка ЕГРН', true, true, 'Проверить право и обременения'),
    (v_deal_id, 'seller', 'basis', 'Документ-основание права собственности', true, true, 'ДКП, наследство, дарение, приватизация и др.'),
    (v_deal_id, 'seller', 'utilities', 'Адресная справка / сведения о зарегистрированных', false, true, 'Проверить зарегистрированных'),
    (v_deal_id, 'seller', 'utilities', 'Справки об отсутствии задолженности или оплаченные квитанции', false, true, 'Коммунальные платежи');

  if v_object_type in ('house_land','house','land') then
    insert into public.nav_deal_documents_v2 (deal_id, side, category, title, required_for_deposit, required_for_deal, description)
    values (v_deal_id, 'seller', 'land', 'Документы на земельный участок и сведения о границах', true, true, 'ЕГРН, основание, межевание, ограничения');
  end if;

  if v_has_children then
    insert into public.nav_deal_documents_v2 (deal_id, side, category, title, required_for_deposit, required_for_deal, description)
    values
      (v_deal_id, 'seller', 'children', 'Свидетельства о рождении детей', true, true, 'Если дети участвуют в сделке'),
      (v_deal_id, 'seller', 'children', 'Разрешение органов опеки', true, true, 'Если ребенок собственник или используются детские деньги');
  end if;

  insert into public.nav_deal_risks_v2 (deal_id, level, category, title, description, recommendation, blocks_deposit, blocks_deal, assigned_role)
  select v_deal_id, 'yellow', 'expenses', 'Не согласованы расходы сторон', 'Возможен конфликт перед сделкой.', 'Согласовать комиссию, нотариуса, госпошлину, банк, справки и документы.', true, false, 'spn'
  where not v_expenses_agreed;

  insert into public.nav_deal_risks_v2 (deal_id, level, category, title, description, recommendation, blocks_deposit, blocks_deal, assigned_role)
  select v_deal_id, 'yellow', 'settlements', 'Не согласован порядок расчетов', 'Нельзя оставлять порядок расчетов до последнего дня.', 'Согласовать способ, сроки и расписку до задатка.', true, true, 'spn'
  where not v_settlements_agreed;

  insert into public.nav_deal_risks_v2 (deal_id, level, category, title, description, recommendation, blocks_deposit, blocks_deal, assigned_role)
  select v_deal_id, 'red', 'children', 'В сделке участвуют дети или детские деньги', 'Без проверки нельзя безопасно идти к задатку.', 'Передать юристу до задатка.', true, true, 'lawyer'
  where v_has_children;

  insert into public.nav_deal_risks_v2 (deal_id, level, category, title, description, recommendation, blocks_deposit, blocks_deal, assigned_role)
  select v_deal_id, 'yellow', 'mortgage', 'Ипотека или маткапитал требуют контроля', 'Нужно проверить банк, оценку, СФР и порядок расчетов.', 'Передать брокеру.', false, true, 'broker'
  where v_broker_needed;

  insert into public.nav_deal_expenses_v2 (deal_id, side, category, title, payer, is_agreed, is_required_before_deposit, is_required_before_deal, comment)
  values
    (v_deal_id, 'buyer', 'base', 'Расходы покупателя', case when v_expenses_agreed then 'agreed' else 'not_agreed' end, v_expenses_agreed, true, true, 'Цена, комиссия, госпошлина, банк, оценка, страхование'),
    (v_deal_id, 'seller', 'base', 'Расходы продавца', case when v_expenses_agreed then 'agreed' else 'not_agreed' end, v_expenses_agreed, true, true, 'Комиссия, справки, долги, нотариус, документы');

  insert into public.nav_deal_tasks_v2 (deal_id, title, description, assigned_role, priority, source, created_by)
  select v_deal_id, 'Согласовать расходы сторон', 'Кто оплачивает комиссию, нотариуса, банк, справки, госпошлину.', 'spn', 'high', 'auto_expenses', v_uid
  where not v_expenses_agreed;

  insert into public.nav_deal_tasks_v2 (deal_id, title, description, assigned_role, priority, source, created_by)
  select v_deal_id, 'Согласовать порядок расчетов', 'Когда и как передаются деньги, расписка, СБР/аккредитив/ячейка.', 'spn', 'high', 'auto_settlements', v_uid
  where not v_settlements_agreed;

  insert into public.nav_deal_tasks_v2 (deal_id, title, description, assigned_role, priority, source, created_by)
  select v_deal_id, 'Юридическая проверка до задатка', 'Проверить детей, опеку, основания права и ограничения.', 'lawyer', 'urgent', 'auto_lawyer', v_uid
  where v_lawyer_needed;

  insert into public.nav_deal_tasks_v2 (deal_id, title, description, assigned_role, priority, source, created_by)
  select v_deal_id, 'Проверка банка / ипотеки / маткапитала', 'Проверить банк, оценку, страховку, СФР, порядок расчетов.', 'broker', 'high', 'auto_broker', v_uid
  where v_broker_needed;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    v_deal_id,
    v_uid,
    'created',
    'Сделка создана из мастера v2',
    jsonb_build_object('risk', v_risk, 'next_action', v_next_action, 'stage', v_stage, 'preparation_mode', v_preparation_mode, 'representation', v_representation)
  );

  return jsonb_build_object(
    'id', v_deal_id,
    'title', v_title,
    'status', 'draft',
    'risk_level', v_risk,
    'readiness_deposit', v_deposit_ready,
    'readiness_deal', v_deal_ready,
    'next_action', v_next_action
  );
end;
$function$;

revoke all on function public.nav_v2_save_wizard_result(jsonb) from public;
revoke execute on function public.nav_v2_save_wizard_result(jsonb) from anon;
grant execute on function public.nav_v2_save_wizard_result(jsonb) to authenticated;
grant execute on function public.nav_v2_save_wizard_result(jsonb) to service_role;
