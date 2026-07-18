\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema nav_v2_private;
revoke all on schema nav_v2_private from public, anon, authenticated;
grant usage on schema nav_v2_private to service_role;

-- Marker tables prove that the adapter never creates or changes business rows.
create table public.nav_deals_v2 (id integer primary key, marker text not null);
create table public.nav_deal_documents_v2 (id integer primary key, marker text not null);
create table public.nav_deal_tasks_v2 (id integer primary key, marker text not null);
create table public.nav_deal_risks_v2 (id integer primary key, marker text not null);

insert into public.nav_deals_v2 values (1, 'before');
insert into public.nav_deal_documents_v2 values (1, 'before');
insert into public.nav_deal_tasks_v2 values (1, 'before');
insert into public.nav_deal_risks_v2 values (1, 'before');
