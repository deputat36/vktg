do $migration$
declare
  v_table regclass;
begin
  for v_table in
    select format('%I.%I', n.nspname, c.relname)::regclass
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and (c.relname like 'nav\_%' escape '\')
  loop
    execute format('revoke all privileges on table %s from anon', v_table);
    execute format('revoke truncate, references, trigger on table %s from authenticated', v_table);
    execute format('grant all privileges on table %s to service_role', v_table);
  end loop;
end
$migration$;
