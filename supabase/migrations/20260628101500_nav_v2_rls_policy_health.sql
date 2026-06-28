create or replace function public.nav_v2_get_rls_policy_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null or not public.nav_v2_is_owner_or_admin(v_uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with nav_tables as (
    select c.oid, c.relname as table_name, c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and (c.relname like 'nav\_%' escape '\' or c.relname like 'nav\_v2\_%' escape '\')
      and c.relname not like 'leader\_%' escape '\'
      and c.relname not like 'parket\_%' escape '\'
  ), policies as (
    select
      p.schemaname,
      p.tablename,
      p.policyname,
      p.permissive,
      p.roles,
      p.cmd,
      p.qual,
      p.with_check,
      lower(coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) as policy_text
    from pg_policies p
    join nav_tables t on t.table_name = p.tablename
    where p.schemaname = 'public'
  ), table_policy_counts as (
    select
      t.table_name,
      t.relrowsecurity as rls_enabled,
      count(p.policyname) as policy_count
    from nav_tables t
    left join policies p on p.tablename = t.table_name
    group by t.table_name, t.relrowsecurity
  ), policy_findings as (
    select
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check,
      case
        when policy_text like '%auth.role(%' then 'uses_auth_role'
        when policy_text like '%raw_user_meta_data%' or policy_text like '%user_metadata%' then 'uses_user_metadata'
        when cmd in ('UPDATE', 'ALL') and with_check is null then 'update_without_with_check'
        when (qual is null or btrim(qual) in ('true', '(true)'))
          and (with_check is null or btrim(with_check) in ('true', '(true)'))
          and roles && array['authenticated'::name]
          then 'broad_authenticated_policy'
        else null
      end as reason
    from policies
    where policy_text like '%auth.role(%'
       or policy_text like '%raw_user_meta_data%'
       or policy_text like '%user_metadata%'
       or (cmd in ('UPDATE', 'ALL') and with_check is null)
       or ((qual is null or btrim(qual) in ('true', '(true)'))
          and (with_check is null or btrim(with_check) in ('true', '(true)'))
          and roles && array['authenticated'::name])
  ), table_findings as (
    select
      table_name,
      rls_enabled,
      policy_count,
      case
        when rls_enabled is not true then 'rls_disabled'
        when policy_count = 0 then 'no_policies_deny_by_default'
        else null
      end as reason
    from table_policy_counts
    where rls_enabled is not true
       or policy_count = 0
  )
  select jsonb_build_object(
    'ok', (select count(*) from policy_findings) = 0 and (select count(*) from table_findings where reason = 'rls_disabled') = 0,
    'checked_at', now(),
    'table_count', (select count(*) from nav_tables),
    'policy_count', (select count(*) from policies),
    'tables_without_policies_count', (select count(*) from table_policy_counts where policy_count = 0),
    'rls_disabled_count', (select count(*) from table_policy_counts where rls_enabled is not true),
    'problem_count', (select count(*) from policy_findings) + (select count(*) from table_findings where reason = 'rls_disabled'),
    'policy_findings', coalesce((select jsonb_agg(to_jsonb(policy_findings) order by tablename, policyname) from policy_findings), '[]'::jsonb),
    'table_findings', coalesce((select jsonb_agg(to_jsonb(table_findings) order by table_name) from table_findings), '[]'::jsonb),
    'tables', coalesce((select jsonb_agg(to_jsonb(table_policy_counts) order by table_name) from table_policy_counts), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.nav_v2_get_rls_policy_health() from public;
revoke all on function public.nav_v2_get_rls_policy_health() from anon;
grant execute on function public.nav_v2_get_rls_policy_health() to authenticated;

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
      ('RLS policy health', 'public.nav_v2_get_rls_policy_health()'),
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
