-- Synthetic PostgreSQL 17 environment for bounded task mutation regression.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema if not exists auth;
create schema if not exists nav_v2_private;

create table auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create type public.nav_v2_user_role as enum (
  'owner', 'admin', 'manager', 'spn', 'lawyer', 'broker', 'viewer'
);
create type public.nav_v2_side as enum (
  'seller', 'buyer', 'both', 'other_agency', 'external_party', 'company'
);
create type public.nav_v2_task_status as enum (
  'open', 'in_progress', 'done', 'cancelled'
);
create type public.nav_v2_task_priority as enum (
  'low', 'normal', 'high', 'urgent'
);

create table public.nav_user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.nav_v2_user_role not null,
  manager_id uuid references public.nav_user_profiles(id) on delete set null,
  is_active boolean not null default true
);

create table public.nav_deals_v2 (
  id uuid primary key,
  title text,
  manager_id uuid references public.nav_user_profiles(id) on delete set null,
  seller_spn_id uuid references public.nav_user_profiles(id) on delete set null,
  buyer_spn_id uuid references public.nav_user_profiles(id) on delete set null,
  lawyer_id uuid references public.nav_user_profiles(id) on delete set null,
  broker_id uuid references public.nav_user_profiles(id) on delete set null,
  deal_summary jsonb not null default '{}'::jsonb,
  wizard_snapshot jsonb not null default '{}'::jsonb
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
  constraint nav_deal_tasks_v2_sla_days_check check (
    sla_days is null or (sla_days >= 1 and sla_days <= 365)
  ),
  constraint nav_deal_tasks_v2_task_type_check check (
    task_type is null or task_type in (
      'operational_task',
      'document_request',
      'quality_warning',
      'system_recommendation',
      'legal_blocker',
      'broker_task',
      'management_escalation'
    )
  )
);

create table public.nav_deal_events_v2 (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.nav_deals_v2(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  event_title text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.nav_deal_documents_v2 (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.nav_deals_v2(id) on delete cascade
);

create table public.nav_deal_risks_v2 (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.nav_deals_v2(id) on delete cascade
);

create or replace function nav_v2_private.nav_v2_can_view_deal(
  p_deal_id uuid,
  p_uid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nav_deals_v2 d
    join public.nav_user_profiles p on p.id = p_uid and p.is_active is true
    where d.id = p_deal_id
      and (
        p.role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role)
        or d.manager_id = p_uid
        or d.seller_spn_id = p_uid
        or d.buyer_spn_id = p_uid
        or d.lawyer_id = p_uid
        or d.broker_id = p_uid
        or (
          p.role = 'manager'::public.nav_v2_user_role
          and exists (
            select 1
            from public.nav_user_profiles spn
            where spn.id in (d.seller_spn_id, d.buyer_spn_id)
              and spn.manager_id = p_uid
              and spn.is_active is true
          )
        )
      )
  );
$$;

create or replace function nav_v2_private.nav_v2_can_edit_deal(
  p_deal_id uuid,
  p_uid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select nav_v2_private.nav_v2_can_view_deal(p_deal_id, p_uid)
    and exists (
      select 1
      from public.nav_user_profiles p
      where p.id = p_uid
        and p.is_active is true
        and p.role <> 'viewer'::public.nav_v2_user_role
    );
$$;

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'admin@example.test'),
  ('00000000-0000-4000-8000-000000000003', 'manager@example.test'),
  ('00000000-0000-4000-8000-000000000004', 'seller.spn@example.test'),
  ('00000000-0000-4000-8000-000000000005', 'buyer.spn@example.test'),
  ('00000000-0000-4000-8000-000000000006', 'other.spn@example.test'),
  ('00000000-0000-4000-8000-000000000007', 'lawyer@example.test'),
  ('00000000-0000-4000-8000-000000000008', 'broker@example.test'),
  ('00000000-0000-4000-8000-000000000009', 'viewer@example.test');

insert into public.nav_user_profiles(id, full_name, role, manager_id, is_active) values
  ('00000000-0000-4000-8000-000000000001', 'Owner Synthetic', 'owner', null, true),
  ('00000000-0000-4000-8000-000000000002', 'Admin Synthetic', 'admin', null, true),
  ('00000000-0000-4000-8000-000000000003', 'Manager Synthetic', 'manager', null, true),
  ('00000000-0000-4000-8000-000000000004', 'Seller SPN Synthetic', 'spn', '00000000-0000-4000-8000-000000000003', true),
  ('00000000-0000-4000-8000-000000000005', 'Buyer SPN Synthetic', 'spn', '00000000-0000-4000-8000-000000000003', true),
  ('00000000-0000-4000-8000-000000000006', 'Other SPN Synthetic', 'spn', null, true),
  ('00000000-0000-4000-8000-000000000007', 'Lawyer Synthetic', 'lawyer', null, true),
  ('00000000-0000-4000-8000-000000000008', 'Broker Synthetic', 'broker', null, true),
  ('00000000-0000-4000-8000-000000000009', 'Viewer Synthetic', 'viewer', null, true);

insert into public.nav_deals_v2(
  id, title, manager_id, seller_spn_id, buyer_spn_id, lawyer_id, broker_id
) values
  (
    '10000000-0000-4000-8000-000000000001',
    'Synthetic Deal One',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000007',
    '00000000-0000-4000-8000-000000000008'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'Synthetic Deal Two',
    null,
    '00000000-0000-4000-8000-000000000006',
    null,
    '00000000-0000-4000-8000-000000000007',
    null
  );

insert into public.nav_deal_tasks_v2(
  id, deal_id, title, assigned_to, assigned_role, status, priority,
  due_date, source, created_by, task_type, sla_days
) values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Legacy task must remain untouched',
  '00000000-0000-4000-8000-000000000004',
  'spn',
  'open',
  'normal',
  current_date + 3,
  'legacy_synthetic',
  '00000000-0000-4000-8000-000000000001',
  'operational_task',
  null
);
