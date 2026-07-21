-- Schema-only extension for the consolidated bounded candidate.
-- It intentionally omits DTO document/risk fixture rows so canonical mutation
-- assertions can still prove that bounded task RPCs create no documents or risks.

alter table public.nav_deals_v2
  add column object_type text,
  add column address text,
  add column status text not null default 'draft',
  add column risk_level text not null default 'low',
  add column price_total numeric,
  add column settlements_agreed boolean not null default false,
  add column created_at timestamptz not null default now();

update public.nav_deals_v2
set object_type='flat_mkd',
    address='г. Тестовый, ул. Безопасная, д. 1, кв. 99',
    status='need_documents',
    risk_level='medium',
    price_total=5000000,
    settlements_agreed=false
where id='10000000-0000-4000-8000-000000000001';

alter table public.nav_deal_documents_v2
  add column side public.nav_v2_side not null default 'both',
  add column status text not null default 'needed',
  add column is_required boolean not null default true,
  add column responsible_role public.nav_v2_user_role,
  add column due_date date,
  add column created_at timestamptz not null default now();

alter table public.nav_deal_risks_v2
  add column level text not null default 'yellow',
  add column is_resolved boolean not null default false,
  add column blocks_deposit boolean not null default false,
  add column blocks_deal boolean not null default false,
  add column created_at timestamptz not null default now();

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
    where d.id=p_document_id
      and nav_v2_private.nav_v2_can_edit_deal(d.deal_id,p_uid)
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
    join public.nav_user_profiles p on p.id=p_uid and p.is_active is true
    where t.id=p_task_id
      and (
        nav_v2_private.nav_v2_can_edit_deal(t.deal_id,p_uid)
        or t.assigned_to=p_uid
        or (t.assigned_to is null and t.assigned_role=p.role)
      )
  );
$$;

select 'Navigator v2 consolidated bounded schema-only setup completed' as result;
