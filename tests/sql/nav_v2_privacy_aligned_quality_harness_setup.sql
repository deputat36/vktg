\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create schema nav_v2_private;
create schema harness;
revoke all on schema nav_v2_private from public, anon, authenticated;
grant usage on schema nav_v2_private to service_role;

create type public.nav_v2_user_role as enum ('owner','admin','manager','spn','lawyer','broker','viewer');
create type public.nav_v2_deal_status as enum (
  'draft','need_info','need_lawyer','need_broker','need_documents','ready_for_deposit',
  'deposit_done','preparing_deal','ready_for_deal','registration','registered','closed','cancelled'
);
create type public.nav_v2_risk_level as enum ('green','yellow','red');
create type public.nav_v2_task_status as enum ('open','in_progress','done','cancelled');
create type public.nav_v2_task_priority as enum ('low','normal','high','urgent');

create table auth.users (
  id uuid primary key,
  email text
);

create table public.nav_user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.nav_v2_user_role not null,
  is_active boolean not null default true
);

create table public.nav_deals_v2 (
  id uuid primary key,
  title text not null default 'Новая сделка',
  status public.nav_v2_deal_status not null default 'draft',
  risk_level public.nav_v2_risk_level not null default 'green',
  created_by uuid not null references auth.users(id) on delete restrict,
  manager_id uuid references public.nav_user_profiles(id) on delete set null,
  seller_spn_id uuid references public.nav_user_profiles(id) on delete set null,
  buyer_spn_id uuid references public.nav_user_profiles(id) on delete set null,
  lawyer_id uuid references public.nav_user_profiles(id) on delete set null,
  broker_id uuid references public.nav_user_profiles(id) on delete set null,
  representation_model text not null default 'unknown',
  preparation_mode text not null default 'deal',
  object_type text,
  address text,
  cadastral_number text,
  next_action text,
  lawyer_needed boolean not null default false,
  broker_needed boolean not null default false,
  deal_summary jsonb not null default '{}'::jsonb,
  wizard_snapshot jsonb not null default '{}'::jsonb,
  seller_name text,
  buyer_name text,
  seller_phone text,
  buyer_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nav_deal_tasks_v2 (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.nav_deals_v2(id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid references public.nav_user_profiles(id) on delete set null,
  assigned_role public.nav_v2_user_role,
  status public.nav_v2_task_status not null default 'open',
  priority public.nav_v2_task_priority not null default 'normal',
  due_date date,
  source text,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  task_type text,
  sla_days integer,
  constraint nav_deal_tasks_v2_sla_days_check check (sla_days is null or (sla_days >= 1 and sla_days <= 365)),
  constraint nav_deal_tasks_v2_task_type_check check (
    task_type is null or task_type = any(array[
      'operational_task','document_request','quality_warning','system_recommendation',
      'legal_blocker','broker_task','management_escalation'
    ])
  )
);

create unique index nav_deal_tasks_v2_open_auto_quality_unique_idx
  on public.nav_deal_tasks_v2 (deal_id, source)
  where source like 'auto_quality_%'
    and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status);

create or replace function public.nav_v2_set_auto_task_due_date()
returns trigger
language plpgsql
set search_path = public
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

create trigger nav_deal_tasks_v2_auto_due_date
before insert on public.nav_deal_tasks_v2
for each row execute function public.nav_v2_set_auto_task_due_date();

create or replace function harness.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if coalesce(p_condition, false) is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$function$;

-- Exact current production quality implementation snapshot.
create or replace function public.nav_v2_sync_deal_quality_tasks(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  d public.nav_deals_v2%rowtype;
  v_inserted int := 0;
  v_closed int := 0;
  v_step int := 0;
begin
  select * into d from public.nav_deals_v2 where id = p_deal_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'deal_not_found', 'deal_id', p_deal_id);
  end if;

  update public.nav_deal_tasks_v2 set status='done', completed_at=coalesce(completed_at,now()), updated_at=now()
  where deal_id=p_deal_id and source='auto_quality_seller_name' and status in ('open','in_progress')
    and nullif(trim(coalesce(d.seller_name,'')),'') is not null;
  get diagnostics v_step = row_count; v_closed := v_closed + v_step;
  update public.nav_deal_tasks_v2 set status='done', completed_at=coalesce(completed_at,now()), updated_at=now()
  where deal_id=p_deal_id and source='auto_quality_buyer_name' and status in ('open','in_progress')
    and nullif(trim(coalesce(d.buyer_name,'')),'') is not null;
  get diagnostics v_step = row_count; v_closed := v_closed + v_step;
  update public.nav_deal_tasks_v2 set status='done', completed_at=coalesce(completed_at,now()), updated_at=now()
  where deal_id=p_deal_id and source='auto_quality_address' and status in ('open','in_progress')
    and nullif(trim(coalesce(d.address,'')),'') is not null;
  get diagnostics v_step = row_count; v_closed := v_closed + v_step;
  update public.nav_deal_tasks_v2 set status='done', completed_at=coalesce(completed_at,now()), updated_at=now()
  where deal_id=p_deal_id and source='auto_quality_responsible_spn' and status in ('open','in_progress')
    and (d.seller_spn_id is not null or d.buyer_spn_id is not null);
  get diagnostics v_step = row_count; v_closed := v_closed + v_step;

  if nullif(trim(coalesce(d.seller_name,'')),'') is null then
    insert into public.nav_deal_tasks_v2(deal_id,title,description,assigned_to,assigned_role,priority,source,created_by)
    select p_deal_id,'Указать продавца','Заполнить имя продавца.',coalesce(d.seller_spn_id,d.created_by),'spn','normal','auto_quality_seller_name',d.created_by
    where not exists(select 1 from public.nav_deal_tasks_v2 t where t.deal_id=p_deal_id and t.source='auto_quality_seller_name' and t.status in ('open','in_progress'));
    get diagnostics v_step = row_count; v_inserted := v_inserted + v_step;
  end if;
  if nullif(trim(coalesce(d.buyer_name,'')),'') is null then
    insert into public.nav_deal_tasks_v2(deal_id,title,description,assigned_to,assigned_role,priority,source,created_by)
    select p_deal_id,'Указать покупателя','Заполнить имя покупателя.',coalesce(d.buyer_spn_id,d.created_by),'spn','normal','auto_quality_buyer_name',d.created_by
    where not exists(select 1 from public.nav_deal_tasks_v2 t where t.deal_id=p_deal_id and t.source='auto_quality_buyer_name' and t.status in ('open','in_progress'));
    get diagnostics v_step = row_count; v_inserted := v_inserted + v_step;
  end if;
  if d.preparation_mode in ('deposit','deal','check_docs') and nullif(trim(coalesce(d.address,'')),'') is null then
    insert into public.nav_deal_tasks_v2(deal_id,title,description,assigned_to,assigned_role,priority,source,created_by)
    select p_deal_id,'Указать адрес или ориентир объекта','Нужен адрес.',coalesce(d.seller_spn_id,d.buyer_spn_id,d.created_by),'spn','high','auto_quality_address',d.created_by
    where not exists(select 1 from public.nav_deal_tasks_v2 t where t.deal_id=p_deal_id and t.source='auto_quality_address' and t.status in ('open','in_progress'));
    get diagnostics v_step = row_count; v_inserted := v_inserted + v_step;
  end if;
  if d.seller_spn_id is null and d.buyer_spn_id is null then
    insert into public.nav_deal_tasks_v2(deal_id,title,description,assigned_to,assigned_role,priority,source,created_by)
    select p_deal_id,'Назначить ответственного СПН','Нужно назначение.',coalesce(d.manager_id,d.created_by),'manager','urgent','auto_quality_responsible_spn',d.created_by
    where not exists(select 1 from public.nav_deal_tasks_v2 t where t.deal_id=p_deal_id and t.source='auto_quality_responsible_spn' and t.status in ('open','in_progress'));
    get diagnostics v_step = row_count; v_inserted := v_inserted + v_step;
  end if;

  return jsonb_build_object('ok',true,'deal_id',p_deal_id,'inserted_tasks',v_inserted,'closed_tasks',v_closed);
end;
$function$;

create or replace function public.nav_v2_deal_quality_tasks_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  perform public.nav_v2_sync_deal_quality_tasks(new.id);
  return new;
end;
$function$;

create trigger nav_deals_v2_quality_tasks_aiu
after insert or update of seller_name,buyer_name,address,seller_spn_id,buyer_spn_id,manager_id,preparation_mode
on public.nav_deals_v2
for each row execute function public.nav_v2_deal_quality_tasks_trigger();

revoke execute on function public.nav_v2_sync_deal_quality_tasks(uuid) from anon, authenticated, public;
revoke execute on function public.nav_v2_deal_quality_tasks_trigger() from anon, authenticated, public;

create table harness.quality_snapshot (
  object_name text primary key,
  definition text not null,
  definition_md5 text not null
);
insert into harness.quality_snapshot values
  ('sync', pg_get_functiondef('public.nav_v2_sync_deal_quality_tasks(uuid)'::regprocedure), md5(pg_get_functiondef('public.nav_v2_sync_deal_quality_tasks(uuid)'::regprocedure))),
  ('trigger_function', pg_get_functiondef('public.nav_v2_deal_quality_tasks_trigger()'::regprocedure), md5(pg_get_functiondef('public.nav_v2_deal_quality_tasks_trigger()'::regprocedure))),
  ('trigger', pg_get_triggerdef((select oid from pg_trigger where tgname='nav_deals_v2_quality_tasks_aiu' and not tgisinternal), true), md5(pg_get_triggerdef((select oid from pg_trigger where tgname='nav_deals_v2_quality_tasks_aiu' and not tgisinternal), true)));

insert into auth.users(id,email) values
  ('71000000-0000-4000-8000-000000000001','creator@test.invalid'),
  ('71000000-0000-4000-8000-000000000002','seller@test.invalid'),
  ('71000000-0000-4000-8000-000000000003','buyer@test.invalid'),
  ('71000000-0000-4000-8000-000000000004','manager@test.invalid'),
  ('71000000-0000-4000-8000-000000000005','lawyer@test.invalid'),
  ('71000000-0000-4000-8000-000000000006','broker@test.invalid');
insert into public.nav_user_profiles(id,role) values
  ('71000000-0000-4000-8000-000000000001','spn'),
  ('71000000-0000-4000-8000-000000000002','spn'),
  ('71000000-0000-4000-8000-000000000003','spn'),
  ('71000000-0000-4000-8000-000000000004','manager'),
  ('71000000-0000-4000-8000-000000000005','lawyer'),
  ('71000000-0000-4000-8000-000000000006','broker');

-- Two old rows prove that applying the replacement itself performs no mass cleanup.
insert into public.nav_deals_v2(
  id,created_by,seller_spn_id,representation_model,preparation_mode,object_type,address,next_action
) values
  ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','seller','deal','flat_mkd','Ориентир A','Проверить документы'),
  ('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','seller','deal','flat_mkd','Ориентир B','Проверить документы');

select harness.assert_true(
  (select count(*) from public.nav_deal_tasks_v2 where source in ('auto_quality_seller_name','auto_quality_buyer_name') and status='open') = 4,
  'legacy quality seed did not create four name tasks'
);
