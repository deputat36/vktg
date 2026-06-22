create or replace function public.nav_v2_update_deal_status(p_deal_id uuid, p_status nav_v2_deal_status)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_problem_documents int := 0;
  v_overdue_documents int := 0;
  v_unresolved_required int := 0;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if not public.nav_v2_can_edit_deal(p_deal_id, v_uid) then
    raise exception 'Нет прав менять статус сделки' using errcode = '42501';
  end if;

  if p_status::text in ('ready_for_deposit','preparing_deal','ready_for_deal') then
    select
      count(*) filter (where status = 'problem'),
      count(*) filter (where status = 'requested' and requested_at < now() - interval '3 days'),
      count(*) filter (
        where is_required
          and status not in ('received','checked')
          and (
            (p_status::text = 'ready_for_deposit' and required_for_deposit)
            or (p_status::text in ('preparing_deal','ready_for_deal') and required_for_deal)
          )
      )
    into v_problem_documents, v_overdue_documents, v_unresolved_required
    from public.nav_deal_documents_v2
    where deal_id = p_deal_id;

    if coalesce(v_problem_documents, 0) > 0 then
      raise exception 'Нельзя поставить положительный статус: есть проблемные документы (%)', v_problem_documents using errcode = '23514';
    end if;

    if coalesce(v_overdue_documents, 0) > 0 then
      raise exception 'Нельзя поставить положительный статус: есть просроченные запрошенные документы (%)', v_overdue_documents using errcode = '23514';
    end if;

    if coalesce(v_unresolved_required, 0) > 0 then
      raise exception 'Нельзя поставить положительный статус: обязательные документы не закрыты (%)', v_unresolved_required using errcode = '23514';
    end if;
  end if;

  update public.nav_deals_v2
  set status = p_status
  where id = p_deal_id;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (p_deal_id, v_uid, 'status_changed', 'Статус сделки изменен', jsonb_build_object('status', p_status));

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'status', p_status);
end;
$function$;
