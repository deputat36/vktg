-- Navigator v2 audit remediation: automatic quality tasks and internal RPC lockdown health.
-- Applied live to Supabase project ofewxuqfjhamgerwzull before being synced here.

create or replace function public.nav_v2_sync_deal_quality_tasks(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  d public.nav_deals_v2%rowtype;
  v_inserted int := 0;
  v_closed int := 0;
  v_step int := 0;
begin
  select * into d
  from public.nav_deals_v2
  where id = p_deal_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'deal_not_found', 'deal_id', p_deal_id);
  end if;

  update public.nav_deal_tasks_v2
  set status = 'done'::public.nav_v2_task_status,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where deal_id = p_deal_id
    and source = 'auto_quality_seller_name'
    and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)
    and nullif(trim(coalesce(d.seller_name, '')), '') is not null;
  get diagnostics v_step = row_count;
  v_closed := v_closed + v_step;

  update public.nav_deal_tasks_v2
  set status = 'done'::public.nav_v2_task_status,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where deal_id = p_deal_id
    and source = 'auto_quality_buyer_name'
    and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)
    and nullif(trim(coalesce(d.buyer_name, '')), '') is not null;
  get diagnostics v_step = row_count;
  v_closed := v_closed + v_step;

  update public.nav_deal_tasks_v2
  set status = 'done'::public.nav_v2_task_status,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where deal_id = p_deal_id
    and source = 'auto_quality_address'
    and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)
    and nullif(trim(coalesce(d.address, '')), '') is not null;
  get diagnostics v_step = row_count;
  v_closed := v_closed + v_step;

  update public.nav_deal_tasks_v2
  set status = 'done'::public.nav_v2_task_status,
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
  where deal_id = p_deal_id
    and source = 'auto_quality_responsible_spn'
    and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)
    and (d.seller_spn_id is not null or d.buyer_spn_id is not null);
  get diagnostics v_step = row_count;
  v_closed := v_closed + v_step;

  if nullif(trim(coalesce(d.seller_name, '')), '') is null then
    insert into public.nav_deal_tasks_v2 (deal_id, title, description, assigned_to, assigned_role, priority, source, created_by)
    select p_deal_id,
           'Указать продавца',
           'Заполнить имя продавца в блоке «Стороны и объект», чтобы сделка была понятной в списках, очереди юриста и истории.',
           coalesce(d.seller_spn_id, d.created_by),
           'spn'::public.nav_v2_user_role,
           'normal'::public.nav_v2_task_priority,
           'auto_quality_seller_name',
           d.created_by
    where not exists (
      select 1 from public.nav_deal_tasks_v2 t
      where t.deal_id = p_deal_id
        and t.source = 'auto_quality_seller_name'
        and t.status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)
    );
    get diagnostics v_step = row_count;
    v_inserted := v_inserted + v_step;
  end if;

  if nullif(trim(coalesce(d.buyer_name, '')), '') is null then
    insert into public.nav_deal_tasks_v2 (deal_id, title, description, assigned_to, assigned_role, priority, source, created_by)
    select p_deal_id,
           'Указать покупателя',
           'Заполнить имя покупателя в блоке «Стороны и объект», чтобы карточка сделки не оставалась обезличенной.',
           coalesce(d.buyer_spn_id, d.created_by),
           'spn'::public.nav_v2_user_role,
           'normal'::public.nav_v2_task_priority,
           'auto_quality_buyer_name',
           d.created_by
    where not exists (
      select 1 from public.nav_deal_tasks_v2 t
      where t.deal_id = p_deal_id
        and t.source = 'auto_quality_buyer_name'
        and t.status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)
    );
    get diagnostics v_step = row_count;
    v_inserted := v_inserted + v_step;
  end if;

  if d.preparation_mode in ('deposit', 'deal', 'check_docs') and nullif(trim(coalesce(d.address, '')), '') is null then
    insert into public.nav_deal_tasks_v2 (deal_id, title, description, assigned_to, assigned_role, priority, source, created_by)
    select p_deal_id,
           'Указать адрес или ориентир объекта',
           'Для подготовки задатка, сделки или проверки документов нужен адрес, кадастровый номер или понятный ориентир объекта.',
           coalesce(d.seller_spn_id, d.buyer_spn_id, d.created_by),
           'spn'::public.nav_v2_user_role,
           'high'::public.nav_v2_task_priority,
           'auto_quality_address',
           d.created_by
    where not exists (
      select 1 from public.nav_deal_tasks_v2 t
      where t.deal_id = p_deal_id
        and t.source = 'auto_quality_address'
        and t.status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)
    );
    get diagnostics v_step = row_count;
    v_inserted := v_inserted + v_step;
  end if;

  if d.seller_spn_id is null and d.buyer_spn_id is null then
    insert into public.nav_deal_tasks_v2 (deal_id, title, description, assigned_to, assigned_role, priority, source, created_by)
    select p_deal_id,
           'Назначить ответственного СПН',
           'В сделке не указан СПН продавца или покупателя. Назначьте ответственного, чтобы карточка была видна нужному специалисту и менеджеру.',
           coalesce(d.manager_id, d.created_by),
           'manager'::public.nav_v2_user_role,
           'urgent'::public.nav_v2_task_priority,
           'auto_quality_responsible_spn',
           d.created_by
    where not exists (
      select 1 from public.nav_deal_tasks_v2 t
      where t.deal_id = p_deal_id
        and t.source = 'auto_quality_responsible_spn'
        and t.status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)
    );
    get diagnostics v_step = row_count;
    v_inserted := v_inserted + v_step;
  end if;

  return jsonb_build_object(
    'ok', true,
    'deal_id', p_deal_id,
    'inserted_tasks', v_inserted,
    'closed_tasks', v_closed
  );
end;
$$;

create or replace function public.nav_v2_deal_quality_tasks_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.nav_v2_sync_deal_quality_tasks(new.id);
  return new;
end;
$$;

drop trigger if exists nav_deals_v2_quality_tasks_aiu on public.nav_deals_v2;
create trigger nav_deals_v2_quality_tasks_aiu
after insert or update of seller_name, buyer_name, address, seller_spn_id, buyer_spn_id, manager_id, preparation_mode
on public.nav_deals_v2
for each row
execute function public.nav_v2_deal_quality_tasks_trigger();

create or replace function public.nav_v2_get_internal_rpc_lockdown_health()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_items jsonb;
  v_open_count integer := 0;
  v_missing_count integer := 0;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор';
  end if;

  select role into v_role
  from public.nav_user_profiles
  where id = v_uid
    and is_active is true;

  if v_role not in ('owner', 'admin') then
    raise exception 'Проверка внутренних RPC доступна только owner/admin';
  end if;

  with expected(title, signature) as (
    values
      ('Проверка статуса сделки', 'public.nav_v2_can_change_deal_status(uuid, nav_v2_deal_status, uuid)'),
      ('Проверка статуса документа', 'public.nav_v2_can_change_document_status(uuid, text, uuid)'),
      ('Проверка статуса задачи', 'public.nav_v2_can_change_task_status(uuid, uuid)'),
      ('Очистка демо-данных', 'public.nav_v2_clear_demo_data()'),
      ('Очистка демо-данных unchecked', 'public.nav_v2_clear_demo_data_unchecked_20260622()'),
      ('Защита профиля', 'public.nav_v2_guard_profile_self_escalation()'),
      ('Синхронизация качества сделки', 'public.nav_v2_sync_deal_quality_tasks(uuid)'),
      ('Триггер качества сделки', 'public.nav_v2_deal_quality_tasks_trigger()'),
      ('Счетчик разрывов передачи', 'public.nav_v2_handoff_gap_count(uuid)'),
      ('Seed демо-данных', 'public.nav_v2_seed_demo_data()'),
      ('Seed демо-данных unchecked', 'public.nav_v2_seed_demo_data_unchecked_20260622()'),
      ('Автосрок задачи', 'public.nav_v2_set_auto_task_due_date()'),
      ('updated_at trigger', 'public.nav_v2_touch_updated_at()')
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
      'public_can_execute', public_can_execute,
      'locked_down', exists_in_db and not authenticated_can_execute and not anon_can_execute and not public_can_execute
    ) order by title), '[]'::jsonb),
    count(*) filter (where not exists_in_db),
    count(*) filter (where exists_in_db and (authenticated_can_execute or anon_can_execute or public_can_execute))
  into v_items, v_missing_count, v_open_count
  from checked;

  return jsonb_build_object(
    'ok', v_missing_count = 0 and v_open_count = 0,
    'missing_count', v_missing_count,
    'open_count', v_open_count,
    'items', v_items
  );
end;
$$;

revoke execute on function public.nav_v2_sync_deal_quality_tasks(uuid) from anon, authenticated, public;
revoke execute on function public.nav_v2_deal_quality_tasks_trigger() from anon, authenticated, public;
revoke execute on function public.nav_v2_get_internal_rpc_lockdown_health() from anon, public;
grant execute on function public.nav_v2_get_internal_rpc_lockdown_health() to authenticated;

select public.nav_v2_sync_deal_quality_tasks(id)
from public.nav_deals_v2;
