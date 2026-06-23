do $$
declare
  v_sql text;
  v_old text := 'v_object_type not in (''flat_mkd'', ''flat_ground'', ''room'', ''house_land'', ''land'', ''new_building'', ''commercial'')';
  v_new text := 'v_object_type not in (''flat_mkd'', ''flat_ground'', ''room'', ''share'', ''house_land'', ''land'', ''new_building'', ''commercial'')';
begin
  select pg_get_functiondef('public.nav_v2_save_wizard_result(jsonb)'::regprocedure) into v_sql;

  if v_sql is null then
    raise exception 'Function public.nav_v2_save_wizard_result(jsonb) not found';
  end if;

  if position(v_old in v_sql) = 0 then
    raise exception 'Expected object type validation fragment was not found in nav_v2_save_wizard_result';
  end if;

  execute replace(v_sql, v_old, v_new);
end $$;
