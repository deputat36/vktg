create extension if not exists "pgcrypto";

do $$ begin
  create type public.user_role as enum ('spn','lawyer','broker','manager','admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.deal_status as enum ('draft','needs_lawyer','lawyer_review','needs_documents','mortgage_review','ready_for_deposit','ready_for_deal','registration','done','cancelled','archive');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'spn',
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status public.deal_status not null default 'draft',
  created_by uuid references public.profiles(id),
  seller_spn_id uuid references public.profiles(id),
  buyer_spn_id uuid references public.profiles(id),
  lawyer_id uuid references public.profiles(id),
  broker_id uuid references public.profiles(id),
  manager_id uuid references public.profiles(id),
  object_type text,
  address text,
  price_fact text,
  price_contract text,
  risk_level text,
  readiness_deposit int default 0,
  readiness_deal int default 0,
  deal_json jsonb not null default '{}'::jsonb,
  analysis_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.deal_comments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  comment text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.deal_tasks (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  assigned_to uuid references public.profiles(id),
  title text not null,
  due_date date,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.deals enable row level security;
alter table public.deal_comments enable row level security;
alter table public.deal_tasks enable row level security;

create policy "profiles_select_authenticated" on public.profiles for select to authenticated using (is_active = true);
create policy "profiles_update_self" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "deals_select_assigned_or_management" on public.deals for select to authenticated using (
  created_by = (select auth.uid()) or seller_spn_id = (select auth.uid()) or buyer_spn_id = (select auth.uid()) or lawyer_id = (select auth.uid()) or broker_id = (select auth.uid()) or manager_id = (select auth.uid()) or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('manager','admin') and p.is_active = true)
);
create policy "deals_insert_authenticated" on public.deals for insert to authenticated with check (created_by = (select auth.uid()) or created_by is null);
create policy "deals_update_assigned_or_management" on public.deals for update to authenticated using (
  created_by = (select auth.uid()) or seller_spn_id = (select auth.uid()) or buyer_spn_id = (select auth.uid()) or lawyer_id = (select auth.uid()) or broker_id = (select auth.uid()) or manager_id = (select auth.uid()) or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('manager','admin') and p.is_active = true)
) with check (true);
