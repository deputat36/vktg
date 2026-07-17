-- Synthetic baseline snapshot before applying repository-only bounded-task prototypes.
-- This schema exists only inside the ephemeral PostgreSQL 17 deployment-readiness job.

create schema nav_v2_deployment_test;

create table nav_v2_deployment_test.legacy_task_snapshot as
select
  id,
  deal_id,
  title,
  description,
  assigned_to,
  assigned_role,
  status,
  priority,
  due_date,
  source,
  completed_by,
  completed_at,
  created_by,
  created_at,
  updated_at,
  task_type,
  sla_days
from public.nav_deal_tasks_v2;

create table nav_v2_deployment_test.deal_snapshot as
select * from public.nav_deals_v2;

create table nav_v2_deployment_test.document_snapshot as
select * from public.nav_deal_documents_v2;

create table nav_v2_deployment_test.risk_snapshot as
select * from public.nav_deal_risks_v2;

create table nav_v2_deployment_test.baseline_counts (
  legacy_task_count bigint not null,
  task_trigger_count bigint not null
);

insert into nav_v2_deployment_test.baseline_counts(legacy_task_count, task_trigger_count)
select
  (select count(*) from public.nav_deal_tasks_v2),
  (
    select count(*)
    from pg_trigger t
    where t.tgrelid = 'public.nav_deal_tasks_v2'::regclass
      and not t.tgisinternal
  );

select 'PostgreSQL bounded task deployment baseline snapshot created' as result;
