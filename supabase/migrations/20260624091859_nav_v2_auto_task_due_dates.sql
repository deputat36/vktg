create or replace function public.nav_v2_set_auto_task_due_date()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.due_date is null and coalesce(new.source, '') like 'auto_%' then
    new.due_date := current_date + case new.priority
      when 'urgent'::public.nav_v2_task_priority then 1
      when 'high'::public.nav_v2_task_priority then 2
      when 'normal'::public.nav_v2_task_priority then 5
      else 7
    end;
  end if;
  return new;
end;
$function$;

revoke all on function public.nav_v2_set_auto_task_due_date() from public;
revoke all on function public.nav_v2_set_auto_task_due_date() from anon;
revoke all on function public.nav_v2_set_auto_task_due_date() from authenticated;

drop trigger if exists nav_deal_tasks_v2_auto_due_date on public.nav_deal_tasks_v2;
create trigger nav_deal_tasks_v2_auto_due_date
before insert on public.nav_deal_tasks_v2
for each row
execute function public.nav_v2_set_auto_task_due_date();

with updated as (
  update public.nav_deal_tasks_v2
  set due_date = current_date + case priority
    when 'urgent'::public.nav_v2_task_priority then 1
    when 'high'::public.nav_v2_task_priority then 2
    when 'normal'::public.nav_v2_task_priority then 5
    else 7
  end
  where due_date is null
    and coalesce(source, '') like 'auto_%'
    and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)
  returning id, deal_id, title, due_date, source, priority
)
insert into public.nav_deal_events_v2(deal_id, actor_id, event_type, event_title, event_data)
select deal_id,
       null,
       'task_due_date_initialized',
       'Автоматически назначен срок задачи',
       jsonb_build_object(
         'task_id', id,
         'title', title,
         'due_date', due_date,
         'source', source,
         'priority', priority,
         'reason', 'automatic_default'
       )
from updated;
