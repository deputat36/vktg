\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create schema nav_v2_private;
create extension if not exists pgcrypto;

create table auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid()
returns uuid
language sql
stable
set search_path = pg_catalog
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create type public.nav_v2_user_role as enum (
  'owner', 'admin', 'manager', 'spn', 'lawyer', 'broker', 'viewer'
);

create table public.nav_user_profiles (
  id uuid primary key references auth.users(id),
  email text,
  full_name text not null,
  role public.nav_v2_user_role not null,
  phone text,
  manager_id uuid references auth.users(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Marker tables prove that consultation actions do not create a deal or backlog.
create table public.nav_deals_v2 (id uuid primary key default gen_random_uuid());
create table public.nav_deal_tasks_v2 (id uuid primary key default gen_random_uuid());
create table public.nav_deal_documents_v2 (id uuid primary key default gen_random_uuid());
create table public.nav_deal_risks_v2 (id uuid primary key default gen_random_uuid());

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'admin@example.test'),
  ('00000000-0000-4000-8000-000000000010', 'manager-a@example.test'),
  ('00000000-0000-4000-8000-000000000011', 'manager-b@example.test'),
  ('00000000-0000-4000-8000-000000000020', 'spn-a@example.test'),
  ('00000000-0000-4000-8000-000000000021', 'spn-b@example.test'),
  ('00000000-0000-4000-8000-000000000030', 'lawyer-a@example.test'),
  ('00000000-0000-4000-8000-000000000031', 'lawyer-b@example.test'),
  ('00000000-0000-4000-8000-000000000040', 'broker@example.test'),
  ('00000000-0000-4000-8000-000000000041', 'viewer@example.test');

insert into public.nav_user_profiles (id, email, full_name, role, manager_id) values
  ('00000000-0000-4000-8000-000000000001', 'owner@example.test', 'Owner Synthetic', 'owner', null),
  ('00000000-0000-4000-8000-000000000002', 'admin@example.test', 'Admin Synthetic', 'admin', null),
  ('00000000-0000-4000-8000-000000000010', 'manager-a@example.test', 'Manager A Synthetic', 'manager', null),
  ('00000000-0000-4000-8000-000000000011', 'manager-b@example.test', 'Manager B Synthetic', 'manager', null),
  ('00000000-0000-4000-8000-000000000020', 'spn-a@example.test', 'SPN A Synthetic', 'spn', '00000000-0000-4000-8000-000000000010'),
  ('00000000-0000-4000-8000-000000000021', 'spn-b@example.test', 'SPN B Synthetic', 'spn', '00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000030', 'lawyer-a@example.test', 'Lawyer A Synthetic', 'lawyer', null),
  ('00000000-0000-4000-8000-000000000031', 'lawyer-b@example.test', 'Lawyer B Synthetic', 'lawyer', null),
  ('00000000-0000-4000-8000-000000000040', 'broker@example.test', 'Broker Synthetic', 'broker', null),
  ('00000000-0000-4000-8000-000000000041', 'viewer@example.test', 'Viewer Synthetic', 'viewer', null);
