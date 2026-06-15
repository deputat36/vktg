-- Закрывает вызов функций Навигатора для неавторизованных пользователей.
-- Права authenticated и service_role сохраняются.

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'nav\_%' escape '\'
  loop
    execute 'revoke execute on function ' || r.fn || ' from public, anon';
  end loop;
end $$;

alter function public.nav_v2_jsonb_has(jsonb, text)
  set search_path = public, pg_temp;
