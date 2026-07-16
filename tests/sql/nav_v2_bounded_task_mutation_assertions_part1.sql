-- Executable bounded task mutation assertions.
create temporary table test_ids (
  name text primary key,
  id uuid not null
);

create or replace function pg_temp.expect_error(p_sql text, p_message_fragment text)
returns void
language plpgsql
as $$
begin
  execute p_sql;
  raise exception 'Expected error was not raised: %', p_sql;
exception
  when others then
    if sqlerrm like 'Expected error was not raised:%' then
      raise;
    end if;
    if position(p_message_fragment in sqlerrm) = 0 then
      raise exception 'Unexpected error. Expected fragment %, got %', p_message_fragment, sqlerrm;
    end if;
end;
$$;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid)',
    'EXECUTE'
  ) then
    raise exception 'authenticated unexpectedly has create bounded task EXECUTE';
  end if;
  if not has_function_privilege(
    'service_role',
    'public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid)',
    'EXECUTE'
  ) then
    raise exception 'service_role is missing create bounded task EXECUTE';
  end if;
  if has_table_privilege('authenticated', 'public.nav_deal_task_mutation_events_v2', 'SELECT') then
    raise exception 'authenticated unexpectedly reads task mutation events';
  end if;
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'nav_deal_task_mutation_events_v2'
      and c.relrowsecurity is true
  ) then
    raise exception 'task mutation event table must have RLS enabled';
  end if;
end;
$$;

do $$
declare
  v_task public.nav_deal_tasks_v2%rowtype;
begin
  select * into v_task
  from public.nav_deal_tasks_v2
  where id = '20000000-0000-4000-8000-000000000001';

  if v_task.task_type <> 'operational_task'
     or v_task.task_contract_version is not null
     or v_task.completion_criterion_code is not null
     or v_task.subject_kind is not null then
    raise exception 'legacy task was backfilled or changed';
  end if;

  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.nav_deal_tasks_v2'::regclass
      and conname = 'nav_deal_tasks_v2_task_type_check'
  ) then
    raise exception 'legacy task type constraint still blocks bounded catalog';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);

select pg_temp.expect_error(
  $q$select public.nav_v2_add_task(
    '10000000-0000-4000-8000-000000000001',
    'Unsafe generic task',
    null,
    'spn',
    'normal',
    'manual'
  )$q$,
  'Generic task creation disabled'
);

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
        'subject_reference_id', '30000000-0000-4000-8000-000000000001'
      ),
      jsonb_build_object(
        'task_type', 'legal_decision',
        'assigned_role', 'lawyer',
        'assigned_to', '00000000-0000-4000-8000-000000000007',
        'evidence_kind', 'review_decision',
        'subject_kind', 'deal',
        'subject_reference_id', '10000000-0000-4000-8000-000000000001'
      )
    ),
    '40000000-0000-4000-8000-000000000001'
  ) as payload
)
insert into test_ids(name, id)
select 'document_request', (payload -> 'tasks' -> 0 ->> 'id')::uuid from response
union all
select 'legal_decision', (payload -> 'tasks' -> 1 ->> 'id')::uuid from response;

do $$
declare
  v_doc public.nav_deal_tasks_v2%rowtype;
  v_legal public.nav_deal_tasks_v2%rowtype;
begin
  select * into v_doc from public.nav_deal_tasks_v2 where id = (select id from test_ids where name='document_request');
  select * into v_legal from public.nav_deal_tasks_v2 where id = (select id from test_ids where name='legal_decision');

  if v_doc.sla_days <> 2 or v_doc.due_date <> current_date + 2 then
    raise exception 'document_request default SLA mismatch';
  end if;
  if v_legal.sla_days <> 1 or v_legal.due_date <> current_date + 1 then
    raise exception 'legal_decision default SLA mismatch';
  end if;
  if v_doc.title <> 'Запрос документа' or v_doc.description is not null then
    raise exception 'bounded task title/description must be catalog-generated';
  end if;
  if v_legal.assigned_role <> 'lawyer' or v_legal.assigned_to <> '00000000-0000-4000-8000-000000000007' then
    raise exception 'legal task assignment mismatch';
  end if;
end;
$$;

-- Same request must replay without adding rows.
do $$
declare
  v_before integer;
  v_after integer;
  v_payload jsonb;
begin
  select count(*) into v_before from public.nav_deal_tasks_v2 where task_contract_version = 2;
  v_payload := public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'task_type', 'document_request',
        'assigned_role', 'spn',
        'assigned_to', '00000000-0000-4000-8000-000000000004',
        'evidence_kind', 'document_status',
        'priority', 'high',
        'subject_kind', 'document',
        'subject_reference_id', '30000000-0000-4000-8000-000000000001'
      )
    ),
    '40000000-0000-4000-8000-000000000001'
  );
  select count(*) into v_after from public.nav_deal_tasks_v2 where task_contract_version = 2;
  if v_before <> v_after or coalesce((v_payload ->> 'idempotent_replay')::boolean, false) is not true then
    raise exception 'repeat create must replay without duplicate rows';
  end if;
end;
$$;

select pg_temp.expect_error(
  format(
    'select public.nav_v2_start_bounded_task(%L::uuid, %L::uuid)',
    (select id from test_ids where name='document_request'),
    '40000000-0000-4000-8000-000000000001'
  ),
  'client_request_id уже использован другой операцией'
);

select pg_temp.expect_error(
  $q$select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    '[{"task_type":"document_request","assigned_role":"spn","assigned_to":"00000000-0000-4000-8000-000000000004","evidence_kind":"document_status","subject_kind":"document","subject_reference_id":"30000000-0000-4000-8000-000000000002","unknown":"x"}]'::jsonb,
    '40000000-0000-4000-8000-000000000002'
  )$q$,
  'Неизвестные поля bounded-задачи'
);

select pg_temp.expect_error(
  $q$select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    '[]'::jsonb,
    '40000000-0000-4000-8000-000000000003'
  )$q$,
  'Выберите от 1 до 5 задач'
);

select pg_temp.expect_error(
  $q$select public.nav_v2_create_bounded_tasks(
    '10000000-0000-4000-8000-000000000001',
    jsonb_build_array(
      jsonb_build_object('task_type','document_request','assigned_role','spn','assigned_to','00000000-0000-4000-8000-000000000004','evidence_kind','document_status','subject_kind','document','subject_reference_id','30000000-0000-4000-8000-000000000010'),
      jsonb_build_object('task_type','document_request','assigned_role','spn','assigned_to','00000000-0000-4000-8000-000000000004','evidence_kind','document_status','subject_kind','document','subject_reference_id','30000000-0000-4000-8000-000000000011'),
      jsonb_build_object('task_type','document_request','assigned_role','spn','assigned_to','00000000-0000-4000-8000-000000000004','evidence_kind','document_status','subject_kind','document','subject_reference_id','30000000-0000-4000-8000-000000000012'),
      jsonb_build_object('task_type','document_request','assigned_role','spn','assigned_to','00000000-0000-4000-8000-000000000004','evidence_kind','document_status','subject_kind','document','subject_reference_id','30000000-0000-4000-8000-000000000013'),
      jsonb_build_object('task_type','document_request','assigned_role','spn','assigned_to','00000000-0000-4000-8000-000000000004','evidence_kind','document_status','subject_kind','document','subject_reference_id','30000000-0000-4000-8000-000000000014'),
      jsonb_build_object('task_type','document_request','assigned_role','spn','assigned_to','00000000-0000-4000-8000-000000000004','evidence_kind','document_status','subject_kind','document','subject_reference_id','30000000-0000-4000-8000-000000000015')
    ),
    '40000000-0000-4000-8000-000000000004'
  )$q$,
  'Выберите от 1 до 5 задач'
);
