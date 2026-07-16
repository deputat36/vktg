select pg_temp.expect_error(
  $q$select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    '[{"task_type":"document_request","assigned_role":"spn","assigned_to":"00000000-0000-4000-8000-000000000006","evidence_kind":"document_status","subject_kind":"document","subject_reference_id":"30000000-0000-4000-8000-000000000003"}]'::jsonb,
    '40000000-0000-4000-8000-000000000005'
  )$q$,
  'Назначенный сотрудник не соответствует роли в этой сделке'
);

select pg_temp.expect_error(
  $q$select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    '[{"task_type":"financial_decision","assigned_role":"lawyer","assigned_to":"00000000-0000-4000-8000-000000000007","evidence_kind":"review_decision","subject_kind":"deal","subject_reference_id":"10000000-0000-4000-8000-000000000001"}]'::jsonb,
    '40000000-0000-4000-8000-000000000006'
  )$q$,
  'не может владеть задачей'
);

select pg_temp.expect_error(
  $q$select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    '[{"task_type":"document_request","assigned_role":"spn","assigned_to":"00000000-0000-4000-8000-000000000004","sla_days":6,"evidence_kind":"document_status","subject_kind":"document","subject_reference_id":"30000000-0000-4000-8000-000000000004"}]'::jsonb,
    '40000000-0000-4000-8000-000000000007'
  )$q$,
  'SLA для document_request должен быть от 1 до 5 дней'
);

select pg_temp.expect_error(
  $q$select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    '[{"task_type":"document_request","assigned_role":"spn","assigned_to":"00000000-0000-4000-8000-000000000004","evidence_kind":"document_status","subject_kind":"document","subject_reference_id":"30000000-0000-4000-8000-000000000001"}]'::jsonb,
    '40000000-0000-4000-8000-000000000008'
  )$q$,
  'Активная задача такого типа, предмета и владельца уже существует'
);

-- Creator role denial matrix.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000007', false);
select pg_temp.expect_error(
  $q$select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    '[{"task_type":"legal_decision","assigned_role":"lawyer","assigned_to":"00000000-0000-4000-8000-000000000007","evidence_kind":"review_decision","subject_kind":"review","subject_reference_id":"30000000-0000-4000-8000-000000000020"}]'::jsonb,
    '40000000-0000-4000-8000-000000000009'
  )$q$,
  'Нет прав создавать bounded-задачи'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000008', false);
select pg_temp.expect_error(
  $q$select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    '[{"task_type":"financial_decision","assigned_role":"broker","assigned_to":"00000000-0000-4000-8000-000000000008","evidence_kind":"review_decision","subject_kind":"review","subject_reference_id":"30000000-0000-4000-8000-000000000021"}]'::jsonb,
    '40000000-0000-4000-8000-000000000010'
  )$q$,
  'Нет прав создавать bounded-задачи'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000009', false);
select pg_temp.expect_error(
  $q$select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    '[{"task_type":"card_correction","assigned_role":"spn","assigned_to":"00000000-0000-4000-8000-000000000004","evidence_kind":"card_validation","subject_kind":"deal","subject_reference_id":"10000000-0000-4000-8000-000000000001"}]'::jsonb,
    '40000000-0000-4000-8000-000000000011'
  )$q$,
  'Нет прав создавать bounded-задачи'
);

-- Owner creates additional explicit tasks.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
with response as (
  select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'task_type','financial_decision',
        'assigned_role','broker',
        'assigned_to','00000000-0000-4000-8000-000000000008',
        'evidence_kind','review_decision',
        'subject_kind','deal',
        'subject_reference_id','10000000-0000-4000-8000-000000000001'
      ),
      jsonb_build_object(
        'task_type','appointment_scheduling',
        'assigned_role','spn',
        'assigned_to','00000000-0000-4000-8000-000000000004',
        'evidence_kind','calendar_event',
        'subject_kind','calendar',
        'subject_reference_id','30000000-0000-4000-8000-000000000030'
      ),
      jsonb_build_object(
        'task_type','term_approval',
        'assigned_role','spn',
        'assigned_to','00000000-0000-4000-8000-000000000004',
        'evidence_kind','agreement_status',
        'subject_kind','external_confirmation',
        'subject_reference_id','30000000-0000-4000-8000-000000000031'
      ),
      jsonb_build_object(
        'task_type','card_correction',
        'assigned_role','spn',
        'assigned_to','00000000-0000-4000-8000-000000000005',
        'evidence_kind','card_validation',
        'subject_kind','deal',
        'subject_reference_id','10000000-0000-4000-8000-000000000001'
      )
    ),
    '40000000-0000-4000-8000-000000000012'
  ) as payload
)
insert into test_ids(name, id)
select 'financial_decision', (payload -> 'tasks' -> 0 ->> 'id')::uuid from response
union all
select 'appointment', (payload -> 'tasks' -> 1 ->> 'id')::uuid from response
union all
select 'term_approval', (payload -> 'tasks' -> 2 ->> 'id')::uuid from response
union all
select 'card_correction', (payload -> 'tasks' -> 3 ->> 'id')::uuid from response;

-- Manager may create an explicit bounded task for a represented team member.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
with response as (
  select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    '[{"task_type":"post_deal_action","assigned_role":"spn","assigned_to":"00000000-0000-4000-8000-000000000005","evidence_kind":"external_confirmation","subject_kind":"external_confirmation","subject_reference_id":"30000000-0000-4000-8000-000000000032"}]'::jsonb,
    '40000000-0000-4000-8000-000000000029'
  ) as payload
)
insert into test_ids(name, id)
select 'post_deal_action', (payload -> 'tasks' -> 0 ->> 'id')::uuid from response;

-- Lawyer and broker can operate only their assigned tasks.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000007', false);
select public.nav_v2_start_bounded_task(
  (select id from test_ids where name='legal_decision'),
  '40000000-0000-4000-8000-000000000013'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000008', false);
select public.nav_v2_start_bounded_task(
  (select id from test_ids where name='financial_decision'),
  '40000000-0000-4000-8000-000000000014'
);

-- Broker proposes a terminal exception; admin rejects it and the task remains active.
select public.nav_v2_propose_bounded_task_terminal_outcome(
  (select id from test_ids where name='financial_decision'),
  'cancelled',
  'route_changed',
  null,
  '40000000-0000-4000-8000-000000000030'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false);
select public.nav_v2_decide_bounded_task_terminal_outcome(
  (select id from test_ids where name='financial_decision'),
  'reject',
  '40000000-0000-4000-8000-000000000031'
);

do $$
declare
  v_task public.nav_deal_tasks_v2%rowtype;
begin
  select * into v_task from public.nav_deal_tasks_v2
  where id = (select id from test_ids where name='financial_decision');
  if v_task.status <> 'in_progress' or v_task.outcome_state <> 'rejected' then
    raise exception 'admin rejection must keep financial task active';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000008', false);
select public.nav_v2_start_bounded_task(
  (select id from test_ids where name='financial_decision'),
  '40000000-0000-4000-8000-000000000032'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', false);
select pg_temp.expect_error(
  format(
    'select public.nav_v2_start_bounded_task(%L::uuid, %L::uuid)',
    (select id from test_ids where name='document_request'),
    '40000000-0000-4000-8000-000000000015'
  ),
  'Нет прав начать эту задачу'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000009', false);
select pg_temp.expect_error(
  format(
    'select public.nav_v2_start_bounded_task(%L::uuid, %L::uuid)',
    (select id from test_ids where name='document_request'),
    '40000000-0000-4000-8000-000000000016'
  ),
  'Нет прав начать эту задачу'
);

-- Completion needs explicit reference evidence.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000007', false);
select pg_temp.expect_error(
  format(
    'select public.nav_v2_complete_bounded_task(%L::uuid, null::uuid, %L::uuid)',
    (select id from test_ids where name='legal_decision'),
    '40000000-0000-4000-8000-000000000017'
  ),
  'Для завершения требуется evidence_reference_id'
);

select public.nav_v2_complete_bounded_task(
  (select id from test_ids where name='legal_decision'),
  '50000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000018'
);

do $$
declare
  v_task public.nav_deal_tasks_v2%rowtype;
begin
  select * into v_task from public.nav_deal_tasks_v2
  where id = (select id from test_ids where name='legal_decision');
  if v_task.status <> 'done'
     or v_task.outcome_code <> 'completed'
     or v_task.outcome_state <> 'confirmed'
     or v_task.evidence_reference_id is null
     or v_task.completed_by <> '00000000-0000-4000-8000-000000000007' then
    raise exception 'completion evidence/outcome contract mismatch';
  end if;
end;
$$;
