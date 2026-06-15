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
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
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
    deal_id, level, category, title, description,
    recommendation, blocks_deposit, blocks_deal, assigned_role
  ) values (
    p_deal_id, p_level, p_category, p_title, p_description,
    p_recommendation, p_blocks_deposit, p_blocks_deal, p_assigned_role
  );
end;
$$;
