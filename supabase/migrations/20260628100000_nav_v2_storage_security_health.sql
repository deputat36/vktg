create or replace function public.nav_v2_get_storage_security_health()
returns jsonb
language plpgsql
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null or not public.nav_v2_is_owner_or_admin(v_uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with buckets as (
    select
      b.id,
      b.name,
      b.public,
      b.file_size_limit,
      b.allowed_mime_types,
      b.created_at,
      b.updated_at,
      (
        b.id ilike 'nav%'
        or b.name ilike 'nav%'
        or b.id ilike '%deal%'
        or b.name ilike '%deal%'
        or b.id ilike '%document%'
        or b.name ilike '%document%'
        or b.id ilike '%doc%'
        or b.name ilike '%doc%'
      ) and b.id not ilike 'leader%'
        and b.name not ilike 'leader%'
        and b.id not ilike 'parket%'
        and b.name not ilike 'parket%' as nav_related
    from storage.buckets b
  ), object_policies as (
    select
      p.policyname,
      p.permissive,
      p.roles,
      p.cmd,
      p.qual,
      p.with_check
    from pg_policies p
    where p.schemaname = 'storage'
      and p.tablename = 'objects'
  ), bucket_policy_refs as (
    select
      b.id,
      count(*) filter (where op.qual ilike '%' || b.id || '%' or op.with_check ilike '%' || b.id || '%') as referenced_policy_count,
      coalesce(
        jsonb_agg(to_jsonb(op) order by op.policyname) filter (where op.qual ilike '%' || b.id || '%' or op.with_check ilike '%' || b.id || '%'),
        '[]'::jsonb
      ) as referenced_policies
    from buckets b
    left join object_policies op on true
    group by b.id
  ), nav_bucket_rows as (
    select
      b.id,
      b.name,
      b.public,
      b.file_size_limit,
      b.allowed_mime_types,
      coalesce(r.referenced_policy_count, 0) as referenced_policy_count,
      coalesce(r.referenced_policies, '[]'::jsonb) as referenced_policies,
      case
        when b.public is true then 'public_bucket'
        when coalesce(r.referenced_policy_count, 0) = 0 then 'no_bucket_specific_policy'
        else null
      end as reason
    from buckets b
    left join bucket_policy_refs r using (id)
    where b.nav_related is true
  ), nav_problems as (
    select *
    from nav_bucket_rows
    where public is true
       or referenced_policy_count = 0
  )
  select jsonb_build_object(
    'ok', (select count(*) from nav_problems) = 0,
    'checked_at', now(),
    'bucket_count', (select count(*) from buckets),
    'public_bucket_count', (select count(*) from buckets where public is true),
    'object_policy_count', (select count(*) from object_policies),
    'nav_related_bucket_count', (select count(*) from nav_bucket_rows),
    'nav_related_public_count', (select count(*) from nav_bucket_rows where public is true),
    'nav_related_without_specific_policy_count', (select count(*) from nav_bucket_rows where referenced_policy_count = 0),
    'nav_related_buckets', coalesce((select jsonb_agg(to_jsonb(nav_bucket_rows) order by id) from nav_bucket_rows), '[]'::jsonb),
    'problems', coalesce((select jsonb_agg(to_jsonb(nav_problems) order by id) from nav_problems), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.nav_v2_get_storage_security_health() from public;
revoke all on function public.nav_v2_get_storage_security_health() from anon;
grant execute on function public.nav_v2_get_storage_security_health() to authenticated;

create or replace function public.nav_v2_get_rpc_grant_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_items jsonb;
  v_missing_authenticated_count integer := 0;
  v_anon_open_count integer := 0;
  v_public_open_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор';
  end if;

  select role into v_role
  from public.nav_user_profiles
  where id = v_uid
    and is_active is true;

  if v_role not in ('owner', 'admin') then
    raise exception 'Проверка RPC grants доступна только owner/admin';
  end if;

  with expected(title, signature) as (
    values
      ('Профиль', 'public.nav_v2_get_my_profile()'),
      ('Рабочий стол', 'public.nav_v2_get_dashboard()'),
      ('Список сделок', 'public.nav_v2_get_deals_list(integer)'),
      ('Карточка сделки', 'public.nav_v2_get_deal_card(uuid)'),
      ('Легкая карточка сделки', 'public.nav_v2_get_deal_card_lite(uuid)'),
      ('Качество данных', 'public.nav_v2_get_data_quality_dashboard(integer)'),
      ('Security hardening', 'public.nav_v2_get_security_hardening_health()'),
      ('Storage security', 'public.nav_v2_get_storage_security_health()'),
      ('Диагностика доступа к сделке', 'public.nav_v2_check_deal_access(text, uuid)'),
      ('Демо: создать набор', 'public.nav_v2_seed_demo_data()'),
      ('Демо: очистить набор', 'public.nav_v2_clear_demo_data()'),
      ('Ответственные по сделке', 'public.nav_v2_get_deal_responsibility_snapshot(uuid)'),
      ('Варианты статусов сделки', 'public.nav_v2_get_deal_status_options(uuid)'),
      ('Handoff scores', 'public.nav_v2_get_handoff_scores(jsonb)'),
      ('Юридическая очередь', 'public.nav_v2_get_lawyer_queue(integer)'),
      ('Сводка юриста', 'public.nav_v2_get_lawyer_review_summary()'),
      ('Команда', 'public.nav_v2_list_users()'),
      ('Аудит доступов', 'public.nav_v2_get_access_audit()'),
      ('Создание сделки', 'public.nav_v2_save_wizard_result(jsonb)'),
      ('Комментарий', 'public.nav_v2_add_comment(uuid, text, text)'),
      ('Ревью сделки', 'public.nav_v2_add_deal_review(uuid, text, text, boolean, boolean)'),
      ('Документ', 'public.nav_v2_add_document(uuid, nav_v2_side, text, text, boolean, boolean, text, text)'),
      ('Расход', 'public.nav_v2_add_expense(uuid, nav_v2_side, text, text, numeric, text, boolean, boolean, boolean, text)'),
      ('Риск', 'public.nav_v2_add_risk(uuid, nav_v2_risk_level, text, text, text, text, boolean, boolean, nav_v2_user_role)'),
      ('Задача', 'public.nav_v2_add_task(uuid, text, text, nav_v2_user_role, nav_v2_task_priority, text)'),
      ('Статус сделки', 'public.nav_v2_update_deal_status(uuid, nav_v2_deal_status)'),
      ('Стороны сделки', 'public.nav_v2_update_deal_parties(uuid, text, text, text, text, text)'),
      ('Статус документа', 'public.nav_v2_update_document_status(uuid, text)'),
      ('Назначение документа', 'public.nav_v2_update_document_assignment(uuid, uuid, nav_v2_user_role, date, boolean, boolean)'),
      ('Workflow документа', 'public.nav_v2_update_document_workflow(uuid, text, uuid, nav_v2_user_role, date, text)'),
      ('Статус задачи', 'public.nav_v2_update_task_status(uuid, nav_v2_task_status)'),
      ('Срок задачи', 'public.nav_v2_update_task_due_date(uuid, date)'),
      ('Профиль пользователя', 'public.nav_v2_update_user_profile(uuid, text, nav_v2_user_role, uuid, text, boolean)'),
      ('Связать пользователя', 'public.nav_v2_link_user_by_email(text, text, nav_v2_user_role, uuid, text)'),
      ('Возврат СПН', 'public.nav_v2_return_spn_rework(uuid, text)'),
      ('Отправка доработки СПН', 'public.nav_v2_submit_spn_rework(uuid, text)')
  ), resolved as (
    select title, signature, to_regprocedure(signature) as oid
    from expected
  ), checked as (
    select
      title,
      signature,
      oid is not null as exists_in_db,
      case when oid is null then false else has_function_privilege('authenticated', oid, 'EXECUTE') end as authenticated_can_execute,
      case when oid is null then false else has_function_privilege('anon', oid, 'EXECUTE') end as anon_can_execute,
      case when oid is null then false else has_function_privilege('public', oid, 'EXECUTE') end as public_can_execute
    from resolved
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'title', title,
      'signature', signature,
      'exists_in_db', exists_in_db,
      'authenticated_can_execute', authenticated_can_execute,
      'anon_can_execute', anon_can_execute,
      'public_can_execute', public_can_execute
    ) order by title), '[]'::jsonb),
    count(*) filter (where not exists_in_db or not authenticated_can_execute),
    count(*) filter (where anon_can_execute),
    count(*) filter (where public_can_execute)
  into v_items, v_missing_authenticated_count, v_anon_open_count, v_public_open_count
  from checked;

  return jsonb_build_object(
    'ok', v_missing_authenticated_count = 0 and v_anon_open_count = 0 and v_public_open_count = 0,
    'missing_authenticated_count', v_missing_authenticated_count,
    'anon_open_count', v_anon_open_count,
    'public_open_count', v_public_open_count,
    'items', v_items
  );
end;
$$;

revoke execute on function public.nav_v2_get_rpc_grant_health() from anon, public;
grant execute on function public.nav_v2_get_rpc_grant_health() to authenticated;
