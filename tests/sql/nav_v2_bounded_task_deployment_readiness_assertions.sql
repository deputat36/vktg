-- Aggregated PostgreSQL 17 deployment-readiness assertions after the full
-- repository-only bounded task + lite DTO prototype stack has been applied.

create or replace function pg_temp.assert_service_only(p_signature text)
returns void
language plpgsql
as $$
declare
  v_oid oid := p_signature::regprocedure::oid;
begin
  if not has_function_privilege('service_role', p_signature, 'EXECUTE') then
    raise exception 'service_role is missing EXECUTE on %', p_signature;
  end if;
  if has_function_privilege('anon', p_signature, 'EXECUTE') then
    raise exception 'anon unexpectedly has EXECUTE on %', p_signature;
  end if;
  if has_function_privilege('authenticated', p_signature, 'EXECUTE') then
    raise exception 'authenticated unexpectedly has EXECUTE on %', p_signature;
  end if;
  if exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = v_oid
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC unexpectedly has EXECUTE on %', p_signature;
  end if;
end;
$$;

select pg_temp.assert_service_only('public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid)');
select pg_temp.assert_service_only('public.nav_v2_start_bounded_task(uuid,uuid)');
select pg_temp.assert_service_only('public.nav_v2_complete_bounded_task(uuid,uuid,uuid)');
select pg_temp.assert_service_only('public.nav_v2_set_bounded_task_active_outcome(uuid,text,text,date,uuid)');
select pg_temp.assert_service_only('public.nav_v2_propose_bounded_task_terminal_outcome(uuid,text,text,uuid,uuid)');
select pg_temp.assert_service_only('public.nav_v2_decide_bounded_task_terminal_outcome(uuid,text,uuid)');
select pg_temp.assert_service_only('public.nav_v2_add_task(uuid,text,text,public.nav_v2_user_role,public.nav_v2_task_priority,text)');
select pg_temp.assert_service_only('public.nav_v2_update_task_status(uuid,public.nav_v2_task_status)');

do $$
declare
  v_payload jsonb;
  v_baseline_legacy_count bigint;
  v_current_legacy_count bigint;
  v_baseline_trigger_count bigint;
  v_current_trigger_count bigint;
  v_constraint text;
  v_signature text;
begin
  if to_regclass('public.nav_deal_task_mutation_events_v2') is null then
    raise exception 'bounded task mutation event table is missing';
  end if;
  if not exists (
    select 1
    from pg_class c
    where c.oid = 'public.nav_deal_task_mutation_events_v2'::regclass
      and c.relrowsecurity is true
  ) then
    raise exception 'bounded task mutation event table must have RLS enabled';
  end if;
  if has_table_privilege('authenticated', 'public.nav_deal_task_mutation_events_v2', 'SELECT')
     or has_table_privilege('anon', 'public.nav_deal_task_mutation_events_v2', 'SELECT') then
    raise exception 'non-service roles unexpectedly read bounded mutation events';
  end if;
  if not has_table_privilege('service_role', 'public.nav_deal_task_mutation_events_v2', 'SELECT') then
    raise exception 'service_role cannot read bounded mutation events';
  end if;

  select legacy_task_count, task_trigger_count
  into v_baseline_legacy_count, v_baseline_trigger_count
  from nav_v2_deployment_test.baseline_counts;

  select count(*) into v_current_legacy_count
  from public.nav_deal_tasks_v2
  where task_contract_version is null;
  if v_current_legacy_count <> v_baseline_legacy_count then
    raise exception 'legacy task count changed or rows were backfilled: baseline %, current %',
      v_baseline_legacy_count, v_current_legacy_count;
  end if;

  if exists (
    select 1
    from nav_v2_deployment_test.legacy_task_snapshot s
    left join public.nav_deal_tasks_v2 t on t.id = s.id
    where t.id is null
       or t.task_contract_version is not null
       or row(
         t.deal_id,t.title,t.description,t.assigned_to,t.assigned_role,t.status,t.priority,
         t.due_date,t.source,t.completed_by,t.completed_at,t.created_by,t.created_at,
         t.updated_at,t.task_type,t.sla_days
       ) is distinct from row(
         s.deal_id,s.title,s.description,s.assigned_to,s.assigned_role,s.status,s.priority,
         s.due_date,s.source,s.completed_by,s.completed_at,s.created_by,s.created_at,
         s.updated_at,s.task_type,s.sla_days
       )
  ) then
    raise exception 'legacy task core fields changed during bounded deployment dry-run';
  end if;

  if exists (
    (select to_jsonb(d) from public.nav_deals_v2 d
     except select to_jsonb(s) from nav_v2_deployment_test.deal_snapshot s)
    union all
    (select to_jsonb(s) from nav_v2_deployment_test.deal_snapshot s
     except select to_jsonb(d) from public.nav_deals_v2 d)
  ) then
    raise exception 'deal rows changed during bounded deployment dry-run';
  end if;

  if exists (
    (select to_jsonb(d) from public.nav_deal_documents_v2 d
     except select to_jsonb(s) from nav_v2_deployment_test.document_snapshot s)
    union all
    (select to_jsonb(s) from nav_v2_deployment_test.document_snapshot s
     except select to_jsonb(d) from public.nav_deal_documents_v2 d)
  ) then
    raise exception 'document rows changed during bounded deployment dry-run';
  end if;

  if exists (
    (select to_jsonb(r) from public.nav_deal_risks_v2 r
     except select to_jsonb(s) from nav_v2_deployment_test.risk_snapshot s)
    union all
    (select to_jsonb(s) from nav_v2_deployment_test.risk_snapshot s
     except select to_jsonb(r) from public.nav_deal_risks_v2 r)
  ) then
    raise exception 'risk rows changed during bounded deployment dry-run';
  end if;

  select count(*) into v_current_trigger_count
  from pg_trigger t
  where t.tgrelid = 'public.nav_deal_tasks_v2'::regclass
    and not t.tgisinternal;
  if v_current_trigger_count <> v_baseline_trigger_count then
    raise exception 'automatic task trigger count changed: baseline %, current %',
      v_baseline_trigger_count, v_current_trigger_count;
  end if;

  foreach v_constraint in array array[
    'nav_deal_tasks_v2_bounded_task_type_check',
    'nav_deal_tasks_v2_contract_version_check',
    'nav_deal_tasks_v2_completion_code_check',
    'nav_deal_tasks_v2_evidence_kind_check',
    'nav_deal_tasks_v2_gate_scope_check',
    'nav_deal_tasks_v2_outcome_code_check',
    'nav_deal_tasks_v2_outcome_state_check',
    'nav_deal_tasks_v2_outcome_pair_check',
    'nav_deal_tasks_v2_replacement_check',
    'nav_deal_tasks_v2_active_outcome_review_check',
    'nav_deal_tasks_v2_done_evidence_check',
    'nav_deal_tasks_v2_contract_completeness_check',
    'nav_deal_tasks_v2_subject_kind_check',
    'nav_deal_tasks_v2_subject_required_check',
    'nav_deal_tasks_v2_terminal_status_check',
    'nav_deal_tasks_v2_completed_outcome_status_check'
  ] loop
    if not exists (
      select 1
      from pg_constraint c
      where c.conrelid = 'public.nav_deal_tasks_v2'::regclass
        and c.conname = v_constraint
        and c.convalidated is false
    ) then
      raise exception 'bounded constraint % must exist as NOT VALID', v_constraint;
    end if;
  end loop;

  foreach v_signature in array array[
    'public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid)',
    'public.nav_v2_start_bounded_task(uuid,uuid)',
    'public.nav_v2_complete_bounded_task(uuid,uuid,uuid)',
    'public.nav_v2_set_bounded_task_active_outcome(uuid,text,text,date,uuid)',
    'public.nav_v2_propose_bounded_task_terminal_outcome(uuid,text,text,uuid,uuid)',
    'public.nav_v2_decide_bounded_task_terminal_outcome(uuid,text,uuid)'
  ] loop
    if not exists (
      select 1
      from pg_proc p
      where p.oid = v_signature::regprocedure
        and p.prosecdef is true
        and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'
    ) then
      raise exception 'governed RPC % must be SECURITY DEFINER with fixed search_path', v_signature;
    end if;
  end loop;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
  v_payload := public.nav_v2_get_deal_card_lite('10000000-0000-4000-8000-000000000001');
  if (v_payload->>'dto_version')::integer <> 2
     or coalesce((v_payload->>'task_contract_aware')::boolean, false) is not true then
    raise exception 'contract-aware lite DTO v2 is not active';
  end if;
  if v_payload::text like '%description%'
     or v_payload::text like '%client_name%'
     or v_payload::text like '%phone%'
     or v_payload::text like '%Legacy task must remain untouched%' then
    raise exception 'deployment DTO exposed free-form or client data';
  end if;
  if not exists (
    select 1
    from jsonb_array_elements(v_payload->'tasks') item
    where (item->>'task_contract_version')::integer = 2
      and item ? 'evidence_kind'
      and item ? 'can_complete'
      and coalesce((item->>'legacy_status_path')::boolean, true) is false
  ) then
    raise exception 'bounded contract fields are missing from lite DTO v2';
  end if;
end;
$$;

select 'PostgreSQL bounded task deployment-readiness apply assertions passed' as result;
