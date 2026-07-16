-- Executable contract-aware lite DTO assertions.
create temporary table lite_ids(name text primary key,id uuid not null);

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
with response as (
  select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    '[{"task_type":"legal_decision","assigned_role":"lawyer","assigned_to":"00000000-0000-4000-8000-000000000007","evidence_kind":"review_decision","subject_kind":"deal","subject_reference_id":"10000000-0000-4000-8000-000000000001"}]'::jsonb,
    '70000000-0000-4000-8000-000000000001'
  ) as payload
)
insert into lite_ids(name,id)
select 'legal_task',(payload->'tasks'->0->>'id')::uuid from response;

-- Seller SPN: legacy task stays on old path; bounded lawyer task is visible but not actionable.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
create temporary table lite_result(payload jsonb);
insert into lite_result(payload)
select public.nav_v2_get_deal_card_lite('10000000-0000-4000-8000-000000000001');

do $$
declare
  v_payload jsonb := (select payload from lite_result limit 1);
  v_legacy jsonb;
  v_bounded jsonb;
  v_text text := (select payload::text from lite_result limit 1);
begin
  if (v_payload->>'dto_version')::int <> 2
     or coalesce((v_payload->>'task_contract_aware')::boolean,false) is not true then
    raise exception 'lite DTO version/contract flag mismatch';
  end if;
  if v_payload->'deal'->>'address' like '%кв%'
     or v_payload->'deal'->>'address' like '%99%' then
    raise exception 'lite DTO exposed unit-level address';
  end if;
  if v_text like '%Legacy task must remain untouched%'
     or v_text like '%description%'
     or v_text like '%client_name%'
     or v_text like '%phone%' then
    raise exception 'lite task DTO exposed free-form/client fields';
  end if;

  select item into v_legacy
  from jsonb_array_elements(v_payload->'tasks') item
  where item->>'id'='20000000-0000-4000-8000-000000000001';
  if v_legacy is null
     or coalesce((v_legacy->>'legacy_status_path')::boolean,false) is not true
     or coalesce((v_legacy->>'can_change_status')::boolean,false) is not true
     or coalesce((v_legacy->>'is_bounded')::boolean,true) is not false
     or coalesce((v_legacy->>'can_start')::boolean,true) is not false
     or coalesce((v_legacy->>'supports_reopen')::boolean,false) is not true then
    raise exception 'legacy task compatibility fields mismatch: %',v_legacy;
  end if;

  select item into v_bounded
  from jsonb_array_elements(v_payload->'tasks') item
  where item->>'id'=(select id::text from lite_ids where name='legal_task');
  if v_bounded is null
     or (v_bounded->>'task_contract_version')::int <> 2
     or v_bounded->>'task_type' <> 'legal_decision'
     or v_bounded->>'title' <> 'Юридическое решение'
     or v_bounded->>'evidence_kind' <> 'review_decision'
     or v_bounded->>'completion_criterion_code' <> 'legal_decision_recorded'
     or v_bounded->>'gate_scope' <> 'deposit'
     or coalesce((v_bounded->>'is_bounded')::boolean,false) is not true
     or coalesce((v_bounded->>'legacy_status_path')::boolean,true) is not false
     or coalesce((v_bounded->>'requires_evidence_reference')::boolean,false) is not true
     or coalesce((v_bounded->>'supports_reopen')::boolean,true) is not false
     or coalesce((v_bounded->>'can_change_status')::boolean,true) is not false
     or coalesce((v_bounded->>'can_start')::boolean,true) is not false
     or coalesce((v_bounded->>'can_complete')::boolean,true) is not false then
    raise exception 'seller view of bounded lawyer task mismatch: %',v_bounded;
  end if;
end;
$$;

-- Assigned lawyer gets governed operational actions, but not terminal decision permission.
truncate lite_result;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000007',false);
insert into lite_result(payload)
select public.nav_v2_get_deal_card_lite('10000000-0000-4000-8000-000000000001');

do $$
declare
  v_task jsonb;
begin
  select item into v_task
  from lite_result r,
       jsonb_array_elements(r.payload->'tasks') item
  where item->>'id'=(select id::text from lite_ids where name='legal_task');

  if coalesce((v_task->>'can_change_status')::boolean,true) is not false
     or coalesce((v_task->>'can_start')::boolean,false) is not true
     or coalesce((v_task->>'can_complete')::boolean,false) is not true
     or coalesce((v_task->>'can_set_active_outcome')::boolean,false) is not true
     or coalesce((v_task->>'can_propose_terminal_outcome')::boolean,false) is not true
     or coalesce((v_task->>'can_decide_terminal_outcome')::boolean,true) is not false then
    raise exception 'assigned lawyer governed permissions mismatch: %',v_task;
  end if;
end;
$$;

-- Proposed terminal outcome freezes operational buttons and enables manager decision.
select public.nav_v2_propose_bounded_task_terminal_outcome(
  (select id from lite_ids where name='legal_task'),
  'not_applicable',
  'no_longer_required',
  null,
  '70000000-0000-4000-8000-000000000002'
);

create temporary table task_snapshot as
select id,status,outcome_code,outcome_state,updated_at
from public.nav_deal_tasks_v2
where id=(select id from lite_ids where name='legal_task');

truncate lite_result;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
insert into lite_result(payload)
select public.nav_v2_get_deal_card_lite('10000000-0000-4000-8000-000000000001');

do $$
declare
  v_task jsonb;
  v_before task_snapshot%rowtype;
  v_after public.nav_deal_tasks_v2%rowtype;
begin
  select item into v_task
  from lite_result r,
       jsonb_array_elements(r.payload->'tasks') item
  where item->>'id'=(select id::text from lite_ids where name='legal_task');

  if v_task->>'outcome_code' <> 'not_applicable'
     or v_task->>'outcome_state' <> 'proposed'
     or coalesce((v_task->>'can_start')::boolean,true) is not false
     or coalesce((v_task->>'can_complete')::boolean,true) is not false
     or coalesce((v_task->>'can_set_active_outcome')::boolean,true) is not false
     or coalesce((v_task->>'can_propose_terminal_outcome')::boolean,true) is not false
     or coalesce((v_task->>'can_decide_terminal_outcome')::boolean,false) is not true then
    raise exception 'manager terminal-decision permissions mismatch: %',v_task;
  end if;

  select * into v_before from task_snapshot limit 1;
  select * into v_after from public.nav_deal_tasks_v2
  where id=(select id from lite_ids where name='legal_task');
  if v_after.status is distinct from v_before.status
     or v_after.outcome_code is distinct from v_before.outcome_code
     or v_after.outcome_state is distinct from v_before.outcome_state
     or v_after.updated_at is distinct from v_before.updated_at then
    raise exception 'lite DTO read mutated bounded task';
  end if;
end;
$$;

-- Operational roles outside the deal still cannot read the card.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',false);
do $$
begin
  perform public.nav_v2_get_deal_card_lite('10000000-0000-4000-8000-000000000001');
  raise exception 'Expected access error was not raised';
exception
  when others then
    if sqlerrm like 'Expected access error%' then raise; end if;
    if position('Нет доступа к сделке' in sqlerrm)=0 then
      raise exception 'Unexpected access error: %',sqlerrm;
    end if;
end;
$$;

select 'PostgreSQL contract-aware lite DTO assertions passed' as result;
