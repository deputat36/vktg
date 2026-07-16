-- Executable read-only legacy task review assertions.
create or replace function pg_temp.expect_error(p_sql text, p_message_fragment text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'Expected error was not raised: %', p_sql;
exception
  when others then
    if sqlerrm like 'Expected error was not raised:%' then raise; end if;
    if position(p_message_fragment in sqlerrm) = 0 then
      raise exception 'Unexpected error. Expected fragment %, got %', p_message_fragment, sqlerrm;
    end if;
end;
$$;

insert into public.nav_deal_tasks_v2(
  id, deal_id, title, assigned_to, assigned_role, status, priority,
  due_date, source, created_by, created_at, task_type, sla_days
) values
  ('21000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Private quality title','00000000-0000-4000-8000-000000000004','spn','open','high',current_date-5,'auto_quality_seller_name','00000000-0000-4000-8000-000000000001',now()-interval '30 days',null,null),
  ('21000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Private lawyer title','00000000-0000-4000-8000-000000000007','lawyer','open','urgent',current_date-2,'auto_lawyer','00000000-0000-4000-8000-000000000001',now()-interval '20 days',null,null),
  ('21000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Private broker title','00000000-0000-4000-8000-000000000008','broker','open','normal',current_date+2,'auto_broker','00000000-0000-4000-8000-000000000001',now()-interval '10 days',null,null),
  ('21000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Cancelled broker title','00000000-0000-4000-8000-000000000008','broker','cancelled','normal',current_date-4,'auto_broker','00000000-0000-4000-8000-000000000001',now()-interval '15 days',null,null),
  ('21000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','Matcap must not route broker','00000000-0000-4000-8000-000000000008','broker','open','normal',current_date-1,'auto_matcap','00000000-0000-4000-8000-000000000001',now()-interval '12 days',null,null),
  ('21000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','Certificate must not route broker','00000000-0000-4000-8000-000000000008','broker','open','normal',null,'auto_certificate','00000000-0000-4000-8000-000000000001',now()-interval '11 days',null,null),
  ('21000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','Unknown task title','00000000-0000-4000-8000-000000000003','manager','open','normal',current_date-10,'manual_unknown','00000000-0000-4000-8000-000000000001',now()-interval '50 days',null,null),
  ('21000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000002','Other deal expenses','00000000-0000-4000-8000-000000000006','spn','open','normal',current_date-3,'auto_expenses','00000000-0000-4000-8000-000000000001',now()-interval '9 days',null,null),
  ('21000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001','Demo task title','00000000-0000-4000-8000-000000000004','spn','open','normal',current_date-9,'demo','00000000-0000-4000-8000-000000000001',now()-interval '60 days',null,null);

do $$
begin
  if has_function_privilege('authenticated','public.nav_v2_get_legacy_task_review_pack(integer)','EXECUTE') then
    raise exception 'authenticated unexpectedly has legacy review EXECUTE';
  end if;
  if not has_function_privilege('service_role','public.nav_v2_get_legacy_task_review_pack(integer)','EXECUTE') then
    raise exception 'service_role is missing legacy review EXECUTE';
  end if;
end;
$$;

create temporary table review_snapshot as
select count(*)::int as task_count,
       count(*) filter (where status='open')::int as open_count,
       count(*) filter (where status='cancelled')::int as cancelled_count
from public.nav_deal_tasks_v2;

create temporary table review_result(payload jsonb);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
insert into review_result(payload)
select public.nav_v2_get_legacy_task_review_pack(100);

do $$
declare
  v_payload jsonb := (select payload from review_result limit 1);
  v_summary jsonb;
  v_text text;
begin
  v_summary := v_payload -> 'summary';
  v_text := v_payload::text;

  if (v_summary ->> 'reviewed_rows')::int <> 9
     or (v_summary ->> 'active_rows')::int <> 8
     or (v_summary ->> 'done_or_cancelled')::int <> 1
     or (v_summary ->> 'candidate_for_recreate')::int <> 4
     or (v_summary ->> 'manual_review')::int <> 4
     or (v_summary ->> 'leave_legacy')::int <> 1
     or (v_summary ->> 'overdue_active')::int <> 5 then
    raise exception 'owner legacy review summary mismatch: %', v_summary;
  end if;

  if coalesce((v_payload ->> 'preview_only')::boolean,false) is not true
     or coalesce((v_payload ->> 'production_rows_changed')::boolean,true) is not false
     or coalesce((v_payload ->> 'backfill_performed')::boolean,true) is not false
     or coalesce((v_payload ->> 'new_tasks_created')::boolean,true) is not false
     or coalesce((v_payload ->> 'tasks_completed_or_cancelled')::boolean,true) is not false
     or coalesce((v_payload ->> 'employee_evaluation_allowed')::boolean,true) is not false then
    raise exception 'review pack safety flags mismatch';
  end if;

  if v_text like '%"title"%'
     or v_text like '%"description"%'
     or v_text like '%"phone"%'
     or v_text like '%"email"%'
     or v_text like '%document_url%'
     or v_text like '%Private quality title%'
     or v_text like '%Matcap must not route broker%' then
    raise exception 'review DTO exposes forbidden free-form/client fields';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_payload -> 'items') item
    where item ->> 'source' = 'demo'
  ) then
    raise exception 'demo task leaked into legacy review pack';
  end if;

  if exists (
    select 1 from jsonb_array_elements(v_payload -> 'items') item
    where item ->> 'recommended_decision' = 'retire_after_evidence'
  ) then
    raise exception 'retire_after_evidence must never be automatic';
  end if;
end;
$$;

do $$
declare
  v_payload jsonb := (select payload from review_result limit 1);
  v_item jsonb;
begin
  select item into v_item
  from jsonb_array_elements(v_payload -> 'items') item
  where item ->> 'source' = 'auto_matcap'
  limit 1;
  if v_item ->> 'suggested_task_type' is not null
     or v_item ->> 'recommended_decision' <> 'manual_review' then
    raise exception 'matcap source was incorrectly routed to broker task';
  end if;

  select item into v_item
  from jsonb_array_elements(v_payload -> 'items') item
  where item ->> 'source' = 'auto_certificate'
  limit 1;
  if v_item ->> 'suggested_task_type' is not null
     or v_item ->> 'recommended_decision' <> 'manual_review' then
    raise exception 'certificate source was incorrectly routed to broker task';
  end if;

  select item into v_item
  from jsonb_array_elements(v_payload -> 'items') item
  where item ->> 'source' = 'auto_broker' and item ->> 'status' = 'open'
  limit 1;
  if v_item ->> 'suggested_task_type' <> 'financial_decision'
     or v_item ->> 'recommended_decision' <> 'candidate_for_recreate' then
    raise exception 'active mortgage broker source mapping mismatch';
  end if;

  select item into v_item
  from jsonb_array_elements(v_payload -> 'items') item
  where item ->> 'source' = 'auto_broker' and item ->> 'status' = 'cancelled'
  limit 1;
  if v_item ->> 'recommended_decision' <> 'leave_legacy' then
    raise exception 'cancelled broker task must remain legacy';
  end if;
end;
$$;

-- Manager sees only the team deal, not the unrelated second deal.
truncate review_result;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
insert into review_result(payload)
select public.nav_v2_get_legacy_task_review_pack(100);

do $$
declare
  v_payload jsonb := (select payload from review_result limit 1);
  v_summary jsonb := (select payload -> 'summary' from review_result limit 1);
begin
  if (v_summary ->> 'reviewed_rows')::int <> 8
     or (v_summary ->> 'candidate_for_recreate')::int <> 3
     or (v_summary ->> 'manual_review')::int <> 4
     or (v_summary ->> 'leave_legacy')::int <> 1 then
    raise exception 'manager-scoped review summary mismatch: %', v_summary;
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_payload -> 'items') item
    where item ->> 'deal_id' = '10000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'manager review leaked an unrelated deal';
  end if;
end;
$$;

-- Admin is allowed and receives the same global scope as owner.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$
declare
  v_payload jsonb := public.nav_v2_get_legacy_task_review_pack(3);
begin
  if jsonb_array_length(v_payload -> 'items') <> 3
     or (v_payload -> 'summary' ->> 'reviewed_rows')::int <> 3 then
    raise exception 'admin limit handling mismatch';
  end if;
end;
$$;

-- Operational roles must not receive a mass review list.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
select pg_temp.expect_error('select public.nav_v2_get_legacy_task_review_pack(100)','Legacy task review доступен владельцу');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000007',false);
select pg_temp.expect_error('select public.nav_v2_get_legacy_task_review_pack(100)','Legacy task review доступен владельцу');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000008',false);
select pg_temp.expect_error('select public.nav_v2_get_legacy_task_review_pack(100)','Legacy task review доступен владельцу');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000009',false);
select pg_temp.expect_error('select public.nav_v2_get_legacy_task_review_pack(100)','Legacy task review доступен владельцу');

-- Prove the review RPC did not mutate any task row.
do $$
declare
  v_before review_snapshot%rowtype;
  v_after record;
begin
  select * into v_before from review_snapshot limit 1;
  select count(*)::int as task_count,
         count(*) filter (where status='open')::int as open_count,
         count(*) filter (where status='cancelled')::int as cancelled_count
    into v_after
  from public.nav_deal_tasks_v2;

  if v_after.task_count <> v_before.task_count
     or v_after.open_count <> v_before.open_count
     or v_after.cancelled_count <> v_before.cancelled_count then
    raise exception 'legacy review pack mutated task rows';
  end if;
  if exists (select 1 from public.nav_deal_tasks_v2 where task_contract_version = 2) then
    raise exception 'legacy review pack created or backfilled bounded tasks';
  end if;
  if (select count(*) from public.nav_deal_documents_v2) <> 0
     or (select count(*) from public.nav_deal_risks_v2) <> 0 then
    raise exception 'legacy review pack crossed document/risk boundary';
  end if;
end;
$$;

select 'PostgreSQL legacy task review assertions passed' as result;
