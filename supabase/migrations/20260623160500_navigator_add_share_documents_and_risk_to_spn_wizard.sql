do $$
declare
  v_sql text;
  v_marker text := $marker$  insert into public.nav_deal_risks_v2 (deal_id, level, category, title, description, recommendation, blocks_deposit, blocks_deal, assigned_role)
  select v_deal_id, 'yellow', 'expenses', 'Не согласованы расходы сторон', 'Возможен конфликт перед сделкой.', 'Согласовать комиссию, нотариуса, госпошлину, банк, справки и документы.', true, false, 'spn'
  where not v_expenses_agreed;$marker$;
  v_insert text := $insert$  if public.nav_v2_jsonb_has(v_flags, 'shares') or v_object_type = 'share' then
    insert into public.nav_deal_documents_v2 (deal_id, side, category, title, required_for_deposit, required_for_deal, description)
    values
      (v_deal_id, 'seller', 'share', 'Размер доли и выписка ЕГРН по доле', true, true, 'Проверить размер доли, право собственности и объект, к которому относится доля'),
      (v_deal_id, 'seller', 'share', 'Уведомления сособственников или отказы', true, true, 'Для продажи доли проверить преимущественное право покупки и подтверждение уведомлений/отказов'),
      (v_deal_id, 'seller', 'share', 'Соглашение или решение о порядке пользования', false, true, 'Если порядок пользования не определен, зафиксировать фактическое пользование и риск для покупателя'),
      (v_deal_id, 'seller', 'share', 'Информация о фактическом пользовании долей', true, true, 'Отдельный вход, двор/участок, комнаты, конфликт с сособственниками, кто проживает');

    insert into public.nav_deal_risks_v2 (deal_id, level, category, title, description, recommendation, blocks_deposit, blocks_deal, assigned_role)
    values (v_deal_id, 'yellow', 'share', 'Продажа доли / части объекта', 'Нужно проверить преимущественное право покупки, порядок пользования, фактическое пользование и возможный конфликт с сособственниками.', 'Передать юристу до задатка: уведомления/отказы, порядок пользования, фактическое пользование и нотариальный сценарий.', true, true, 'lawyer');
  end if;

$insert$ || v_marker;
begin
  select pg_get_functiondef('public.nav_v2_save_wizard_result(jsonb)'::regprocedure) into v_sql;

  if v_sql is null then
    raise exception 'Function public.nav_v2_save_wizard_result(jsonb) not found';
  end if;

  if position('Продажа доли / части объекта' in v_sql) > 0 then
    return;
  end if;

  if position(v_marker in v_sql) = 0 then
    raise exception 'Expected risk insertion marker was not found in nav_v2_save_wizard_result';
  end if;

  execute replace(v_sql, v_marker, v_insert);
end $$;
