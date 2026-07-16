-- Active waiting remains active and start resumes it.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
select public.nav_v2_set_bounded_task_active_outcome(
  (select id from test_ids where name='document_request'),
  'waiting_external',
  'awaiting_document',
  current_date + 7,
  '40000000-0000-4000-8000-000000000019'
);

do $$
declare
  v_task public.nav_deal_tasks_v2%rowtype;
begin
  select * into v_task from public.nav_deal_tasks_v2
  where id = (select id from test_ids where name='document_request');
  if v_task.status <> 'in_progress'
     or v_task.outcome_code <> 'waiting_external'
     or v_task.outcome_state <> 'confirmed'
     or v_task.outcome_review_date <> current_date + 7
     or v_task.due_date <> current_date + 7 then
    raise exception 'waiting_external must remain active with review date';
  end if;
end;
$$;

select public.nav_v2_start_bounded_task(
  (select id from test_ids where name='document_request'),
  '40000000-0000-4000-8000-000000000020'
);

do $$
declare
  v_task public.nav_deal_tasks_v2%rowtype;
begin
  select * into v_task from public.nav_deal_tasks_v2
  where id = (select id from test_ids where name='document_request');
  if v_task.status <> 'in_progress'
     or v_task.outcome_code is not null
     or v_task.outcome_review_date is not null
     or v_task.due_date <> current_date + 2 then
    raise exception 'resume must clear active outcome and restore SLA date';
  end if;
end;
$$;

select pg_temp.expect_error(
  format(
    'select public.nav_v2_set_bounded_task_active_outcome(%L::uuid, %L, %L, null::date, %L::uuid)',
    (select id from test_ids where name='document_request'),
    'deferred',
    'postponed_by_client',
    '40000000-0000-4000-8000-000000000021'
  ),
  'review_date должен быть в пределах 1–90 дней'
);

-- Deferred is active and requires a review date.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', false);
select public.nav_v2_set_bounded_task_active_outcome(
  (select id from test_ids where name='post_deal_action'),
  'deferred',
  'postponed_by_client',
  current_date + 14,
  '40000000-0000-4000-8000-000000000033'
);

do $$
declare
  v_task public.nav_deal_tasks_v2%rowtype;
begin
  select * into v_task from public.nav_deal_tasks_v2
  where id = (select id from test_ids where name='post_deal_action');
  if v_task.status <> 'in_progress'
     or v_task.outcome_code <> 'deferred'
     or v_task.outcome_review_date <> current_date + 14 then
    raise exception 'deferred task must remain active with review date';
  end if;
end;
$$;

-- Terminal exception requires manager/owner/admin decision.
select public.nav_v2_propose_bounded_task_terminal_outcome(
  (select id from test_ids where name='appointment'),
  'not_applicable',
  'no_longer_required',
  null,
  '40000000-0000-4000-8000-000000000022'
);

select pg_temp.expect_error(
  format(
    'select public.nav_v2_decide_bounded_task_terminal_outcome(%L::uuid, %L, %L::uuid)',
    (select id from test_ids where name='appointment'),
    'confirm',
    '40000000-0000-4000-8000-000000000023'
  ),
  'Только менеджер, owner или admin подтверждает terminal outcome'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
select public.nav_v2_decide_bounded_task_terminal_outcome(
  (select id from test_ids where name='appointment'),
  'confirm',
  '40000000-0000-4000-8000-000000000024'
);

do $$
declare
  v_task public.nav_deal_tasks_v2%rowtype;
begin
  select * into v_task from public.nav_deal_tasks_v2
  where id = (select id from test_ids where name='appointment');
  if v_task.status <> 'cancelled'
     or v_task.outcome_code <> 'not_applicable'
     or v_task.outcome_state <> 'confirmed'
     or v_task.completed_by <> '00000000-0000-4000-8000-000000000003' then
    raise exception 'manager confirmation did not terminate task correctly';
  end if;
end;
$$;

-- Replacement must point to another active bounded task in the same deal.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
select public.nav_v2_propose_bounded_task_terminal_outcome(
  (select id from test_ids where name='term_approval'),
  'replaced',
  'replaced_by_specific_task',
  (select id from test_ids where name='card_correction'),
  '40000000-0000-4000-8000-000000000025'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false);
select public.nav_v2_decide_bounded_task_terminal_outcome(
  (select id from test_ids where name='term_approval'),
  'confirm',
  '40000000-0000-4000-8000-000000000026'
);

-- Create a bounded task in another deal for cross-deal replacement denial.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
with response as (
  select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000002',
    '[{"task_type":"card_correction","assigned_role":"spn","assigned_to":"00000000-0000-4000-8000-000000000006","evidence_kind":"card_validation","subject_kind":"deal","subject_reference_id":"10000000-0000-4000-8000-000000000002"}]'::jsonb,
    '40000000-0000-4000-8000-000000000027'
  ) as payload
)
insert into test_ids(name, id)
select 'other_deal_task', (payload -> 'tasks' -> 0 ->> 'id')::uuid from response;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', false);
select pg_temp.expect_error(
  format(
    'select public.nav_v2_propose_bounded_task_terminal_outcome(%L::uuid, %L, %L, %L::uuid, %L::uuid)',
    (select id from test_ids where name='card_correction'),
    'replaced',
    'replaced_by_specific_task',
    (select id from test_ids where name='other_deal_task'),
    '40000000-0000-4000-8000-000000000028'
  ),
  'Replacement task должна быть другой активной bounded-задачей той же сделки'
);

-- Legacy status RPC remains usable for legacy rows, but never for bounded rows.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.nav_v2_update_task_status(
  '20000000-0000-4000-8000-000000000001',
  'in_progress'
);

select pg_temp.expect_error(
  format(
    'select public.nav_v2_update_task_status(%L::uuid, %L::public.nav_v2_task_status)',
    (select id from test_ids where name='card_correction'),
    'cancelled'
  ),
  'Для bounded-задачи используйте governed lifecycle RPC'
);

do $$
declare
  v_legacy public.nav_deal_tasks_v2%rowtype;
  v_bounded integer;
  v_events integer;
begin
  select * into v_legacy
  from public.nav_deal_tasks_v2
  where id = '20000000-0000-4000-8000-000000000001';

  if v_legacy.task_contract_version is not null
     or v_legacy.task_type <> 'operational_task'
     or v_legacy.status <> 'in_progress' then
    raise exception 'legacy task lifecycle/backfill boundary mismatch';
  end if;

  select count(*) into v_bounded
  from public.nav_deal_tasks_v2
  where task_contract_version = 2;
  if v_bounded <> 8 then
    raise exception 'expected exactly 8 explicitly created bounded tasks, got %', v_bounded;
  end if;

  select count(*) into v_events
  from public.nav_deal_task_mutation_events_v2;
  if v_events < 12 then
    raise exception 'task mutation audit trail is incomplete: % events', v_events;
  end if;

  if (select count(*) from public.nav_deal_documents_v2) <> 0 then
    raise exception 'bounded task mutation created a document';
  end if;
  if (select count(*) from public.nav_deal_risks_v2) <> 0 then
    raise exception 'bounded task mutation created a risk';
  end if;
  if (select count(*) from public.nav_deals_v2) <> 2 then
    raise exception 'bounded task mutation changed deal rows';
  end if;
end;
$$;

select 'PostgreSQL bounded task mutation assertions passed' as result;
