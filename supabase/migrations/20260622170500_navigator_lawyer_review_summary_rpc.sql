create or replace function public.nav_v2_get_lawyer_review_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_items jsonb;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  select role
  into v_role
  from public.nav_user_profiles
  where id = v_uid and is_active = true
  limit 1;

  if v_role is null then
    raise exception 'Нет активного профиля CRM Навигатор сделок' using errcode = '42501';
  end if;

  with visible_reviews as (
    select rv.*
    from public.nav_deal_reviews_v2 rv
    where public.nav_v2_can_view_deal(rv.deal_id, v_uid)
  ), latest as (
    select distinct on (deal_id)
      deal_id,
      decision as latest_review_decision,
      reviewer_role as latest_reviewer_role,
      created_at as latest_review_at,
      body as latest_review_body,
      blocks_deposit as latest_blocks_deposit,
      blocks_deal as latest_blocks_deal
    from visible_reviews
    order by deal_id, created_at desc
  ), counts as (
    select
      deal_id,
      count(*)::int as reviews_count,
      count(*) filter (where decision = 'approved')::int as approved_reviews_count,
      count(*) filter (where decision = 'need_info')::int as need_info_reviews_count,
      count(*) filter (where decision = 'blocked')::int as blocked_reviews_count,
      count(*) filter (where blocks_deposit or blocks_deal or decision = 'blocked')::int as blocking_reviews_count
    from visible_reviews
    group by deal_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'deal_id', c.deal_id,
    'reviews_count', c.reviews_count,
    'approved_reviews_count', c.approved_reviews_count,
    'need_info_reviews_count', c.need_info_reviews_count,
    'blocked_reviews_count', c.blocked_reviews_count,
    'blocking_reviews_count', c.blocking_reviews_count,
    'latest_review_decision', l.latest_review_decision,
    'latest_reviewer_role', l.latest_reviewer_role,
    'latest_review_at', l.latest_review_at,
    'latest_review_body', l.latest_review_body,
    'latest_blocks_deposit', l.latest_blocks_deposit,
    'latest_blocks_deal', l.latest_blocks_deal
  ) order by c.blocking_reviews_count desc, l.latest_review_at desc), '[]'::jsonb)
  into v_items
  from counts c
  left join latest l on l.deal_id = c.deal_id;

  return jsonb_build_object('items', v_items);
end;
$function$;

revoke all on function public.nav_v2_get_lawyer_review_summary() from public;
revoke execute on function public.nav_v2_get_lawyer_review_summary() from anon;
grant execute on function public.nav_v2_get_lawyer_review_summary() to authenticated;
grant execute on function public.nav_v2_get_lawyer_review_summary() to service_role;
