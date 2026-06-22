create or replace function public.nav_v2_add_deal_review(
  p_deal_id uuid,
  p_decision text,
  p_body text default null,
  p_blocks_deposit boolean default false,
  p_blocks_deal boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_review_id uuid;
  v_decision text := lower(nullif(trim(coalesce(p_decision, '')), ''));
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_blocks_deposit boolean := coalesce(p_blocks_deposit, false);
  v_blocks_deal boolean := coalesce(p_blocks_deal, false);
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if v_decision not in ('approved', 'need_info', 'blocked') then
    raise exception 'Недопустимое решение проверки';
  end if;

  if not public.nav_v2_can_view_deal(p_deal_id, v_uid) then
    raise exception 'Нет доступа к сделке' using errcode = '42501';
  end if;

  v_role := public.nav_v2_my_role(v_uid);

  if v_role not in ('lawyer', 'broker', 'manager', 'owner', 'admin') then
    raise exception 'Нет прав фиксировать решение проверки' using errcode = '42501';
  end if;

  if v_decision in ('need_info', 'blocked') and v_body is null then
    raise exception 'Для решения с замечаниями нужен комментарий';
  end if;

  if v_decision = 'approved' then
    v_blocks_deposit := false;
    v_blocks_deal := false;
  elsif v_decision = 'need_info' then
    v_blocks_deal := true;
  elsif v_decision = 'blocked' then
    v_blocks_deposit := true;
    v_blocks_deal := true;
  end if;

  insert into public.nav_deal_reviews_v2 (
    deal_id, reviewer_id, reviewer_role, decision, body, blocks_deposit, blocks_deal
  ) values (
    p_deal_id, v_uid, v_role, v_decision, v_body, v_blocks_deposit, v_blocks_deal
  )
  returning id into v_review_id;

  if v_body is not null then
    insert into public.nav_deal_comments_v2 (deal_id, author_id, author_role, visibility, body)
    values (p_deal_id, v_uid, v_role, 'team', v_body);
  end if;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    p_deal_id,
    v_uid,
    'deal_review_added',
    'Зафиксировано решение проверки',
    jsonb_build_object(
      'review_id', v_review_id,
      'decision', v_decision,
      'blocks_deposit', v_blocks_deposit,
      'blocks_deal', v_blocks_deal
    )
  );

  return jsonb_build_object(
    'ok', true,
    'review_id', v_review_id,
    'decision', v_decision,
    'blocks_deposit', v_blocks_deposit,
    'blocks_deal', v_blocks_deal
  );
end;
$function$;

create or replace function public.nav_v2_update_deal_status(p_deal_id uuid, p_status public.nav_v2_deal_status)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_old_status public.nav_v2_deal_status;
  v_problem_documents int := 0;
  v_overdue_documents int := 0;
  v_unresolved_required int := 0;
  v_blocking_reviews int := 0;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if p_status is null then
    raise exception 'Статус сделки обязателен';
  end if;

  if not public.nav_v2_can_edit_deal(p_deal_id, v_uid) then
    raise exception 'Нет прав менять статус сделки' using errcode = '42501';
  end if;

  select status
  into v_old_status
  from public.nav_deals_v2
  where id = p_deal_id
  for update;

  if v_old_status is null then
    raise exception 'Сделка не найдена' using errcode = 'P0002';
  end if;

  if p_status::text in ('ready_for_deposit','deposit_done','preparing_deal','ready_for_deal','registration','registered','closed') then
    select
      count(*) filter (where status = 'problem'),
      count(*) filter (where status = 'requested' and requested_at < now() - interval '3 days'),
      count(*) filter (
        where is_required
          and status not in ('received','checked')
          and (
            (p_status::text in ('ready_for_deposit','deposit_done') and required_for_deposit)
            or (p_status::text in ('preparing_deal','ready_for_deal','registration','registered','closed') and required_for_deal)
          )
      )
    into v_problem_documents, v_overdue_documents, v_unresolved_required
    from public.nav_deal_documents_v2
    where deal_id = p_deal_id;

    if p_status::text in ('ready_for_deposit','deposit_done') then
      select count(*)
      into v_blocking_reviews
      from public.nav_deal_reviews_v2
      where deal_id = p_deal_id
        and (decision = 'blocked' or blocks_deposit = true);
    else
      select count(*)
      into v_blocking_reviews
      from public.nav_deal_reviews_v2
      where deal_id = p_deal_id
        and (decision = 'blocked' or blocks_deal = true);
    end if;

    if coalesce(v_problem_documents, 0) > 0 then
      raise exception 'Нельзя поставить положительный статус: есть проблемные документы (%)', v_problem_documents using errcode = '23514';
    end if;

    if coalesce(v_overdue_documents, 0) > 0 then
      raise exception 'Нельзя поставить положительный статус: есть просроченные запрошенные документы (%)', v_overdue_documents using errcode = '23514';
    end if;

    if coalesce(v_unresolved_required, 0) > 0 then
      raise exception 'Нельзя поставить положительный статус: обязательные документы не закрыты (%)', v_unresolved_required using errcode = '23514';
    end if;

    if coalesce(v_blocking_reviews, 0) > 0 then
      raise exception 'Нельзя поставить положительный статус: есть блокирующие решения проверки (%)', v_blocking_reviews using errcode = '23514';
    end if;
  end if;

  update public.nav_deals_v2
  set status = p_status,
      updated_at = now()
  where id = p_deal_id;

  if v_old_status is distinct from p_status then
    insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
    values (
      p_deal_id,
      v_uid,
      'status_changed',
      'Статус сделки изменен',
      jsonb_build_object('old_status', v_old_status, 'status', p_status)
    );
  end if;

  return jsonb_build_object('ok', true, 'deal_id', p_deal_id, 'old_status', v_old_status, 'status', p_status);
end;
$function$;

revoke all on function public.nav_v2_add_deal_review(uuid, text, text, boolean, boolean) from public;
revoke execute on function public.nav_v2_add_deal_review(uuid, text, text, boolean, boolean) from anon;
grant execute on function public.nav_v2_add_deal_review(uuid, text, text, boolean, boolean) to authenticated;
grant execute on function public.nav_v2_add_deal_review(uuid, text, text, boolean, boolean) to service_role;

revoke all on function public.nav_v2_update_deal_status(uuid, public.nav_v2_deal_status) from public;
revoke execute on function public.nav_v2_update_deal_status(uuid, public.nav_v2_deal_status) from anon;
grant execute on function public.nav_v2_update_deal_status(uuid, public.nav_v2_deal_status) to authenticated;
grant execute on function public.nav_v2_update_deal_status(uuid, public.nav_v2_deal_status) to service_role;
