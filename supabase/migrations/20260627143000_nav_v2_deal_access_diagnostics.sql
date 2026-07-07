-- Navigator v2 audit remediation: owner/admin deal access diagnostics.
-- Applied live to Supabase project ofewxuqfjhamgerwzull before being synced here.

create or replace function public.nav_v2_check_deal_access(p_email text, p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_uid uuid := auth.uid();
  v_admin_role public.nav_v2_user_role;
  v_target public.nav_user_profiles%rowtype;
  v_deal public.nav_deals_v2%rowtype;
  v_participants jsonb := '[]'::jsonb;
  v_access_signals jsonb;
  v_smoke jsonb := '{}'::jsonb;
  v_profile jsonb;
  v_list jsonb;
  v_lite jsonb;
  v_full jsonb;
  v_list_contains boolean := false;
  v_original_sub text := current_setting('request.jwt.claim.sub', true);
  v_original_role text := current_setting('request.jwt.claim.role', true);
  v_normalized_email text := lower(nullif(trim(p_email), ''));
begin
  if v_admin_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  select role into v_admin_role
  from public.nav_user_profiles
  where id = v_admin_uid
    and is_active is true;

  if v_admin_role not in ('owner', 'admin') then
    raise exception 'Диагностика доступа к сделке доступна только owner/admin' using errcode = '42501';
  end if;

  if v_normalized_email is null then
    raise exception 'Укажите email пользователя' using errcode = '22023';
  end if;

  if p_deal_id is null then
    raise exception 'Укажите id сделки' using errcode = '22023';
  end if;

  select * into v_target
  from public.nav_user_profiles
  where lower(email) = v_normalized_email
  limit 1;

  select * into v_deal
  from public.nav_deals_v2
  where id = p_deal_id
  limit 1;

  if v_deal.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'user_id', p.user_id,
      'email', u.email,
      'full_name', u.full_name,
      'role', u.role,
      'role_in_deal', p.role_in_deal,
      'side', p.side,
      'can_view', p.can_view,
      'can_edit', p.can_edit,
      'can_manage_tasks', p.can_manage_tasks,
      'can_view_finance', p.can_view_finance,
      'display_name', p.display_name
    ) order by p.created_at, p.id), '[]'::jsonb)
    into v_participants
    from public.nav_deal_participants_v2 p
    left join public.nav_user_profiles u on u.id = p.user_id
    where p.deal_id = p_deal_id;
  end if;

  if v_target.id is not null and v_deal.id is not null then
    v_access_signals := jsonb_build_object(
      'is_active_profile', v_target.is_active is true,
      'role', v_target.role,
      'created_by_user', v_deal.created_by = v_target.id,
      'seller_spn', v_deal.seller_spn_id = v_target.id,
      'buyer_spn', v_deal.buyer_spn_id = v_target.id,
      'manager', v_deal.manager_id = v_target.id,
      'lawyer', v_deal.lawyer_id = v_target.id,
      'broker', v_deal.broker_id = v_target.id,
      'participant_can_view', exists (
        select 1
        from public.nav_deal_participants_v2 p
        where p.deal_id = p_deal_id
          and p.user_id = v_target.id
          and p.can_view is true
      ),
      'participant_can_edit', exists (
        select 1
        from public.nav_deal_participants_v2 p
        where p.deal_id = p_deal_id
          and p.user_id = v_target.id
          and p.can_edit is true
      ),
      'manager_of_assigned_spn', v_target.role = 'manager'::public.nav_v2_user_role and exists (
        select 1
        from public.nav_user_profiles spn
        where spn.manager_id = v_target.id
          and spn.id in (v_deal.seller_spn_id, v_deal.buyer_spn_id)
      )
    );

    perform set_config('request.jwt.claim.sub', v_target.id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);

    begin
      v_profile := public.nav_v2_get_my_profile();
      v_smoke := v_smoke || jsonb_build_object(
        'profile_ok', true,
        'profile_role', v_profile #>> '{profile,role}'
      );
    exception when others then
      v_smoke := v_smoke || jsonb_build_object('profile_ok', false, 'profile_error', sqlerrm);
    end;

    begin
      v_list := public.nav_v2_get_deals_list(200);
      select exists (
        select 1
        from jsonb_array_elements(coalesce(v_list->'items', '[]'::jsonb)) item
        where item->>'id' = p_deal_id::text
      ) into v_list_contains;
      v_smoke := v_smoke || jsonb_build_object(
        'deals_list_ok', true,
        'deals_list_count', jsonb_array_length(coalesce(v_list->'items', '[]'::jsonb)),
        'deals_list_contains_deal', v_list_contains
      );
    exception when others then
      v_smoke := v_smoke || jsonb_build_object('deals_list_ok', false, 'deals_list_error', sqlerrm);
    end;

    begin
      v_lite := public.nav_v2_get_deal_card_lite(p_deal_id);
      v_smoke := v_smoke || jsonb_build_object(
        'lite_card_ok', true,
        'lite_card_title', v_lite #>> '{deal,title}'
      );
    exception when others then
      v_smoke := v_smoke || jsonb_build_object('lite_card_ok', false, 'lite_card_error', sqlerrm);
    end;

    begin
      v_full := public.nav_v2_get_deal_card(p_deal_id);
      v_smoke := v_smoke || jsonb_build_object(
        'full_card_ok', true,
        'full_card_title', v_full #>> '{deal,title}'
      );
    exception when others then
      v_smoke := v_smoke || jsonb_build_object('full_card_ok', false, 'full_card_error', sqlerrm);
    end;

    perform set_config('request.jwt.claim.sub', coalesce(v_original_sub, ''), true);
    perform set_config('request.jwt.claim.role', coalesce(v_original_role, ''), true);
  else
    v_access_signals := jsonb_build_object(
      'is_active_profile', coalesce(v_target.is_active, false),
      'role', v_target.role
    );
  end if;

  return jsonb_build_object(
    'ok', coalesce((v_smoke->>'profile_ok')::boolean, false)
      and coalesce((v_smoke->>'deals_list_ok')::boolean, false)
      and coalesce((v_smoke->>'lite_card_ok')::boolean, false)
      and coalesce((v_smoke->>'full_card_ok')::boolean, false),
    'checked_at', now(),
    'target', case when v_target.id is null then null else jsonb_build_object(
      'id', v_target.id,
      'email', v_target.email,
      'full_name', v_target.full_name,
      'role', v_target.role,
      'manager_id', v_target.manager_id,
      'is_active', v_target.is_active
    ) end,
    'deal', case when v_deal.id is null then null else jsonb_build_object(
      'id', v_deal.id,
      'title', v_deal.title,
      'status', v_deal.status,
      'created_by', v_deal.created_by,
      'manager_id', v_deal.manager_id,
      'seller_spn_id', v_deal.seller_spn_id,
      'buyer_spn_id', v_deal.buyer_spn_id,
      'lawyer_id', v_deal.lawyer_id,
      'broker_id', v_deal.broker_id,
      'updated_at', v_deal.updated_at
    ) end,
    'participants', v_participants,
    'access_signals', v_access_signals,
    'rpc_smoke', v_smoke
  );
end;
$$;

revoke execute on function public.nav_v2_check_deal_access(text, uuid) from anon, public;
grant execute on function public.nav_v2_check_deal_access(text, uuid) to authenticated;

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
      ('Диагностика доступа к сделке', 'public.nav_v2_check_deal_access(text, uuid)'),
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
      case when oid is null then false else has_function_privilege('anon', oid, 'EXECUTE') end as anon_can_execute
    from resolved
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'title', title,
      'signature', signature,
      'exists_in_db', exists_in_db,
      'authenticated_can_execute', authenticated_can_execute,
      'anon_can_execute', anon_can_execute
    ) order by title), '[]'::jsonb),
    count(*) filter (where not exists_in_db or not authenticated_can_execute),
    count(*) filter (where anon_can_execute)
  into v_items, v_missing_authenticated_count, v_anon_open_count
  from checked;

  return jsonb_build_object(
    'ok', v_missing_authenticated_count = 0 and v_anon_open_count = 0,
    'missing_authenticated_count', v_missing_authenticated_count,
    'anon_open_count', v_anon_open_count,
    'items', v_items
  );
end;
$$;
