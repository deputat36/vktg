\set ON_ERROR_STOP on

create temporary table combined_task_ids(
  name text primary key,
  id uuid not null
);

create temporary table combined_quality_count_before as
select count(*)::integer as count_value
from public.nav_deal_tasks_v2
where source like 'auto_quality_%';

select set_config('request.jwt.claim.sub', '', false);

with response as (
  select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'task_type', 'document_request',
        'assigned_role', 'spn',
        'assigned_to', '00000000-0000-4000-8000-000000000004',
        'evidence_kind', 'document_status',
        'priority', 'high',
        'subject_kind', 'document',
        'subject_reference_id', '31000000-0000-4000-8000-000000000101'
      ),
      jsonb_build_object(
        'task_type', 'legal_decision',
        'assigned_role', 'lawyer',
        'assigned_to', '00000000-0000-4000-8000-000000000007',
        'evidence_kind', 'review_decision',
        'priority', 'high',
        'subject_kind', 'review',
        'subject_reference_id', '31000000-0000-4000-8000-000000000102'
      )
    ),
    '41000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000004'
  ) as payload
)
insert into combined_task_ids(name, id)
select 'document_request', (payload->'tasks'->0->>'id')::uuid from response
union all
select 'legal_decision', (payload->'tasks'->1->>'id')::uuid from response;

select public.nav_v2_start_bounded_task(
  (select id from combined_task_ids where name='document_request'),
  '41000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000004'
);

select public.nav_v2_complete_bounded_task(
  (select id from combined_task_ids where name='document_request'),
  '31000000-0000-4000-8000-000000000103',
  '41000000-0000-4000-8000-000000000103',
  '00000000-0000-4000-8000-000000000004'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000007', false);
create temporary table combined_lite_result(payload jsonb);
insert into combined_lite_result(payload)
select public.nav_v2_get_deal_card_lite('10000000-0000-4000-8000-000000000001');

do $assertions$
declare
  v_payload jsonb := (select payload from combined_lite_result limit 1);
  v_legal jsonb;
begin
  if (v_payload->>'dto_version')::integer <> 2
     or coalesce((v_payload->>'task_contract_aware')::boolean, false) is not true then
    raise exception 'combined lite DTO is not bounded-aware: %', v_payload;
  end if;

  select item into v_legal
  from jsonb_array_elements(v_payload->'tasks') item
  where item->>'id' = (select id::text from combined_task_ids where name='legal_decision');

  if v_legal is null
     or (v_legal->>'task_contract_version')::integer <> 2
     or v_legal->>'task_type' <> 'legal_decision'
     or coalesce((v_legal->>'can_start')::boolean, false) is not true
     or coalesce((v_legal->>'can_complete')::boolean, false) is not true
     or coalesce((v_legal->>'can_propose_terminal_outcome')::boolean, false) is not true then
    raise exception 'combined lawyer bounded permissions mismatch: %', v_legal;
  end if;

  if not exists (
    select 1
    from public.nav_deal_tasks_v2
    where id = (select id from combined_task_ids where name='document_request')
      and status = 'done'
      and completed_by = '00000000-0000-4000-8000-000000000004'
      and evidence_reference_id = '31000000-0000-4000-8000-000000000103'
      and outcome_code = 'completed'
      and outcome_state = 'confirmed'
  ) then
    raise exception 'combined bounded completion state mismatch';
  end if;

  if exists (
    select 1
    from public.nav_deal_tasks_v2
    where id = '20000000-0000-4000-8000-000000000001'
      and task_contract_version is not null
  ) then
    raise exception 'combined legacy task was converted to bounded contract';
  end if;

  if (select count(*) from public.nav_deal_documents_v2) <> 0 then
    raise exception 'combined bounded lifecycle created a document';
  end if;
  if (select count(*) from public.nav_deal_risks_v2) <> 0 then
    raise exception 'combined bounded lifecycle created a risk';
  end if;

  if (select count(*) from public.nav_deal_tasks_v2 where source like 'auto_quality_%')
     <> (select count_value from combined_quality_count_before) then
    raise exception 'bounded lifecycle changed privacy-aligned quality tasks';
  end if;

  if not exists (
    select 1
    from public.nav_deal_task_mutation_events_v2
    where client_request_id = '41000000-0000-4000-8000-000000000103'
      and actor_id = '00000000-0000-4000-8000-000000000004'
  ) then
    raise exception 'combined actor-aware audit evidence is missing';
  end if;
end;
$assertions$;

select set_config('request.jwt.claim.sub', '', false);
select 'Navigator v2 combined bounded coexistence assertions passed' as result;
