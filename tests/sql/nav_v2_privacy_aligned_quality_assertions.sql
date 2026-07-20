\set ON_ERROR_STOP on

-- Applying the detached replacement must not mutate existing business rows by itself.
select harness.assert_true(
  (select count(*) from public.nav_deal_tasks_v2 where source in ('auto_quality_seller_name','auto_quality_buyer_name') and status='open') = 4,
  'prototype apply performed an implicit legacy cleanup'
);

-- Seller-only: require only seller SPN, assign the manager, preserve deal creator.
insert into public.nav_deals_v2(
  id,created_by,manager_id,representation_model,preparation_mode,object_type,address,next_action
) values (
  '73000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000004','seller','deal','flat_mkd','Ориентир','Собрать документы'
);
select harness.assert_true(
  (select count(*) from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000001' and source='auto_quality_seller_spn' and status='open') = 1,
  'seller-only deal did not receive seller SPN task'
);
select harness.assert_true(
  not exists(select 1 from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000001' and source='auto_quality_buyer_spn' and status='open'),
  'seller-only deal received buyer SPN task'
);
select harness.assert_true(
  exists(select 1 from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000001' and source='auto_quality_seller_spn'
    and assigned_to='71000000-0000-4000-8000-000000000004' and assigned_role='manager'
    and created_by='71000000-0000-4000-8000-000000000001' and task_type='management_escalation'),
  'seller SPN task lost manager assignment or deal creator authorship'
);
update public.nav_deals_v2 set seller_spn_id='71000000-0000-4000-8000-000000000002'
where id='73000000-0000-4000-8000-000000000001';
select harness.assert_true(
  (select status from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000001' and source='auto_quality_seller_spn') = 'done',
  'seller SPN task did not auto-close'
);

-- Buyer-only: never infer seller requirements.
insert into public.nav_deals_v2(
  id,created_by,representation_model,preparation_mode,object_type,address,next_action
) values (
  '73000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001',
  'buyer','deposit','flat_mkd','Ориентир','Уточнить ипотеку'
);
select harness.assert_true(
  (select count(*) from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000002' and source='auto_quality_buyer_spn' and status='open') = 1,
  'buyer-only deal did not receive buyer SPN task'
);
select harness.assert_true(
  not exists(select 1 from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000002' and source='auto_quality_seller_spn' and status='open'),
  'buyer-only deal received seller SPN task'
);

-- Unknown and partner representation do not guess a side.
insert into public.nav_deals_v2(
  id,created_by,representation_model,preparation_mode,object_type,address,next_action
) values
  ('73000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000001','unknown','consult','flat_mkd','Ориентир','Уточнить сторону'),
  ('73000000-0000-4000-8000-000000000004','71000000-0000-4000-8000-000000000001','partner_agency','consult','flat_mkd','Ориентир','Уточнить партнёра');
select harness.assert_true(
  (select count(*) from public.nav_deal_tasks_v2 where deal_id in ('73000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000004') and source='auto_quality_representation' and status='open') = 2,
  'unknown/partner deals did not receive representation tasks'
);
select harness.assert_true(
  not exists(select 1 from public.nav_deal_tasks_v2 where deal_id in ('73000000-0000-4000-8000-000000000003','73000000-0000-4000-8000-000000000004') and source in ('auto_quality_seller_spn','auto_quality_buyer_spn') and status='open'),
  'unknown/partner deals guessed a side'
);
update public.nav_deals_v2
set wizard_snapshot='{"deal":{"intake_draft":{"partnerSide":"buyer"}}}'::jsonb,
    buyer_spn_id='71000000-0000-4000-8000-000000000003'
where id='73000000-0000-4000-8000-000000000004';
select harness.assert_true(
  (select status from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000004' and source='auto_quality_representation')='done',
  'explicit partner side did not close representation task'
);

-- one_spn_both requires the same resolved specialist on both sides.
insert into public.nav_deals_v2(
  id,created_by,seller_spn_id,buyer_spn_id,representation_model,preparation_mode,object_type,address,next_action
) values (
  '73000000-0000-4000-8000-000000000005','71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000003',
  'one_spn_both','deal','flat_mkd','Ориентир','Проверить условия'
);
select harness.assert_true(
  exists(select 1 from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000005' and source='auto_quality_one_spn_consistency' and status='open'),
  'one-SPN mismatch was not detected'
);
update public.nav_deals_v2 set buyer_spn_id=seller_spn_id where id='73000000-0000-4000-8000-000000000005';
select harness.assert_true(
  (select status from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000005' and source='auto_quality_one_spn_consistency')='done',
  'one-SPN mismatch task did not close'
);

-- Strict preparation requires address or cadastral number; consultation may explain why no object exists.
insert into public.nav_deals_v2(
  id,created_by,seller_spn_id,representation_model,preparation_mode,object_type,next_action
) values (
  '73000000-0000-4000-8000-000000000006','71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002','seller','deal','flat_mkd','Уточнить объект'
);
select harness.assert_true(
  exists(select 1 from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000006' and source='auto_quality_object_context' and status='open'),
  'strict deal without address/cadastral did not receive object task'
);
update public.nav_deals_v2 set cadastral_number='условный-номер' where id='73000000-0000-4000-8000-000000000006';
select harness.assert_true(
  (select status from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000006' and source='auto_quality_object_context')='done',
  'object task did not close after cadastral number'
);

insert into public.nav_deals_v2(
  id,created_by,seller_spn_id,representation_model,preparation_mode,next_action,wizard_snapshot
) values (
  '73000000-0000-4000-8000-000000000007','71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002','seller','consult','Связаться с клиентом',
  '{"deal":{"intake_contract_version":1,"intake_draft":{"objectNotSelectedReason":"Клиент выбирает объект","dateUnknown":true}}}'::jsonb
);
select harness.assert_true(
  not exists(select 1 from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000007' and source in ('auto_quality_object_context','auto_quality_target_date') and status='open'),
  'consultation with explicit no-object reason/dateUnknown received false tasks'
);

-- Next action applies to legacy and intake rows.
insert into public.nav_deals_v2(
  id,created_by,seller_spn_id,representation_model,preparation_mode,object_type,address
) values (
  '73000000-0000-4000-8000-000000000008','71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002','seller','deal','flat_mkd','Ориентир'
);
select harness.assert_true(
  exists(select 1 from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000008' and source='auto_quality_next_action' and status='open'),
  'missing next action was not detected'
);
update public.nav_deals_v2 set next_action='Запросить выписку' where id='73000000-0000-4000-8000-000000000008';
select harness.assert_true(
  (select status from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000008' and source='auto_quality_next_action')='done',
  'next-action task did not close'
);

-- Deadline and profile-question checks are intake-v1 only.
insert into public.nav_deals_v2(
  id,created_by,seller_spn_id,representation_model,preparation_mode,object_type,address,next_action,wizard_snapshot
) values (
  '73000000-0000-4000-8000-000000000009','71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002','seller','deal','flat_mkd','Ориентир','Подготовить пакет',
  '{"deal":{"intake_contract_version":1,"intake_draft":{}}}'::jsonb
);
select harness.assert_true(
  exists(select 1 from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000009' and source='auto_quality_target_date' and status='open'),
  'intake-v1 deadline gap was not detected'
);
update public.nav_deals_v2
set wizard_snapshot=jsonb_set(wizard_snapshot,'{deal,intake_draft,dateUnknown}','true'::jsonb,true)
where id='73000000-0000-4000-8000-000000000009';
select harness.assert_true(
  (select status from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000009' and source='auto_quality_target_date')='done',
  'dateUnknown did not close deadline task'
);

insert into public.nav_deals_v2(
  id,created_by,seller_spn_id,representation_model,preparation_mode,object_type,address,next_action,lawyer_needed,wizard_snapshot,deal_summary
) values (
  '73000000-0000-4000-8000-000000000010','71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000002','seller','deal','flat_mkd','Ориентир','Передать юристу',true,
  '{"deal":{"intake_contract_version":1,"intake_draft":{"dateUnknown":true}}}'::jsonb,
  '{"legal_passport":{"version":1}}'::jsonb
);
select harness.assert_true(
  exists(select 1 from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000010' and source='auto_quality_lawyer_question' and status='open'),
  'lawyer handoff without request/decision was not detected'
);
update public.nav_deals_v2
set deal_summary='{"legal_passport":{"version":1,"request_type":"check_document_package","requested_decision":"Перечислить недостающие статусы"}}'::jsonb
where id='73000000-0000-4000-8000-000000000010';
select harness.assert_true(
  (select status from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000010' and source='auto_quality_lawyer_question')='done',
  'complete lawyer request did not close task'
);

insert into public.nav_deals_v2(
  id,created_by,buyer_spn_id,representation_model,preparation_mode,object_type,address,next_action,broker_needed,wizard_snapshot,deal_summary
) values (
  '73000000-0000-4000-8000-000000000011','71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000003','buyer','deal','flat_mkd','Ориентир','Передать брокеру',true,
  '{"deal":{"intake_contract_version":1,"intake_draft":{"dateUnknown":true}}}'::jsonb,
  '{"legal_passport":{"version":1}}'::jsonb
);
select harness.assert_true(
  exists(select 1 from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000011' and source='auto_quality_broker_question' and status='open'),
  'broker handoff without bounded task was not detected'
);
update public.nav_deals_v2
set deal_summary='{"legal_passport":{"version":1},"intake_work_plan":{"task_candidates":[{"owner_role":"broker","action":"Проверить ипотечное одобрение","expected_result":"Ипотечная часть готова или указан блокер"}]}}'::jsonb
where id='73000000-0000-4000-8000-000000000011';
select harness.assert_true(
  (select status from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000011' and source='auto_quality_broker_question')='done',
  'bounded broker task did not close question task'
);

-- Repeated sync updates the same open task and never duplicates it.
select public.nav_v2_sync_deal_quality_tasks('73000000-0000-4000-8000-000000000003');
select public.nav_v2_sync_deal_quality_tasks('73000000-0000-4000-8000-000000000003');
select harness.assert_true(
  (select count(*) from public.nav_deal_tasks_v2 where deal_id='73000000-0000-4000-8000-000000000003' and source='auto_quality_representation' and status in ('open','in_progress')) = 1,
  'repeated sync duplicated an open quality task'
);

-- Legacy name tasks close only on the touched deal; untouched inventory remains for owner-approved cleanup.
select public.nav_v2_sync_deal_quality_tasks('72000000-0000-4000-8000-000000000001');
select harness.assert_true(
  (select count(*) from public.nav_deal_tasks_v2 where deal_id='72000000-0000-4000-8000-000000000001' and source in ('auto_quality_seller_name','auto_quality_buyer_name') and status='done') = 2,
  'touched legacy deal did not close obsolete name tasks'
);
select harness.assert_true(
  (select count(*) from public.nav_deal_tasks_v2 where deal_id='72000000-0000-4000-8000-000000000002' and source in ('auto_quality_seller_name','auto_quality_buyer_name') and status='open') = 2,
  'untouched legacy inventory was changed without cleanup approval'
);

-- No new deal may receive name/phone requirements; all open new tasks are bounded and dated.
select harness.assert_true(
  not exists(
    select 1 from public.nav_deal_tasks_v2
    where deal_id::text like '73000000-%'
      and source in ('auto_quality_seller_name','auto_quality_buyer_name')
  ),
  'new quality lifecycle created name tasks'
);
select harness.assert_true(
  not exists(
    select 1 from public.nav_deal_tasks_v2
    where deal_id::text like '73000000-%'
      and (source like '%phone%' or lower(title) like '%телефон%')
  ),
  'new quality lifecycle created phone tasks'
);
select harness.assert_true(
  not exists(
    select 1 from public.nav_deal_tasks_v2
    where deal_id::text like '73000000-%'
      and status in ('open','in_progress')
      and (task_type is null or sla_days is null or due_date is null or created_by is null)
  ),
  'open new quality task lacks bounded type/SLA/due date/creator'
);
select harness.assert_true(
  not has_function_privilege('authenticated','public.nav_v2_sync_deal_quality_tasks(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.nav_v2_sync_deal_quality_tasks(uuid)','EXECUTE')
  and has_function_privilege('service_role','public.nav_v2_sync_deal_quality_tasks(uuid)','EXECUTE'),
  'quality sync grants escaped internal service boundary'
);

select jsonb_build_object(
  'result','Navigator v2 privacy-aligned quality PostgreSQL 17 assertions passed',
  'new_open_sources',(
    select coalesce(jsonb_agg(distinct source order by source),'[]'::jsonb)
    from public.nav_deal_tasks_v2
    where deal_id::text like '73000000-%' and status in ('open','in_progress')
  ),
  'untouched_legacy_name_tasks',(
    select count(*) from public.nav_deal_tasks_v2
    where deal_id='72000000-0000-4000-8000-000000000002'
      and source in ('auto_quality_seller_name','auto_quality_buyer_name') and status='open'
  )
) as evidence;
