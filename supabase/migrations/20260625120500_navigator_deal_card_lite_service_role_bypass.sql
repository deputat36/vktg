create or replace function public.nav_v2_get_deal_card_lite(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_service boolean := coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_deal jsonb;
  v_documents jsonb;
  v_tasks jsonb;
  v_risks jsonb;
  v_comments jsonb;
begin
  if v_uid is null and not v_is_service then
    raise exception 'Требуется авторизация' using errcode = '42501';
  end if;

  if not v_is_service and not public.nav_v2_can_view_deal(p_deal_id, v_uid) then
    raise exception 'Нет доступа к сделке' using errcode = '42501';
  end if;

  select to_jsonb(d) into v_deal
  from public.nav_deals_v2 d
  where d.id = p_deal_id;

  if v_deal is null then
    raise exception 'Сделка не найдена';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'title', d.title,
    'status', d.status,
    'side', d.side,
    'category', d.category,
    'is_required', d.is_required,
    'responsible_role', d.responsible_role,
    'due_date', d.due_date,
    'problem_note', d.problem_note
  ) order by d.is_required desc, d.side, d.title), '[]'::jsonb)
  into v_documents
  from public.nav_deal_documents_v2 d
  where d.deal_id = p_deal_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'description', t.description,
    'status', t.status,
    'priority', t.priority,
    'assigned_role', t.assigned_role,
    'due_date', t.due_date
  ) order by t.created_at desc), '[]'::jsonb)
  into v_tasks
  from public.nav_deal_tasks_v2 t
  where t.deal_id = p_deal_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'title', r.title,
    'description', r.description,
    'level', r.level,
    'is_resolved', r.is_resolved
  ) order by r.created_at desc), '[]'::jsonb)
  into v_risks
  from public.nav_deal_risks_v2 r
  where r.deal_id = p_deal_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'body', c.body,
    'author_role', c.author_role,
    'created_at', c.created_at
  ) order by c.created_at desc), '[]'::jsonb)
  into v_comments
  from public.nav_deal_comments_v2 c
  where c.deal_id = p_deal_id
    and c.visibility <> 'private';

  return jsonb_build_object(
    'deal', v_deal,
    'documents', v_documents,
    'tasks', v_tasks,
    'risks', v_risks,
    'comments', v_comments,
    'lite', true
  );
end;
$$;

revoke all on function public.nav_v2_get_deal_card_lite(uuid) from public;
revoke all on function public.nav_v2_get_deal_card_lite(uuid) from anon;
grant execute on function public.nav_v2_get_deal_card_lite(uuid) to authenticated, service_role;
