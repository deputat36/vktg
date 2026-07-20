-- Repository-only replacement rehearsal for Navigator v2 quality completeness.
-- Not a migration. Do not apply to production without explicit owner/deployment approval.

create or replace function nav_v2_private.nav_v2_quality_sync_task_v1(
  p_deal_id uuid,
  p_required boolean,
  p_source text,
  p_title text,
  p_description text,
  p_assigned_to uuid,
  p_assigned_role public.nav_v2_user_role,
  p_priority public.nav_v2_task_priority,
  p_task_type text,
  p_sla_days integer
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public, nav_v2_private
as $function$
declare
  v_rows integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_closed integer := 0;
begin
  if p_source is null or p_source not like 'auto_quality_%' then
    raise exception 'Quality task source is invalid' using errcode = '22023';
  end if;
  if p_task_type <> all(array[
    'operational_task', 'document_request', 'quality_warning', 'system_recommendation',
    'legal_blocker', 'broker_task', 'management_escalation'
  ]) then
    raise exception 'Quality task type is invalid' using errcode = '22023';
  end if;
  if p_required is not true then
    update public.nav_deal_tasks_v2
    set status = 'done'::public.nav_v2_task_status,
        completed_at = coalesce(completed_at, clock_timestamp()),
        updated_at = clock_timestamp()
    where deal_id = p_deal_id
      and source = p_source
      and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status);
    get diagnostics v_closed = row_count;
    return jsonb_build_object('inserted', 0, 'updated', 0, 'closed', v_closed);
  end if;

  update public.nav_deal_tasks_v2
  set title = p_title,
      description = p_description,
      assigned_to = p_assigned_to,
      assigned_role = p_assigned_role,
      priority = p_priority,
      task_type = p_task_type,
      sla_days = p_sla_days,
      updated_at = clock_timestamp()
  where deal_id = p_deal_id
    and source = p_source
    and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status);
  get diagnostics v_rows = row_count;
  v_updated := v_rows;

  if v_rows = 0 then
    insert into public.nav_deal_tasks_v2 (
      deal_id, title, description, assigned_to, assigned_role, status, priority,
      due_date, source, created_by, task_type, sla_days
    ) values (
      p_deal_id, p_title, p_description, p_assigned_to, p_assigned_role,
      'open'::public.nav_v2_task_status, p_priority, null, p_source,
      p_assigned_to, p_task_type, p_sla_days
    );
    v_inserted := 1;
  end if;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'closed', 0);
end;
$function$;

create or replace function public.nav_v2_sync_deal_quality_tasks(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private, pg_temp
as $function$
declare
  d public.nav_deals_v2%rowtype;
  v_representation text;
  v_partner_side text;
  v_intake_v1 boolean;
  v_passport jsonb;
  v_work_plan jsonb;
  v_object_reason text;
  v_target_date text;
  v_requested_decision text;
  v_request_type text;
  v_has_object_reference boolean;
  v_has_strict_object_reference boolean;
  v_has_next_action boolean;
  v_date_unknown boolean;
  v_broker_contract_complete boolean;
  v_needs_representation boolean;
  v_requires_seller boolean;
  v_requires_buyer boolean;
  v_needs_object boolean;
  v_task jsonb;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_closed integer := 0;
  v_step integer := 0;
  v_manager_assignee uuid;
  v_manager_role public.nav_v2_user_role;
begin
  select * into d
  from public.nav_deals_v2
  where id = p_deal_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'deal_not_found', 'deal_id', p_deal_id);
  end if;

  -- These sources are incompatible with the privacy guard or replaced by the bounded contract.
  -- They are closed only for the deal currently being synchronized; no global backfill occurs.
  update public.nav_deal_tasks_v2
  set status = 'done'::public.nav_v2_task_status,
      completed_at = coalesce(completed_at, clock_timestamp()),
      updated_at = clock_timestamp()
  where deal_id = p_deal_id
    and source in (
      'auto_quality_seller_name', 'auto_quality_buyer_name',
      'auto_quality_address', 'auto_quality_responsible_spn'
    )
    and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status);
  get diagnostics v_step = row_count;
  v_closed := v_closed + v_step;

  v_representation := coalesce(nullif(btrim(d.representation_model), ''), 'unknown');
  v_partner_side := coalesce(
    nullif(btrim(d.wizard_snapshot #>> '{deal,intake_draft,partnerSide}'), ''),
    nullif(btrim(d.deal_summary #>> '{legal_passport,partner_side}'), ''),
    ''
  );
  v_passport := coalesce(d.deal_summary->'legal_passport', d.wizard_snapshot #> '{deal,legal_passport}', '{}'::jsonb);
  v_work_plan := coalesce(d.deal_summary->'intake_work_plan', d.wizard_snapshot #> '{deal,intake_work_plan}', '{}'::jsonb);
  v_intake_v1 := coalesce(d.wizard_snapshot #>> '{deal,intake_contract_version}', '') = '1'
    or coalesce(v_passport->>'version', '') = '1';

  v_object_reason := coalesce(
    nullif(btrim(d.wizard_snapshot #>> '{deal,intake_draft,objectNotSelectedReason}'), ''),
    nullif(btrim(v_passport #>> '{object,not_selected_reason}'), ''),
    ''
  );
  v_target_date := coalesce(
    nullif(btrim(v_passport->>'target_date'), ''),
    nullif(btrim(d.wizard_snapshot #>> '{deal,intake_draft,targetDate}'), ''),
    ''
  );
  v_date_unknown := coalesce(d.wizard_snapshot #>> '{deal,intake_draft,dateUnknown}', '') = 'true';
  v_requested_decision := coalesce(
    nullif(btrim(v_passport->>'requested_decision'), ''),
    nullif(btrim(d.wizard_snapshot #>> '{deal,intake_draft,requestedDecision}'), ''),
    ''
  );
  v_request_type := coalesce(
    nullif(btrim(v_passport->>'request_type'), ''),
    nullif(btrim(d.wizard_snapshot #>> '{deal,intake_draft,lawyerRequestType}'), ''),
    ''
  );

  v_has_object_reference := (
    nullif(btrim(coalesce(d.object_type, '')), '') is not null
    and d.object_type <> 'not_selected'
  ) or nullif(btrim(coalesce(d.address, '')), '') is not null
    or nullif(btrim(coalesce(d.cadastral_number, '')), '') is not null;
  v_has_strict_object_reference := nullif(btrim(coalesce(d.address, '')), '') is not null
    or nullif(btrim(coalesce(d.cadastral_number, '')), '') is not null;
  v_has_next_action := nullif(btrim(coalesce(d.next_action, '')), '') is not null
    or nullif(btrim(coalesce(v_passport->>'spn_next_action', '')), '') is not null
    or nullif(btrim(coalesce(d.wizard_snapshot #>> '{deal,spn_final,next_step}', '')), '') is not null;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(v_work_plan->'task_candidates', v_work_plan->'ready_tasks', '[]'::jsonb)) item
    where coalesce(item->>'owner_role', item #>> '{owner,role}') = 'broker'
      and nullif(btrim(coalesce(item->>'action', '')), '') is not null
      and nullif(btrim(coalesce(item->>'expected_result', '')), '') is not null
  ) into v_broker_contract_complete;

  v_needs_representation := v_representation = 'unknown'
    or v_representation not in ('seller', 'buyer', 'both', 'one_spn_both', 'partner_agency')
    or (v_representation = 'partner_agency' and v_partner_side not in ('seller', 'buyer', 'both'));
  v_requires_seller := v_representation in ('seller', 'both', 'one_spn_both')
    or (v_representation = 'partner_agency' and v_partner_side in ('seller', 'both'));
  v_requires_buyer := v_representation in ('buyer', 'both', 'one_spn_both')
    or (v_representation = 'partner_agency' and v_partner_side in ('buyer', 'both'));
  v_needs_object := case
    when d.preparation_mode in ('deposit', 'deal', 'check_docs', 'rework') then not v_has_strict_object_reference
    else not v_has_object_reference and v_object_reason = ''
  end;

  v_manager_assignee := coalesce(d.manager_id, d.created_by);
  v_manager_role := case when d.manager_id is not null
    then 'manager'::public.nav_v2_user_role
    else 'spn'::public.nav_v2_user_role
  end;

  v_task := nav_v2_private.nav_v2_quality_sync_task_v1(
    p_deal_id, v_needs_representation, 'auto_quality_representation',
    'Уточнить сопровождаемую сторону',
    'Зафиксировать, чью сторону сопровождает офис. Для партнёрской сделки отдельно указать сторону партнёра; Navigator не должен угадывать её.',
    d.created_by, 'spn'::public.nav_v2_user_role, 'high'::public.nav_v2_task_priority,
    'operational_task', 2
  );
  v_inserted := v_inserted + coalesce((v_task->>'inserted')::integer, 0);
  v_updated := v_updated + coalesce((v_task->>'updated')::integer, 0);
  v_closed := v_closed + coalesce((v_task->>'closed')::integer, 0);

  v_task := nav_v2_private.nav_v2_quality_sync_task_v1(
    p_deal_id, v_requires_seller and d.seller_spn_id is null, 'auto_quality_seller_spn',
    'Назначить СПН стороны продавца',
    'Сторона продавца сопровождается офисом, но ответственный СПН продавца не назначен.',
    v_manager_assignee, v_manager_role, 'urgent'::public.nav_v2_task_priority,
    case when d.manager_id is not null then 'management_escalation' else 'operational_task' end, 1
  );
  v_inserted := v_inserted + coalesce((v_task->>'inserted')::integer, 0);
  v_updated := v_updated + coalesce((v_task->>'updated')::integer, 0);
  v_closed := v_closed + coalesce((v_task->>'closed')::integer, 0);

  v_task := nav_v2_private.nav_v2_quality_sync_task_v1(
    p_deal_id, v_requires_buyer and d.buyer_spn_id is null, 'auto_quality_buyer_spn',
    'Назначить СПН стороны покупателя',
    'Сторона покупателя сопровождается офисом, но ответственный СПН покупателя не назначен.',
    v_manager_assignee, v_manager_role, 'urgent'::public.nav_v2_task_priority,
    case when d.manager_id is not null then 'management_escalation' else 'operational_task' end, 1
  );
  v_inserted := v_inserted + coalesce((v_task->>'inserted')::integer, 0);
  v_updated := v_updated + coalesce((v_task->>'updated')::integer, 0);
  v_closed := v_closed + coalesce((v_task->>'closed')::integer, 0);

  v_task := nav_v2_private.nav_v2_quality_sync_task_v1(
    p_deal_id,
    v_representation = 'one_spn_both'
      and d.seller_spn_id is not null and d.buyer_spn_id is not null
      and d.seller_spn_id <> d.buyer_spn_id,
    'auto_quality_one_spn_consistency',
    'Исправить назначение одного СПН на обе стороны',
    'Модель сделки указывает одного СПН на обе стороны, но назначены разные специалисты.',
    v_manager_assignee, v_manager_role, 'high'::public.nav_v2_task_priority,
    case when d.manager_id is not null then 'management_escalation' else 'operational_task' end, 2
  );
  v_inserted := v_inserted + coalesce((v_task->>'inserted')::integer, 0);
  v_updated := v_updated + coalesce((v_task->>'updated')::integer, 0);
  v_closed := v_closed + coalesce((v_task->>'closed')::integer, 0);

  v_task := nav_v2_private.nav_v2_quality_sync_task_v1(
    p_deal_id, v_needs_object, 'auto_quality_object_context',
    'Уточнить объект или причину его отсутствия',
    'Для подготовки сделки нужен адрес или кадастровый номер. Для консультации допустима явная причина, почему объект ещё не выбран.',
    coalesce(d.seller_spn_id, d.buyer_spn_id, d.created_by),
    'spn'::public.nav_v2_user_role, 'high'::public.nav_v2_task_priority,
    'operational_task', 2
  );
  v_inserted := v_inserted + coalesce((v_task->>'inserted')::integer, 0);
  v_updated := v_updated + coalesce((v_task->>'updated')::integer, 0);
  v_closed := v_closed + coalesce((v_task->>'closed')::integer, 0);

  v_task := nav_v2_private.nav_v2_quality_sync_task_v1(
    p_deal_id, not v_has_next_action, 'auto_quality_next_action',
    'Зафиксировать следующий шаг',
    'Указать одно конкретное действие, которое двигает подготовку сделки дальше.',
    coalesce(d.seller_spn_id, d.buyer_spn_id, d.created_by),
    'spn'::public.nav_v2_user_role, 'normal'::public.nav_v2_task_priority,
    'operational_task', 3
  );
  v_inserted := v_inserted + coalesce((v_task->>'inserted')::integer, 0);
  v_updated := v_updated + coalesce((v_task->>'updated')::integer, 0);
  v_closed := v_closed + coalesce((v_task->>'closed')::integer, 0);

  v_task := nav_v2_private.nav_v2_quality_sync_task_v1(
    p_deal_id, v_intake_v1 and v_target_date = '' and not v_date_unknown,
    'auto_quality_target_date',
    'Указать срок следующего шага',
    'Указать целевую дату либо явно отметить, что дата пока неизвестна.',
    coalesce(d.seller_spn_id, d.buyer_spn_id, d.created_by),
    'spn'::public.nav_v2_user_role, 'high'::public.nav_v2_task_priority,
    'operational_task', 2
  );
  v_inserted := v_inserted + coalesce((v_task->>'inserted')::integer, 0);
  v_updated := v_updated + coalesce((v_task->>'updated')::integer, 0);
  v_closed := v_closed + coalesce((v_task->>'closed')::integer, 0);

  v_task := nav_v2_private.nav_v2_quality_sync_task_v1(
    p_deal_id, v_intake_v1 and d.lawyer_needed and (v_request_type = '' or v_requested_decision = ''),
    'auto_quality_lawyer_question',
    'Сформулировать вопрос юристу',
    'Перед передачей юристу указать тип запроса и конкретное решение, которое требуется получить.',
    coalesce(d.seller_spn_id, d.buyer_spn_id, d.created_by),
    'spn'::public.nav_v2_user_role, 'high'::public.nav_v2_task_priority,
    'operational_task', 2
  );
  v_inserted := v_inserted + coalesce((v_task->>'inserted')::integer, 0);
  v_updated := v_updated + coalesce((v_task->>'updated')::integer, 0);
  v_closed := v_closed + coalesce((v_task->>'closed')::integer, 0);

  v_task := nav_v2_private.nav_v2_quality_sync_task_v1(
    p_deal_id, v_intake_v1 and d.broker_needed and not v_broker_contract_complete,
    'auto_quality_broker_question',
    'Сформулировать ипотечную задачу брокеру',
    'Перед передачей брокеру зафиксировать действие и ожидаемый результат только по ипотечной части.',
    coalesce(d.buyer_spn_id, d.seller_spn_id, d.created_by),
    'spn'::public.nav_v2_user_role, 'high'::public.nav_v2_task_priority,
    'operational_task', 2
  );
  v_inserted := v_inserted + coalesce((v_task->>'inserted')::integer, 0);
  v_updated := v_updated + coalesce((v_task->>'updated')::integer, 0);
  v_closed := v_closed + coalesce((v_task->>'closed')::integer, 0);

  return jsonb_build_object(
    'ok', true,
    'quality_contract_version', 1,
    'deal_id', p_deal_id,
    'intake_v1', v_intake_v1,
    'inserted_tasks', v_inserted,
    'updated_tasks', v_updated,
    'closed_tasks', v_closed,
    'active_sources', coalesce((
      select jsonb_agg(source order by source)
      from public.nav_deal_tasks_v2
      where deal_id = p_deal_id
        and source like 'auto_quality_%'
        and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function public.nav_v2_deal_quality_tasks_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  perform public.nav_v2_sync_deal_quality_tasks(new.id);
  return new;
end;
$function$;

drop trigger if exists nav_deals_v2_quality_tasks_aiu on public.nav_deals_v2;
create trigger nav_deals_v2_quality_tasks_aiu
after insert or update of
  representation_model, preparation_mode, object_type, address, cadastral_number,
  seller_spn_id, buyer_spn_id, manager_id, next_action, lawyer_needed, broker_needed,
  wizard_snapshot, deal_summary
on public.nav_deals_v2
for each row
execute function public.nav_v2_deal_quality_tasks_trigger();

revoke all on function nav_v2_private.nav_v2_quality_sync_task_v1(
  uuid, boolean, text, text, text, uuid, public.nav_v2_user_role,
  public.nav_v2_task_priority, text, integer
) from public, anon, authenticated;
revoke execute on function public.nav_v2_sync_deal_quality_tasks(uuid) from public, anon, authenticated;
revoke execute on function public.nav_v2_deal_quality_tasks_trigger() from public, anon, authenticated;
grant execute on function nav_v2_private.nav_v2_quality_sync_task_v1(
  uuid, boolean, text, text, text, uuid, public.nav_v2_user_role,
  public.nav_v2_task_priority, text, integer
) to service_role;
grant execute on function public.nav_v2_sync_deal_quality_tasks(uuid) to service_role;
