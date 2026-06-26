create or replace function public.nav_v2_get_handoff_scores(p_deal_ids jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_items jsonb;
begin
  if v_uid is null and not v_is_service then
    raise exception 'Требуется авторизация' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_deal_ids, '[]'::jsonb)) <> 'array' then
    raise exception 'deal_ids must be array';
  end if;

  with raw_ids as (
    select value as id_text
    from jsonb_array_elements_text(p_deal_ids)
    limit 100
  ),
  ids as (
    select distinct id_text::uuid as id
    from raw_ids
    where id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  visible as (
    select i.id,
           public.nav_v2_handoff_gap_count(i.id) as gap_count
    from ids i
    where v_is_service or public.nav_v2_can_view_deal(i.id, v_uid)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'deal_id', id,
    'handoff_gap_count', gap_count,
    'handoff_readiness_score', greatest(0, 100 - gap_count * 8),
    'handoff_ready', gap_count = 0
  ) order by id), '[]'::jsonb)
  into v_items
  from visible;

  return jsonb_build_object('items', v_items);
end;
$$;

revoke all on function public.nav_v2_get_handoff_scores(jsonb) from public;
revoke all on function public.nav_v2_get_handoff_scores(jsonb) from anon;
grant execute on function public.nav_v2_get_handoff_scores(jsonb) to authenticated, service_role;
