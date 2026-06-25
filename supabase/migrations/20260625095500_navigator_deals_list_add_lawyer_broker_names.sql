do $migration$
declare
  v_sql text;
  v_next text;
begin
  select pg_get_functiondef('public.nav_v2_get_deals_list(integer)'::regprocedure) into v_sql;

  if v_sql is null then
    raise exception 'Функция nav_v2_get_deals_list(integer) не найдена';
  end if;

  if position('''lawyer'', lp.full_name' in v_sql) = 0 then
    v_next := replace(
      v_sql,
      $old$'buyer_spn', bp.full_name,
    'seller_spn', sp.full_name,
    'manager', mp.full_name$old$,
      $new$'buyer_spn', bp.full_name,
    'seller_spn', sp.full_name,
    'manager', mp.full_name,
    'lawyer', lp.full_name,
    'broker', brp.full_name$new$
    );

    if v_next = v_sql then
      raise exception 'Не найден JSON-блок manager/spn в nav_v2_get_deals_list';
    end if;

    v_sql := v_next;
  end if;

  if position('left join public.nav_user_profiles lp on lp.id = d.lawyer_id' in v_sql) = 0 then
    v_next := replace(
      v_sql,
      $old$left join public.nav_user_profiles bp on bp.id = d.buyer_spn_id
  left join public.nav_user_profiles sp on sp.id = d.seller_spn_id
  left join public.nav_user_profiles mp on mp.id = d.manager_id;$old$,
      $new$left join public.nav_user_profiles bp on bp.id = d.buyer_spn_id
  left join public.nav_user_profiles sp on sp.id = d.seller_spn_id
  left join public.nav_user_profiles mp on mp.id = d.manager_id
  left join public.nav_user_profiles lp on lp.id = d.lawyer_id
  left join public.nav_user_profiles brp on brp.id = d.broker_id;$new$
    );

    if v_next = v_sql then
      raise exception 'Не найден блок join профилей в nav_v2_get_deals_list';
    end if;

    v_sql := v_next;
  end if;

  execute v_sql;
end;
$migration$;
