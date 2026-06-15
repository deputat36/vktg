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
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
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
    deal_id, side, category, title,
    required_for_deposit, required_for_deal,
    description, source_hint
  ) values (
    p_deal_id, p_side, p_category, p_title,
    p_required_for_deposit, p_required_for_deal,
    p_description, p_source_hint
  );
end;
$$;
