do $migration$
declare
  v_sql text;
  v_next text;
begin
  select pg_get_functiondef(
    'nav_v2_private.nav_v2_save_wizard_result_legacy_20260715(jsonb)'::regprocedure
  ) into v_sql;

  if v_sql is null then
    raise exception 'Private Navigator wizard save function not found';
  end if;

  v_next := replace(
    v_sql,
    $$v_broker_needed := v_has_mortgage or public.nav_v2_jsonb_has(v_payments, 'matcap');$$,
    $$v_broker_needed := v_has_mortgage;$$
  );
  if v_next = v_sql then
    raise exception 'Broker-needed rule marker not found';
  end if;
  v_sql := v_next;

  v_next := replace(
    v_sql,
    $$v_next_action := 'Передать брокеру ипотеку, банк или маткапитал';$$,
    $$v_next_action := 'Передать брокеру для консультации, подбора ипотечной программы и одобрения';$$
  );
  if v_next = v_sql then
    raise exception 'Broker next-action marker not found';
  end if;
  v_sql := v_next;

  v_next := replace(
    v_sql,
    $$select v_deal_id, 'yellow', 'mortgage', 'Ипотека или маткапитал требуют контроля', 'Нужно проверить банк, оценку, СФР и порядок расчетов.', 'Передать брокеру.', false, true, 'broker'$$,
    $$select v_deal_id, 'yellow', 'mortgage', 'Ипотека требует консультации и одобрения', 'Брокер консультирует клиента и СПН, подбирает ипотечную программу и помогает получить одобрение банка. Подготовку и оформление сделки ведут СПН и юрист.', 'Передать брокеру для консультации, подбора программы и одобрения.', false, true, 'broker'$$
  );
  if v_next = v_sql then
    raise exception 'Broker risk marker not found';
  end if;
  v_sql := v_next;

  v_next := replace(
    v_sql,
    $$select v_deal_id, 'Проверка банка / ипотеки / маткапитала', 'Проверить банк, оценку, страховку, СФР, порядок расчетов.', 'broker', 'high', 'auto_broker', v_uid$$,
    $$select v_deal_id, 'Ипотечная консультация и одобрение', 'Проконсультировать клиента и СПН, подобрать ипотечную программу и помочь получить одобрение банка.', 'broker', 'high', 'auto_broker', v_uid$$
  );
  if v_next = v_sql then
    raise exception 'Broker task marker not found';
  end if;
  v_sql := v_next;

  execute v_sql;
end;
$migration$;

do $migration$
declare
  v_sql text;
  v_next text;
  v_old text := $old$        case when nullif(trim(d.finance_data ->> 'certificateType'), '') is not null
          and nullif(trim(d.finance_data ->> 'certificateAmount'), '') is null
          then 'Не указана сумма сертификата' end,
        case when nullif(trim(d.finance_data ->> 'certificateType'), '') is not null
          and nullif(trim(d.finance_data ->> 'certificateDeadline'), '') is null
          then 'Не указан срок сертификата' end,
$old$;
begin
  select pg_get_functiondef(
    'public.nav_v2_get_broker_queue_preview(integer)'::regprocedure
  ) into v_sql;

  if v_sql is null then
    raise exception 'Broker queue function not found';
  end if;

  v_next := replace(v_sql, v_old, '');
  if v_next = v_sql then
    raise exception 'Certificate responsibility markers not found in broker queue';
  end if;

  execute v_next;
end;
$migration$;

create temporary table nav_v2_broker_scope_correction_candidates
on commit drop
as
select d.id
from public.nav_deals_v2 d
where d.has_matcap is true
  and coalesce(d.has_mortgage, false) is false
  and d.broker_needed is true
  and d.broker_id is null
  and coalesce(d.wizard_snapshot -> 'deal' -> 'payments', '[]'::jsonb) ? 'matcap'
  and not (coalesce(d.wizard_snapshot -> 'deal' -> 'payments', '[]'::jsonb) ? 'mortgage')
  and not (coalesce(d.wizard_snapshot -> 'deal' -> 'payments', '[]'::jsonb) ? 'militaryMortgage')
  and exists (
    select 1
    from public.nav_deal_tasks_v2 t
    where t.deal_id = d.id
      and t.source = 'auto_broker'
  );

update public.nav_deals_v2 d
set broker_needed = false,
    next_action = case
      when coalesce(d.next_action, '') ilike '%брокер%'
        then 'Передать юристу маткапитал и условия использования средств; СПН согласовывает условия сделки'
      else d.next_action
    end,
    deal_summary = case
      when coalesce(d.next_action, '') ilike '%брокер%'
        then jsonb_set(
          coalesce(d.deal_summary, '{}'::jsonb),
          '{next_action}',
          to_jsonb('Передать юристу маткапитал и условия использования средств; СПН согласовывает условия сделки'::text),
          true
        )
      else d.deal_summary
    end,
    updated_at = now()
from nav_v2_broker_scope_correction_candidates c
where c.id = d.id;

update public.nav_deal_tasks_v2 t
set status = 'cancelled',
    updated_at = now()
from nav_v2_broker_scope_correction_candidates c
where c.id = t.deal_id
  and t.source = 'auto_broker'
  and t.status in ('open', 'in_progress');

update public.nav_deal_risks_v2 r
set is_resolved = true,
    resolved_at = now(),
    updated_at = now()
from nav_v2_broker_scope_correction_candidates c
where c.id = r.deal_id
  and r.is_resolved is false
  and r.assigned_role = 'broker'
  and r.category = 'mortgage'
  and r.title = 'Ипотека или маткапитал требуют контроля';

insert into public.nav_deal_events_v2 (
  deal_id,
  actor_id,
  event_type,
  event_title,
  event_data
)
select
  c.id,
  null,
  'routing_corrected',
  'Исправлена маршрутизация ипотечного брокера',
  jsonb_build_object(
    'reason', 'Маткапитал без ипотеки не относится к работе ипотечного брокера',
    'broker_scope', jsonb_build_array(
      'консультация по ипотеке',
      'подбор ипотечной программы',
      'помощь в одобрении',
      'обучение СПН по ипотеке'
    ),
    'legal_scope', jsonb_build_array(
      'маткапитал и сертификаты',
      'подготовка и оформление ипотечной сделки'
    ),
    'correction_version', '2026-07-16'
  )
from nav_v2_broker_scope_correction_candidates c;

comment on function public.nav_v2_get_broker_queue_preview(integer) is
  'Read-only mortgage broker queue. Broker scope: mortgage consultation, program selection, approval support and SPN training. Matcap, certificates and legal deal execution remain with SPN and lawyer.';
