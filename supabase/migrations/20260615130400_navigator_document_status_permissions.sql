create or replace function public.nav_v2_update_document_status(p_document_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); d uuid; t text; r public.nav_v2_user_role;
begin
 if u is null then raise exception 'Пользователь не авторизован' using errcode='42501'; end if;
 if p_status not in ('needed','received','checked') then raise exception 'Недопустимый статус документа'; end if;
 select deal_id,title into d,t from public.nav_deal_documents_v2 where id=p_document_id;
 if d is null then raise exception 'Документ не найден'; end if;
 if not public.nav_v2_can_view_deal(d,u) then raise exception 'Нет доступа к документам сделки' using errcode='42501'; end if;
 r:=public.nav_v2_my_role(u);
 if not public.nav_v2_can_edit_deal(d,u) and r not in ('lawyer','broker') then raise exception 'Нет прав менять документы сделки' using errcode='42501'; end if;
 update public.nav_deal_documents_v2 set status=p_status,checked_by=case when p_status in ('received','checked') then u else checked_by end,checked_at=case when p_status in ('received','checked') then now() else checked_at end where id=p_document_id;
 insert into public.nav_deal_events_v2(deal_id,actor_id,event_type,event_title,event_data) values(d,u,'document_status_changed','Статус документа изменен',jsonb_build_object('document_id',p_document_id,'title',t,'status',p_status));
 return jsonb_build_object('ok',true,'document_id',p_document_id,'status',p_status);
end$$;
