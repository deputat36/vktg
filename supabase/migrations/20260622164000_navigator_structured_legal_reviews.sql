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
  v_body text := nullif(trim(coalesce(p_body, '')), '');
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'need_info', 'blocked') then
    raise exception 'Недопустимое решение проверки';
  end if;

  if not public.nav_v2_can_view_deal(p_deal_id, v_uid) then
    raise exception 'Нет доступа к сделке' using errcode = '42501';
  end if;

  v_role := public.nav_v2_my_role(v_uid);

  if v_role not in ('lawyer', 'broker', 'manager', 'owner', 'admin') then
    raise exception 'Нет прав фиксировать решение проверки' using errcode = '42501';
  end if;

  insert into public.nav_deal_reviews_v2 (
    deal_id, reviewer_id, reviewer_role, decision, body, blocks_deposit, blocks_deal
  ) values (
    p_deal_id, v_uid, v_role, p_decision, v_body, p_blocks_deposit, p_blocks_deal
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
      'decision', p_decision,
      'blocks_deposit', p_blocks_deposit,
      'blocks_deal', p_blocks_deal
    )
  );

  return jsonb_build_object('ok', true, 'review_id', v_review_id, 'decision', p_decision);
end;
$function$;

create or replace function public.nav_v2_add_comment(p_deal_id uuid, p_body text, p_visibility text default 'team')
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_comment_id uuid;
  v_body text := trim(coalesce(p_body, ''));
  v_review_decision text;
  v_blocks_deposit boolean := false;
  v_blocks_deal boolean := false;
  v_review_id uuid;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if not public.nav_v2_can_view_deal(p_deal_id, v_uid) then
    raise exception 'Нет доступа к сделке' using errcode = '42501';
  end if;

  if nullif(v_body, '') is null then
    raise exception 'Комментарий не может быть пустым';
  end if;

  v_role := public.nav_v2_my_role(v_uid);

  insert into public.nav_deal_comments_v2 (deal_id, author_id, author_role, visibility, body)
  values (p_deal_id, v_uid, v_role, coalesce(nullif(p_visibility, ''), 'team'), v_body)
  returning id into v_comment_id;

  if v_role in ('lawyer', 'broker', 'manager', 'owner', 'admin') then
    if v_body ilike 'Юрист: первичная юридическая проверка выполнена.%' then
      v_review_decision := 'approved';
    elsif v_body ilike 'Юрист: для продолжения проверки нужны дополнительные документы.%' then
      v_review_decision := 'need_info';
      v_blocks_deal := true;
    elsif v_body ilike 'Юрист: выявлен юридический стоп-фактор.%' then
      v_review_decision := 'blocked';
      v_blocks_deposit := true;
      v_blocks_deal := true;
    elsif v_body ilike 'Юрист: карточка возвращена СПН на доработку.%' then
      v_review_decision := 'need_info';
      v_blocks_deal := true;
    end if;
  end if;

  if v_review_decision is not null then
    insert into public.nav_deal_reviews_v2 (
      deal_id, reviewer_id, reviewer_role, decision, body, blocks_deposit, blocks_deal
    ) values (
      p_deal_id, v_uid, v_role, v_review_decision, v_body, v_blocks_deposit, v_blocks_deal
    )
    returning id into v_review_id;
  end if;

  insert into public.nav_deal_events_v2 (deal_id, actor_id, event_type, event_title, event_data)
  values (
    p_deal_id,
    v_uid,
    case when v_review_id is null then 'comment_added' else 'comment_added_with_review' end,
    case when v_review_id is null then 'Добавлен комментарий' else 'Добавлен комментарий и решение проверки' end,
    jsonb_build_object('comment_id', v_comment_id, 'review_id', v_review_id, 'review_decision', v_review_decision)
  );

  return jsonb_build_object('ok', true, 'comment_id', v_comment_id, 'review_id', v_review_id, 'review_decision', v_review_decision);
end;
$function$;

revoke all on function public.nav_v2_add_deal_review(uuid, text, text, boolean, boolean) from public;
revoke execute on function public.nav_v2_add_deal_review(uuid, text, text, boolean, boolean) from anon;
grant execute on function public.nav_v2_add_deal_review(uuid, text, text, boolean, boolean) to authenticated;
grant execute on function public.nav_v2_add_deal_review(uuid, text, text, boolean, boolean) to service_role;

revoke all on function public.nav_v2_add_comment(uuid, text, text) from public;
revoke execute on function public.nav_v2_add_comment(uuid, text, text) from anon;
grant execute on function public.nav_v2_add_comment(uuid, text, text) to authenticated;
grant execute on function public.nav_v2_add_comment(uuid, text, text) to service_role;
