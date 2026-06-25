do $migration$
declare
  v_sql text;
  v_next text;
begin
  select pg_get_functiondef('public.nav_v2_get_deal_responsibility_snapshot(uuid)'::regprocedure) into v_sql;

  if v_sql is null then
    raise exception 'Функция nav_v2_get_deal_responsibility_snapshot(uuid) не найдена';
  end if;

  if position('v_gaps text[]' in v_sql) = 0 then
    v_next := replace(
      v_sql,
      $old$  v_legal_owner_text text;$old$,
      $new$  v_legal_owner_text text;
  v_gaps text[];
  v_gap_count int := 0;
  v_handoff_score int := 100;$new$
    );
    if v_next = v_sql then
      raise exception 'Не найден блок declare для handoff gaps';
    end if;
    v_sql := v_next;
  end if;

  if position('handoff_readiness_score' in v_sql) = 0 then
    v_next := replace(
      v_sql,
      $old$  v_client_owner_text := case$old$,
      $new$  v_gaps := array_remove(array[
    case when nullif(trim(coalesce(v_deal.seller_name, '')), '') is null then 'указать ФИО продавца' end,
    case when nullif(trim(coalesce(v_deal.seller_phone, '')), '') is null then 'указать телефон продавца' end,
    case when nullif(trim(coalesce(v_deal.buyer_name, '')), '') is null then 'указать ФИО покупателя' end,
    case when nullif(trim(coalesce(v_deal.buyer_phone, '')), '') is null then 'указать телефон покупателя' end,
    case when nullif(trim(coalesce(v_deal.object_type, '')), '') is null then 'указать тип объекта' end,
    case when nullif(trim(coalesce(v_deal.address, '')), '') is null then 'указать адрес объекта' end,
    case when coalesce(v_deal.price_total, v_deal.price_contract, 0) <= 0 then 'указать цену сделки' end,
    case when coalesce(v_deal.deposit_amount, 0) <= 0 then 'указать сумму задатка' end,
    case when coalesce(v_deal.settlements_agreed, false) = false then 'согласовать порядок расчетов' end,
    case when coalesce(v_deal.expenses_agreed, false) = false then 'согласовать расходы сторон' end,
    case when v_client_docs > 0 then 'закрыть клиентские документы: ' || v_client_docs::text end,
    case when v_client_tasks > 0 then 'закрыть задачи СПН: ' || v_client_tasks::text end
  ], null);

  v_gap_count := coalesce(array_length(v_gaps, 1), 0);
  v_handoff_score := greatest(0, 100 - v_gap_count * 8);

  v_client_owner_text := case$new$
    );
    if v_next = v_sql then
      raise exception 'Не найден блок перед client_owner_text';
    end if;
    v_sql := v_next;

    v_next := replace(
      v_sql,
      $old$    'broker', v_broker,
    'handoff_contract', jsonb_build_object($old$,
      $new$    'broker', v_broker,
    'handoff_ready', v_gap_count = 0,
    'handoff_readiness_score', v_handoff_score,
    'handoff_gap_count', v_gap_count,
    'handoff_gaps', to_jsonb(coalesce(v_gaps, array[]::text[])),
    'handoff_status_text', case
      when v_gap_count = 0 then 'СПН передал юристу полный базовый набор данных'
      when v_gap_count <= 3 then 'Есть небольшие пробелы перед юридической проверкой'
      else 'Перед юридической проверкой СПН нужно дозаполнить ключевые данные'
    end,
    'handoff_contract', jsonb_build_object($new$
    );
    if v_next = v_sql then
      raise exception 'Не найден JSON-блок broker/handoff_contract';
    end if;
    v_sql := v_next;

    v_next := replace(
      v_sql,
      $old$      when v_client_docs + v_client_tasks > 0 then 'СПН собирает и уточняет данные у продавца/покупателя'
      when v_legal_docs + v_legal_tasks > 0 then 'Юрист проверяет риски, документы и договорную часть'$old$,
      $new$      when v_gap_count > 0 then 'СПН дозаполняет данные для юриста'
      when v_legal_docs + v_legal_tasks > 0 then 'Юрист проверяет риски, документы и договорную часть'$new$
    );
    if v_next = v_sql then
      raise exception 'Не найден блок next_handoff_action';
    end if;
    v_sql := v_next;
  end if;

  execute v_sql;
end;
$migration$;
