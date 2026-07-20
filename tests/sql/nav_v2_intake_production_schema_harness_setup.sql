\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema nav_v2_private;
create schema harness;
revoke all on schema nav_v2_private from public, anon, authenticated;
grant usage on schema nav_v2_private to service_role;

create extension if not exists pgcrypto;

create type public.nav_v2_deal_status as enum (
  'draft','need_info','need_lawyer','need_broker','need_documents','ready_for_deposit',
  'deposit_done','preparing_deal','ready_for_deal','registration','registered','closed','cancelled'
);
create type public.nav_v2_risk_level as enum ('green','yellow','red');
create type public.nav_v2_user_role as enum ('owner','admin','manager','spn','lawyer','broker','viewer');
create type public.nav_v2_side as enum ('seller','buyer','both','other_agency','external_party','company');
create type public.nav_v2_task_status as enum ('open','in_progress','done','cancelled');
create type public.nav_v2_task_priority as enum ('low','normal','high','urgent');

create table auth.users (id uuid primary key);
create table public.nav_user_profiles (
  id uuid primary key references auth.users(id),
  role public.nav_v2_user_role not null,
  is_active boolean not null default true
);

insert into auth.users(id) values
 ('63000000-0000-4000-8000-000000000001'),
 ('63000000-0000-4000-8000-000000000002'),
 ('63000000-0000-4000-8000-000000000003'),
 ('63000000-0000-4000-8000-000000000004');
insert into public.nav_user_profiles(id,role) values
 ('63000000-0000-4000-8000-000000000001','spn'),
 ('63000000-0000-4000-8000-000000000002','spn'),
 ('63000000-0000-4000-8000-000000000003','lawyer'),
 ('63000000-0000-4000-8000-000000000004','broker');

create table public.nav_deals_v2 (
 id uuid primary key default gen_random_uuid(),
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
 object_subtype text,
 address text,
 cadastral_number text,
 price_total numeric,
 price_contract numeric,
 deposit_amount numeric,
 readiness_deposit integer not null default 0 check(readiness_deposit between 0 and 100),
 readiness_deal integer not null default 0 check(readiness_deal between 0 and 100),
 lawyer_needed boolean not null default false,
 broker_needed boolean not null default false,
 has_children boolean not null default false,
 has_mortgage boolean not null default false,
 has_matcap boolean not null default false,
 has_nominal_child_money boolean not null default false,
 expenses_agreed boolean not null default false,
 settlements_agreed boolean not null default false,
 documents_min_ready boolean not null default false,
 deal_summary jsonb not null default '{}'::jsonb,
 wizard_snapshot jsonb not null default '{}'::jsonb,
 next_action text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 seller_name text,
 buyer_name text,
 seller_phone text,
 buyer_phone text
);

create table public.nav_deal_participants_v2 (
 id uuid primary key default gen_random_uuid(),
 deal_id uuid not null references public.nav_deals_v2(id) on delete cascade,
 user_id uuid references public.nav_user_profiles(id) on delete set null,
 role_in_deal text not null,
 side public.nav_v2_side not null default 'company',
 can_view boolean not null default true,
 can_edit boolean not null default false,
 can_manage_tasks boolean not null default false,
 can_view_finance boolean not null default false,
 display_name text,
 phone text,
 comment text,
 created_at timestamptz not null default now()
);

create table public.nav_deal_documents_v2 (
 id uuid primary key default gen_random_uuid(),
 deal_id uuid not null references public.nav_deals_v2(id) on delete cascade,
 side public.nav_v2_side not null default 'company',
 category text not null default 'general',
 title text not null,
 description text,
 required_for_deposit boolean not null default false,
 required_for_deal boolean not null default true,
 is_required boolean not null default true,
 status text not null default 'needed',
 source_hint text,
 checked_by uuid references auth.users(id) on delete set null,
 checked_at timestamptz,
 created_at timestamptz not null default now(),
 requested_at timestamptz,
 assigned_to uuid references public.nav_user_profiles(id) on delete set null,
 responsible_role public.nav_v2_user_role,
 due_date date,
 status_note text,
 problem_note text,
 last_status_changed_at timestamptz,
 resolved_at timestamptz,
 updated_at timestamptz not null default now()
);

create table public.nav_deal_risks_v2 (
 id uuid primary key default gen_random_uuid(),
 deal_id uuid not null references public.nav_deals_v2(id) on delete cascade,
 level public.nav_v2_risk_level not null default 'yellow',
 category text not null,
 title text not null,
 description text,
 recommendation text,
 blocks_deposit boolean not null default false,
 blocks_deal boolean not null default false,
 assigned_role public.nav_v2_user_role,
 is_resolved boolean not null default false,
 resolved_by uuid references auth.users(id) on delete set null,
 resolved_at timestamptz,
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
 task_type text check(task_type is null or task_type = any(array[
   'operational_task','document_request','quality_warning','system_recommendation',
   'legal_blocker','broker_task','management_escalation'
 ])),
 sla_days integer check(sla_days is null or sla_days between 1 and 365)
);
create unique index nav_deal_tasks_v2_open_auto_quality_unique_idx
 on public.nav_deal_tasks_v2(deal_id,source)
 where source like 'auto_quality_%' and status in ('open','in_progress');

create table public.nav_deal_events_v2 (
 id uuid primary key default gen_random_uuid(),
 deal_id uuid references public.nav_deals_v2(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 event_type text not null,
 event_title text not null,
 event_data jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create or replace function harness.assert_true(p_condition boolean,p_message text)
returns void language plpgsql set search_path=pg_catalog as $$
begin if coalesce(p_condition,false) is not true then raise exception 'ASSERTION FAILED: %',p_message; end if; end $$;

create or replace function nav_v2_private.nav_v2_sanitize_client_deal_json(p_deal jsonb)
returns jsonb language sql immutable set search_path=pg_catalog as $$
 select coalesce(p_deal,'{}'::jsonb)-array[
 'sellerName','seller_name','sellerFullName','seller_fio','sellerPhone','seller_phone',
 'buyerName','buyer_name','buyerFullName','buyer_fio','buyerPhone','buyer_phone',
 'clientEmail','client_email']::text[];
$$;

create or replace function nav_v2_private.nav_v2_guard_client_identifiers()
returns trigger language plpgsql set search_path=public,nav_v2_private as $$
begin
 new.seller_name:=null; new.buyer_name:=null; new.seller_phone:=null; new.buyer_phone:=null;
 if jsonb_typeof(new.wizard_snapshot)='object' and jsonb_typeof(new.wizard_snapshot->'deal')='object' then
   new.wizard_snapshot:=jsonb_set(new.wizard_snapshot,'{deal}',nav_v2_private.nav_v2_sanitize_client_deal_json(new.wizard_snapshot->'deal'),true);
 end if;
 if jsonb_typeof(new.deal_summary)='object' then new.deal_summary:=nav_v2_private.nav_v2_sanitize_client_deal_json(new.deal_summary); end if;
 return new;
end $$;
create trigger nav_v2_deals_guard_client_identifiers
 before insert on public.nav_deals_v2 for each row execute function nav_v2_private.nav_v2_guard_client_identifiers();

create or replace function public.nav_v2_set_auto_task_due_date()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.due_date is null and coalesce(new.source,'') like 'auto_%' then
   new.due_date:=current_date+case new.priority when 'urgent' then 1 when 'high' then 2 when 'normal' then 5 else 7 end;
 end if; return new;
end $$;
create trigger nav_deal_tasks_v2_auto_due_date before insert on public.nav_deal_tasks_v2
 for each row execute function public.nav_v2_set_auto_task_due_date();

create or replace function public.nav_v2_deal_quality_tasks_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if nullif(trim(coalesce(new.seller_name,'')),'') is null then
  insert into public.nav_deal_tasks_v2(deal_id,title,assigned_to,assigned_role,priority,source,created_by,task_type)
  values(new.id,'Указать продавца',coalesce(new.seller_spn_id,new.created_by),'spn','normal','auto_quality_seller_name',new.created_by,'quality_warning');
 end if;
 if nullif(trim(coalesce(new.buyer_name,'')),'') is null then
  insert into public.nav_deal_tasks_v2(deal_id,title,assigned_to,assigned_role,priority,source,created_by,task_type)
  values(new.id,'Указать покупателя',coalesce(new.buyer_spn_id,new.created_by),'spn','normal','auto_quality_buyer_name',new.created_by,'quality_warning');
 end if;
 return new;
end $$;
create trigger nav_deals_v2_quality_tasks_aiu after insert on public.nav_deals_v2
 for each row execute function public.nav_v2_deal_quality_tasks_trigger();

create table harness.intake_request_ledger(
 client_request_id uuid primary key,
 result jsonb not null
);
