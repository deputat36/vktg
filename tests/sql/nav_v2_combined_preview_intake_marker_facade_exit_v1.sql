\set ON_ERROR_STOP on

do $guard$
begin
  if to_regclass('public.nav_deals_v2_combined_real') is null
     or to_regclass('public.nav_deal_documents_v2_combined_real') is null
     or to_regclass('public.nav_deal_tasks_v2_combined_real') is null
     or to_regclass('public.nav_deal_risks_v2_combined_real') is null then
    raise exception 'combined intake marker facade is not active';
  end if;

  -- Marker tables may still be present after assertions or may already have been
  -- removed by the combined-safe intake adapter rollback.
  if to_regclass('public.nav_deals_v2') is not null then
    if (select count(*) from public.nav_deals_v2) <> 1
       or (select count(*) from public.nav_deal_documents_v2) <> 1
       or (select count(*) from public.nav_deal_tasks_v2) <> 1
       or (select count(*) from public.nav_deal_risks_v2) <> 1 then
      raise exception 'intake marker facade rows were mutated';
    end if;
  end if;
end;
$guard$;

drop table if exists public.nav_deal_documents_v2;
drop table if exists public.nav_deal_risks_v2;
drop table if exists public.nav_deal_tasks_v2;
drop table if exists public.nav_deals_v2;

alter table public.nav_deals_v2_combined_real rename to nav_deals_v2;
alter table public.nav_deal_tasks_v2_combined_real rename to nav_deal_tasks_v2;
alter table public.nav_deal_risks_v2_combined_real rename to nav_deal_risks_v2;
alter table public.nav_deal_documents_v2_combined_real rename to nav_deal_documents_v2;

select 'Navigator v2 combined intake marker facade exited' as result;
