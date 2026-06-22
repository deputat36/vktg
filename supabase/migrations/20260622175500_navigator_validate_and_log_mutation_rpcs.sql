create or replace function public.nav_v2_add_document(
  p_deal_id uuid,
  p_side public.nav_v2_side,
  p_category text,
  p_title text,
  p_required_for_deposit boolean default false,
  p_required_for_deal boolean default true,
  p_description text default null,
  p_source_hint text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_category text := coalesce(nullif(trim(coalesce(p_category, '')), ''), 'general');
  v_document_id uuid;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if v_title is null then
    raise exception 'Название документа обязательно';
  end if;

  if not public.nav_v2_can_view_deal(p_deal_id, v_uid) then
    raise exception 'Нет доступа к документам сделки' using errcode = '42501';
  end if;

  v_role := public.nav_v2_my_role(v_uid);

  if not public.nav_v2_can_edit_deal(p_deal_id, v_uid)
     and v_role not in ('lawyer', 'broker') then
    raise exception 'Нет прав добавлять документы сделки' using errcode = '42501';
  end if;

  insert into public.nav_deal_documents_v2 (
    deal_id, side, category, title, required_for_deposit, required_for_deal, description, source_hint
  ) values (
    p_deal_id, p_side, v_category, v_title, p_required_for_deposit, p_required_for_deal,
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_source_hint, '')), '')
  )
  returning id into v_document_id;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    p_deal_id,
    v_uid,
    'document_added',
    'Добавлен документ',
    jsonb_build_object(
      'document_id', v_document_id,
      'title', v_title,
      'category', v_category,
      'side', p_side,
      'required_for_deposit', p_required_for_deposit,
      'required_for_deal', p_required_for_deal
    )
  );
end;
$function$;

create or replace function public.nav_v2_add_risk(
  p_deal_id uuid,
  p_level public.nav_v2_risk_level,
  p_category text,
  p_title text,
  p_description text,
  p_recommendation text,
  p_blocks_deposit boolean default false,
  p_blocks_deal boolean default false,
  p_assigned_role public.nav_v2_user_role default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_category text := coalesce(nullif(trim(coalesce(p_category, '')), ''), 'general');
  v_risk_id uuid;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if v_title is null then
    raise exception 'Название риска обязательно';
  end if;

  if not public.nav_v2_can_view_deal(p_deal_id, v_uid) then
    raise exception 'Нет доступа к рискам сделки' using errcode = '42501';
  end if;

  v_role := public.nav_v2_my_role(v_uid);

  if not public.nav_v2_can_edit_deal(p_deal_id, v_uid)
     and v_role not in ('lawyer', 'broker') then
    raise exception 'Нет прав добавлять риски сделки' using errcode = '42501';
  end if;

  insert into public.nav_deal_risks_v2 (
    deal_id, level, category, title, description, recommendation, blocks_deposit, blocks_deal, assigned_role
  ) values (
    p_deal_id,
    p_level,
    v_category,
    v_title,
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_recommendation, '')), ''),
    p_blocks_deposit,
    p_blocks_deal,
    p_assigned_role
  )
  returning id into v_risk_id;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    p_deal_id,
    v_uid,
    'risk_added',
    'Добавлен риск',
    jsonb_build_object(
      'risk_id', v_risk_id,
      'level', p_level,
      'category', v_category,
      'title', v_title,
      'blocks_deposit', p_blocks_deposit,
      'blocks_deal', p_blocks_deal,
      'assigned_role', p_assigned_role
    )
  );
end;
$function$;

create or replace function public.nav_v2_add_task(
  p_deal_id uuid,
  p_title text,
  p_description text default null,
  p_assigned_role public.nav_v2_user_role default null,
  p_priority public.nav_v2_task_priority default 'normal'::public.nav_v2_task_priority,
  p_source text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_task_id uuid;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if v_title is null then
    raise exception 'Название задачи обязательно';
  end if;

  if not public.nav_v2_can_view_deal(p_deal_id, v_uid) then
    raise exception 'Нет доступа к задачам сделки' using errcode = '42501';
  end if;

  v_role := public.nav_v2_my_role(v_uid);

  if not public.nav_v2_can_edit_deal(p_deal_id, v_uid)
     and v_role not in ('lawyer', 'broker') then
    raise exception 'Нет прав добавлять задачи сделки' using errcode = '42501';
  end if;

  insert into public.nav_deal_tasks_v2 (
    deal_id, title, description, assigned_role, priority, source, created_by
  ) values (
    p_deal_id,
    v_title,
    nullif(trim(coalesce(p_description, '')), ''),
    p_assigned_role,
    p_priority,
    nullif(trim(coalesce(p_source, '')), ''),
    v_uid
  )
  returning id into v_task_id;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    p_deal_id,
    v_uid,
    'task_added',
    'Добавлена задача',
    jsonb_build_object(
      'task_id', v_task_id,
      'title', v_title,
      'assigned_role', p_assigned_role,
      'priority', p_priority,
      'source', p_source
    )
  );
end;
$function$;

create or replace function public.nav_v2_add_expense(
  p_deal_id uuid,
  p_side public.nav_v2_side,
  p_category text,
  p_title text,
  p_amount numeric default null,
  p_payer text default null,
  p_is_agreed boolean default false,
  p_required_before_deposit boolean default false,
  p_required_before_deal boolean default true,
  p_comment text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_category text := coalesce(nullif(trim(coalesce(p_category, '')), ''), 'general');
  v_expense_id uuid;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if v_title is null then
    raise exception 'Название расхода обязательно';
  end if;

  if p_amount is not null and p_amount < 0 then
    raise exception 'Сумма расхода не может быть отрицательной';
  end if;

  if not public.nav_v2_can_edit_deal(p_deal_id, v_uid) then
    raise exception 'Нет прав менять расходы сделки' using errcode = '42501';
  end if;

  insert into public.nav_deal_expenses_v2 (
    deal_id, side, category, title, amount, payer, is_agreed,
    is_required_before_deposit, is_required_before_deal, comment
  ) values (
    p_deal_id,
    p_side,
    v_category,
    v_title,
    p_amount,
    nullif(trim(coalesce(p_payer, '')), ''),
    p_is_agreed,
    p_required_before_deposit,
    p_required_before_deal,
    nullif(trim(coalesce(p_comment, '')), '')
  )
  returning id into v_expense_id;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    p_deal_id,
    v_uid,
    'expense_added',
    'Добавлен расход',
    jsonb_build_object(
      'expense_id', v_expense_id,
      'title', v_title,
      'category', v_category,
      'side', p_side,
      'amount', p_amount,
      'payer', p_payer,
      'is_agreed', p_is_agreed
    )
  );
end;
$function$;

revoke all on function public.nav_v2_add_document(uuid, public.nav_v2_side, text, text, boolean, boolean, text, text) from public;
revoke execute on function public.nav_v2_add_document(uuid, public.nav_v2_side, text, text, boolean, boolean, text, text) from anon;
grant execute on function public.nav_v2_add_document(uuid, public.nav_v2_side, text, text, boolean, boolean, text, text) to authenticated;
grant execute on function public.nav_v2_add_document(uuid, public.nav_v2_side, text, text, boolean, boolean, text, text) to service_role;

revoke all on function public.nav_v2_add_risk(uuid, public.nav_v2_risk_level, text, text, text, text, boolean, boolean, public.nav_v2_user_role) from public;
revoke execute on function public.nav_v2_add_risk(uuid, public.nav_v2_risk_level, text, text, text, text, boolean, boolean, public.nav_v2_user_role) from anon;
grant execute on function public.nav_v2_add_risk(uuid, public.nav_v2_risk_level, text, text, text, text, boolean, boolean, public.nav_v2_user_role) to authenticated;
grant execute on function public.nav_v2_add_risk(uuid, public.nav_v2_risk_level, text, text, text, text, boolean, boolean, public.nav_v2_user_role) to service_role;

revoke all on function public.nav_v2_add_task(uuid, text, text, public.nav_v2_user_role, public.nav_v2_task_priority, text) from public;
revoke execute on function public.nav_v2_add_task(uuid, text, text, public.nav_v2_user_role, public.nav_v2_task_priority, text) from anon;
grant execute on function public.nav_v2_add_task(uuid, text, text, public.nav_v2_user_role, public.nav_v2_task_priority, text) to authenticated;
grant execute on function public.nav_v2_add_task(uuid, text, text, public.nav_v2_user_role, public.nav_v2_task_priority, text) to service_role;

revoke all on function public.nav_v2_add_expense(uuid, public.nav_v2_side, text, text, numeric, text, boolean, boolean, boolean, text) from public;
revoke execute on function public.nav_v2_add_expense(uuid, public.nav_v2_side, text, text, numeric, text, boolean, boolean, boolean, text) from anon;
grant execute on function public.nav_v2_add_expense(uuid, public.nav_v2_side, text, text, numeric, text, boolean, boolean, boolean, text) to authenticated;
grant execute on function public.nav_v2_add_expense(uuid, public.nav_v2_side, text, text, numeric, text, boolean, boolean, boolean, text) to service_role;
