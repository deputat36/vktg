do $migration$
declare
  v_sql text;
  v_next text;
begin
  select pg_get_functiondef('public.nav_v2_get_deals_list(integer)'::regprocedure) into v_sql;

  v_next := replace(
    v_sql,
    $old$select deal_id, count(*) as open_tasks_count
    from public.nav_deal_tasks_v2
    where status in ('open', 'in_progress')$old$,
    $new$select deal_id,
      count(*) as open_tasks_count,
      count(*) filter (where due_date < current_date) as overdue_tasks_count,
      min(due_date) as next_task_due_date
    from public.nav_deal_tasks_v2
    where status in ('open', 'in_progress')$new$
  );
  if v_next = v_sql then
    raise exception 'Не найден блок task_counts в nav_v2_get_deals_list';
  end if;
  v_sql := v_next;

  v_next := replace(
    v_sql,
    $old$'open_tasks_count', coalesce(t.open_tasks_count, 0),$old$,
    $new$'open_tasks_count', coalesce(t.open_tasks_count, 0),
    'overdue_tasks_count', coalesce(t.overdue_tasks_count, 0),
    'next_task_due_date', t.next_task_due_date,$new$
  );
  if v_next = v_sql then
    raise exception 'Не найден JSON-блок open_tasks_count в nav_v2_get_deals_list';
  end if;

  execute v_next;
end;
$migration$;
