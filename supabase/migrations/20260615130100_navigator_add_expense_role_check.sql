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
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if not public.nav_v2_can_edit_deal(p_deal_id, v_uid) then
    raise exception 'Нет прав менять расходы сделки' using errcode = '42501';
  end if;

  insert into public.nav_deal_expenses_v2 (
    deal_id, side, category, title, amount, payer,
    is_agreed, is_required_before_deposit,
    is_required_before_deal, comment
  ) values (
    p_deal_id, p_side, p_category, p_title, p_amount, p_payer,
    p_is_agreed, p_required_before_deposit,
    p_required_before_deal, p_comment
  );
end;
$$;
