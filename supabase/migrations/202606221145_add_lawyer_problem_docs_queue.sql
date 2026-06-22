do $body$
declare
  v_sql text;
begin
  select pg_get_functiondef('public.nav_v2_get_lawyer_queue(integer)'::regprocedure)
  into v_sql;

  v_sql := replace(
    v_sql,
    $s$when coalesce(doc.problem_documents_count, 0) > 0 then 'urgent'$s$,
    $s$when coalesce(doc.problem_documents_count, 0) > 0 then 'problem_docs'$s$
  );

  v_sql := replace(
    v_sql,
    $s$'urgent', count(*) filter (where item->>'lawyer_queue' = 'urgent'),
    'overdue_docs',$s$,
    $s$'urgent', count(*) filter (where item->>'lawyer_queue' = 'urgent'),
    'problem_docs', count(*) filter (where item->>'lawyer_queue' = 'problem_docs'),
    'overdue_docs',$s$
  );

  execute v_sql;
end;
$body$;
