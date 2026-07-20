\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema nav_v2_private;
create schema harness;
revoke all on schema nav_v2_private from public, anon, authenticated;
grant usage on schema nav_v2_private to service_role;

create type public.nav_v2_task_status as enum ('open','in_progress','done','cancelled');

create table public.nav_deals_v2 (
  id uuid primary key,
  representation_model text not null default 'unknown',
  preparation_mode text not null default 'deal',
  address text,
  cadastral_number text,
  seller_spn_id uuid,
  buyer_spn_id uuid
);

create table public.nav_deal_tasks_v2 (
  id uuid primary key,
  deal_id uuid not null references public.nav_deals_v2(id) on delete cascade,
  source text,
  status public.nav_v2_task_status not null default 'open',
  created_at timestamptz not null default now()
);

create or replace function harness.uuid_for(p_value text)
returns uuid
language sql
immutable
set search_path = pg_catalog
as $function$
  select (
    substr(md5(p_value),1,8)||'-'||substr(md5(p_value),9,4)||'-4'||substr(md5(p_value),14,3)||
    '-8'||substr(md5(p_value),18,3)||'-'||substr(md5(p_value),21,12)
  )::uuid;
$function$;

create or replace function harness.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
set search_path = pg_catalog
as $function$
begin
  if coalesce(p_condition,false) is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
end;
$function$;

-- 23 deals mirror the read-only production inventory without copying production data.
insert into public.nav_deals_v2(id,representation_model,preparation_mode,address,cadastral_number,seller_spn_id,buyer_spn_id)
select
  harness.uuid_for('deal-'||n),
  case when n in (22,23) then 'unknown' else 'both' end,
  'deal',
  case when n <= 4 then null else 'synthetic-reference-'||n end,
  null,
  case when n in (22,23) then null else harness.uuid_for('seller-spn-'||n) end,
  case when n in (22,23) then null else harness.uuid_for('buyer-spn-'||n) end
from generate_series(1,23) n;

-- Exact source counts: 23 seller-name, 17 buyer-name, 4 address, 2 responsible-SPN.
insert into public.nav_deal_tasks_v2(id,deal_id,source,status,created_at)
select harness.uuid_for('seller-task-'||n), harness.uuid_for('deal-'||n), 'auto_quality_seller_name', 'open',
       now() - case when n=23 then interval '2 days' else interval '12 days' end
from generate_series(1,23) n;

insert into public.nav_deal_tasks_v2(id,deal_id,source,status,created_at)
select harness.uuid_for('buyer-task-'||n), harness.uuid_for('deal-'||n), 'auto_quality_buyer_name', 'open',
       now() - case when n=17 then interval '3 days' else interval '12 days' end
from generate_series(1,17) n;

insert into public.nav_deal_tasks_v2(id,deal_id,source,status,created_at)
select harness.uuid_for('address-task-'||n), harness.uuid_for('deal-'||n), 'auto_quality_address', 'open', now()-interval '12 days'
from generate_series(1,4) n;

insert into public.nav_deal_tasks_v2(id,deal_id,source,status,created_at)
select harness.uuid_for('responsible-task-'||n), harness.uuid_for('deal-'||(21+n)), 'auto_quality_responsible_spn', 'open', now()-interval '12 days'
from generate_series(1,2) n;

create table harness.before_snapshot as
select
  (select count(*) from public.nav_deals_v2) as deal_count,
  (select count(*) from public.nav_deal_tasks_v2) as task_count,
  (select md5(coalesce(string_agg(id::text||':'||status::text||':'||coalesce(source,''),'|' order by id),'')) from public.nav_deal_tasks_v2) as task_hash;
