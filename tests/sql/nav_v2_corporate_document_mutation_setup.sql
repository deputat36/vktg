create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end
$$;

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
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create type public.nav_v2_user_role as enum (
  'owner', 'admin', 'manager', 'spn', 'lawyer', 'broker', 'viewer'
);

create type public.nav_v2_side as enum (
  'seller', 'buyer', 'both', 'other_agency', 'external_party', 'company'
);

create table public.nav_user_profiles (
  id uuid primary key references auth.users(id),
  full_name text not null,
  role public.nav_v2_user_role not null,
  manager_id uuid references auth.users(id),
  is_active boolean not null default true
);

create table public.nav_deals_v2 (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'draft',
  manager_id uuid references auth.users(id),
  seller_spn_id uuid references auth.users(id),
  buyer_spn_id uuid references auth.users(id)
);

create table public.nav_deal_documents_v2 (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.nav_deals_v2(id)
);

create table public.nav_deal_tasks_v2 (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.nav_deals_v2(id)
);

create table public.nav_deal_risks_v2 (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.nav_deals_v2(id)
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
        or (
          p.role = 'manager'::public.nav_v2_user_role
          and exists (
            select 1
            from public.nav_user_profiles member
            where member.manager_id = p_uid
              and member.id in (d.seller_spn_id, d.buyer_spn_id)
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
  select nav_v2_private.nav_v2_can_view_deal(p_deal_id, p_uid);
$$;

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'admin@example.test'),
  ('00000000-0000-4000-8000-000000000003', 'manager@example.test'),
  ('00000000-0000-4000-8000-000000000004', 'seller-spn@example.test'),
  ('00000000-0000-4000-8000-000000000005', 'buyer-spn@example.test'),
  ('00000000-0000-4000-8000-000000000006', 'lawyer@example.test'),
  ('00000000-0000-4000-8000-000000000007', 'broker@example.test'),
  ('00000000-0000-4000-8000-000000000008', 'viewer@example.test'),
  ('00000000-0000-4000-8000-000000000009', 'other-manager@example.test'),
  ('00000000-0000-4000-8000-000000000010', 'other-spn@example.test');

insert into public.nav_user_profiles(id, full_name, role, manager_id, is_active) values
  ('00000000-0000-4000-8000-000000000001', 'Owner Synthetic', 'owner', null, true),
  ('00000000-0000-4000-8000-000000000002', 'Admin Synthetic', 'admin', null, true),
  ('00000000-0000-4000-8000-000000000003', 'Manager Synthetic', 'manager', null, true),
  ('00000000-0000-4000-8000-000000000004', 'Seller SPN Synthetic', 'spn', '00000000-0000-4000-8000-000000000003', true),
  ('00000000-0000-4000-8000-000000000005', 'Buyer SPN Synthetic', 'spn', '00000000-0000-4000-8000-000000000003', true),
  ('00000000-0000-4000-8000-000000000006', 'Lawyer Synthetic', 'lawyer', null, true),
  ('00000000-0000-4000-8000-000000000007', 'Broker Synthetic', 'broker', null, true),
  ('00000000-0000-4000-8000-000000000008', 'Viewer Synthetic', 'viewer', null, true),
  ('00000000-0000-4000-8000-000000000009', 'Other Manager Synthetic', 'manager', null, true),
  ('00000000-0000-4000-8000-000000000010', 'Other SPN Synthetic', 'spn', '00000000-0000-4000-8000-000000000009', true);

insert into public.nav_deals_v2(id, status, manager_id, seller_spn_id, buyer_spn_id) values
  ('10000000-0000-4000-8000-000000000001', 'draft',
   '00000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-000000000004',
   '00000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000002', 'draft',
   '00000000-0000-4000-8000-000000000009',
   '00000000-0000-4000-8000-000000000010',
   null);
