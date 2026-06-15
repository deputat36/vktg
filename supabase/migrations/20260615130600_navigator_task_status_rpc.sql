create or replace function public.nav_v2_update_task_status(p_task_id uuid,p_status public.nav_v2_task_status)
returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); d uuid; t text;
begin
 if u is null then raise exception 'Пользователь не авторизован' using errcode='42501'; end if;
 if not public.nav_v2_can_change_task_status(p_task_id,u) then raise exception 'Нет прав менять статус этой задачи' using errcode='42501'; end if;
 select deal_id,title into d,t from public.nav_deal_tasks_v2 where id=p_task_id;
 if d is null then raise exception 'Задача не найдена'; end if;
 update public.nav_deal_tasks_v2 set status=p_status,completed_by=case when p_status='done' then u else null end,completed_at=case when p_status='done' then now() else null end where id=p_task_id;
 insert into public.nav_deal_events_v2(deal_id,actor_id,event_type,event_title,event_data) values(d,u,'task_status_changed','Статус задачи изменен',jsonb_build_object('task_id',p_task_id,'title',t,'status',p_status));
 return jsonb_build_object('ok',true,'task_id',p_task_id,'status',p_status);
end$$;
