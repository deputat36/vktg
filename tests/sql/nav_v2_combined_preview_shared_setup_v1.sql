\set ON_ERROR_STOP on

-- Repository-only shared synthetic overlay for the combined quality -> bounded -> intake lifecycle.
-- The base schema is created once by nav_v2_privacy_aligned_quality_harness_setup.sql.
-- This file adds only the production-like surfaces required by bounded DTO/identity tests.

create or replace function auth.uid()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

alter table public.nav_user_profiles
  add column full_name text,
  add column manager_id uuid references public.nav_user_profiles(id) on delete set null;

update public.nav_user_profiles
set full_name = concat('Synthetic ', upper(left(id::text, 8)))
where full_name is null;

alter table public.nav_user_profiles
  alter column full_name set not null;

create type public.nav_v2_side as enum (
  'seller', 'buyer', 'both', 'other_agency', 'external_party', 'company'
);

alter table public.nav_deals_v2
  add column price_total numeric,
  add column settlements_agreed boolean not null default false;

alter table public.nav_deal_tasks_v2
  drop constraint if exists nav_deal_tasks_v2_task_type_check;

alter table public.nav_deal_tasks_v2
  add constraint nav_deal_tasks_v2_combined_task_type_check check (
    task_type is null or task_type in (
      'operational_task',
      'document_request',
      'quality_warning',
      'system_recommendation',
      'legal_blocker',
      'broker_task',
      'management_escalation',
      'document_check',
      'term_approval',
      'legal_decision',
      'financial_decision',
      'corporate_document_signing',
      'card_correction',
      'contract_preparation',
      'appointment_scheduling',
      'post_deal_action'
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
  deal_id uuid not null references public.nav_deals_v2(id) on delete cascade,
  side public.nav_v2_side not null default 'both',
  status text not null default 'needed',
  is_required boolean not null default true,
  responsible_role public.nav_v2_user_role,
  due_date date,
  created_at timestamptz not null default now()
);

create table public.nav_deal_risks_v2 (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.nav_deals_v2(id) on delete cascade,
  level text not null default 'yellow',
  is_resolved boolean not null default false,
  blocks_deposit boolean not null default false,
  blocks_deal boolean not null default false,
  created_at timestamptz not null default now()
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

create or replace function public.nav_v2_can_change_document_status(
  p_document_id uuid,
  p_status text default null,
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
    from public.nav_deal_documents_v2 d
    where d.id = p_document_id
      and nav_v2_private.nav_v2_can_edit_deal(d.deal_id, p_uid)
  );
$$;

create or replace function public.nav_v2_can_change_task_status(
  p_task_id uuid,
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
    from public.nav_deal_tasks_v2 t
    join public.nav_user_profiles p on p.id = p_uid and p.is_active is true
    where t.id = p_task_id
      and (
        nav_v2_private.nav_v2_can_edit_deal(t.deal_id, p_uid)
        or t.assigned_to = p_uid
        or (t.assigned_to is null and t.assigned_role = p.role)
      )
  );
$$;

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-000000000001', 'combined.owner@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'combined.admin@example.test'),
  ('00000000-0000-4000-8000-000000000003', 'combined.manager@example.test'),
  ('00000000-0000-4000-8000-000000000004', 'combined.seller.spn@example.test'),
  ('00000000-0000-4000-8000-000000000005', 'combined.buyer.spn@example.test'),
  ('00000000-0000-4000-8000-000000000006', 'combined.other.spn@example.test'),
  ('00000000-0000-4000-8000-000000000007', 'combined.lawyer@example.test'),
  ('00000000-0000-4000-8000-000000000008', 'combined.broker@example.test'),
  ('00000000-0000-4000-8000-000000000009', 'combined.viewer@example.test');

insert into public.nav_user_profiles(id, full_name, role, manager_id, is_active) values
  ('00000000-0000-4000-8000-000000000001', 'Combined Owner', 'owner', null, true),
  ('00000000-0000-4000-8000-000000000002', 'Combined Admin', 'admin', null, true),
  ('00000000-0000-4000-8000-000000000003', 'Combined Manager', 'manager', null, true),
  ('00000000-0000-4000-8000-000000000004', 'Combined Seller SPN', 'spn', '00000000-0000-4000-8000-000000000003', true),
  ('00000000-0000-4000-8000-000000000005', 'Combined Buyer SPN', 'spn', '00000000-0000-4000-8000-000000000003', true),
  ('00000000-0000-4000-8000-000000000006', 'Combined Other SPN', 'spn', null, true),
  ('00000000-0000-4000-8000-000000000007', 'Combined Lawyer', 'lawyer', null, true),
  ('00000000-0000-4000-8000-000000000008', 'Combined Broker', 'broker', null, true),
  ('00000000-0000-4000-8000-000000000009', 'Combined Viewer', 'viewer', null, true);

insert into public.nav_deals_v2(
  id, title, status, risk_level, created_by, manager_id,
  seller_spn_id, buyer_spn_id, lawyer_id, broker_id,
  representation_model, preparation_mode, object_type, address,
  cadastral_number, next_action, lawyer_needed, broker_needed,
  deal_summary, wizard_snapshot, price_total, settlements_agreed
) values
  (
    '10000000-0000-4000-8000-000000000001',
    'Combined Synthetic Deal One', 'need_documents', 'yellow',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000005',
    '00000000-0000-4000-8000-000000000007',
    '00000000-0000-4000-8000-000000000008',
    'separate_spn_both', 'deal', 'flat_mkd',
    'г. Тестовый, ул. Безопасная, д. 1, кв. 99', null,
    'Проверить структурированные статусы', false, false,
    '{}'::jsonb,
    '{"deal":{"intake_contract_version":1,"intake_draft":{"dateUnknown":true}}}'::jsonb,
    5000000, true
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'Combined Synthetic Deal Two', 'draft', 'green',
    '00000000-0000-4000-8000-000000000006',
    null,
    '00000000-0000-4000-8000-000000000006',
    null,
    '00000000-0000-4000-8000-000000000007',
    null,
    'seller', 'consult', 'land',
    'г. Тестовый, ориентир 2', null,
    'Уточнить условия консультации', false, false,
    '{}'::jsonb,
    '{"deal":{"intake_contract_version":1,"intake_draft":{"dateUnknown":true}}}'::jsonb,
    null, false
  );

insert into public.nav_deal_tasks_v2(
  id, deal_id, title, assigned_to, assigned_role, status, priority,
  due_date, source, created_by, task_type, sla_days
) values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Combined legacy task must survive',
  '00000000-0000-4000-8000-000000000004',
  'spn', 'open', 'normal', current_date + 3,
  'legacy_combined_synthetic',
  '00000000-0000-4000-8000-000000000001',
  'operational_task', null
);

select 'Navigator v2 combined preview shared setup completed' as result;
