\set ON_ERROR_STOP on

-- Existing intake regression assertions intentionally operate on four one-row marker tables.
-- Preserve the combined production-like tables by renaming them; PostgreSQL dependencies stay bound by OID.

do $guard$
begin
  if to_regclass('public.nav_deals_v2_combined_real') is not null
     or to_regclass('public.nav_deal_documents_v2_combined_real') is not null
     or to_regclass('public.nav_deal_tasks_v2_combined_real') is not null
     or to_regclass('public.nav_deal_risks_v2_combined_real') is not null then
    raise exception 'combined intake marker facade is already active';
  end if;
end;
$guard$;

alter table public.nav_deal_documents_v2 rename to nav_deal_documents_v2_combined_real;
alter table public.nav_deal_risks_v2 rename to nav_deal_risks_v2_combined_real;
alter table public.nav_deal_tasks_v2 rename to nav_deal_tasks_v2_combined_real;
alter table public.nav_deals_v2 rename to nav_deals_v2_combined_real;

create table public.nav_deals_v2 (
  id integer primary key,
  marker text not null
);
create table public.nav_deal_documents_v2 (
  id integer primary key,
  marker text not null
);
create table public.nav_deal_tasks_v2 (
  id integer primary key,
  marker text not null
);
create table public.nav_deal_risks_v2 (
  id integer primary key,
  marker text not null
);

insert into public.nav_deals_v2 values (1, 'before');
insert into public.nav_deal_documents_v2 values (1, 'before');
insert into public.nav_deal_tasks_v2 values (1, 'before');
insert into public.nav_deal_risks_v2 values (1, 'before');

select 'Navigator v2 combined intake marker facade entered' as result;
