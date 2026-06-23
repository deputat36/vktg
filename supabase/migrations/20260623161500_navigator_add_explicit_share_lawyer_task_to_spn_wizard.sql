do $$
declare
  v_sql text;
  v_next_marker text := $marker$  elsif v_broker_needed then
    v_next_action := 'Передать брокеру ипотеку, банк или маткапитал';$marker$;
  v_next_insert text := $insert$  elsif public.nav_v2_jsonb_has(v_flags, 'shares') or v_object_type = 'share' then
    v_next_action := 'Передать юристу долю: уведомления, отказы и порядок пользования';
  elsif v_broker_needed then
    v_next_action := 'Передать брокеру ипотеку, банк или маткапитал';$insert$;
  v_task_marker text := $marker$  insert into public.nav_deal_tasks_v2 (deal_id, title, description, assigned_role, priority, source, created_by)
  select v_deal_id, 'Проверка банка / ипотеки / маткапитала', 'Проверить банк, оценку, страховку, СФР, порядок расчетов.', 'broker', 'high', 'auto_broker', v_uid
  where v_broker_needed;$marker$;
  v_task_insert text := $insert$  insert into public.nav_deal_tasks_v2 (deal_id, title, description, assigned_role, priority, source, created_by)
  select v_deal_id, 'Проверить долю / часть объекта', 'Проверить уведомления или отказы сособственников, порядок пользования, фактическое пользование, конфликт и нотариальный сценарий.', 'lawyer', 'urgent', 'auto_share_lawyer', v_uid
  where public.nav_v2_jsonb_has(v_flags, 'shares') or v_object_type = 'share';

  insert into public.nav_deal_tasks_v2 (deal_id, title, description, assigned_role, priority, source, created_by)
  select v_deal_id, 'Проверка банка / ипотеки / маткапитала', 'Проверить банк, оценку, страховку, СФР, порядок расчетов.', 'broker', 'high', 'auto_broker', v_uid
  where v_broker_needed;$insert$;
begin
  select pg_get_functiondef('public.nav_v2_save_wizard_result(jsonb)'::regprocedure) into v_sql;

  if v_sql is null then
    raise exception 'Function public.nav_v2_save_wizard_result(jsonb) not found';
  end if;

  if position('auto_share_lawyer' in v_sql) = 0 then
    if position(v_task_marker in v_sql) = 0 then
      raise exception 'Expected broker task marker was not found in nav_v2_save_wizard_result';
    end if;
    v_sql := replace(v_sql, v_task_marker, v_task_insert);
  end if;

  if position('Передать юристу долю: уведомления, отказы и порядок пользования' in v_sql) = 0 then
    if position(v_next_marker in v_sql) = 0 then
      raise exception 'Expected next_action marker was not found in nav_v2_save_wizard_result';
    end if;
    v_sql := replace(v_sql, v_next_marker, v_next_insert);
  end if;

  execute v_sql;
end $$;
