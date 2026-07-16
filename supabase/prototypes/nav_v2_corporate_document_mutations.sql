-- REPOSITORY-ONLY PROTOTYPE.
-- Apply after nav_v2_corporate_documents.sql and nav_v2_corporate_documents_index_amendment.sql.
-- Do not apply to production before executable PostgreSQL 17 and authenticated role/mutation E2E.

create table if not exists public.nav_deal_corporate_document_events_v2 (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.nav_deals_v2(id) on delete cascade,
  document_id uuid references public.nav_deal_corporate_documents_v2(id) on delete set null,
  event_type text not null,
  actor_id uuid not null references auth.users(id) on delete restrict,
  actor_role public.nav_v2_user_role not null,
  client_request_id uuid not null unique,
  before_state jsonb,
  after_state jsonb,
  result_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint nav_corporate_document_event_type_check check (
    event_type in ('initialize_selected', 'update_operational', 'propose_outcome', 'decide_outcome')
  )
);

alter table public.nav_deal_corporate_document_events_v2 enable row level security;
revoke all on table public.nav_deal_corporate_document_events_v2 from public, anon, authenticated;
grant all on table public.nav_deal_corporate_document_events_v2 to service_role;

create index if not exists nav_corporate_document_events_deal_created_idx
  on public.nav_deal_corporate_document_events_v2(deal_id, created_at desc);
create index if not exists nav_corporate_document_events_document_created_idx
  on public.nav_deal_corporate_document_events_v2(document_id, created_at desc)
  where document_id is not null;

create or replace function nav_v2_private.nav_v2_corporate_text_findings(p_text text)
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $$
  select array_remove(array[
    case when coalesce(p_text, '') ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}' then 'email' end,
    case when coalesce(p_text, '') ~ '(?:\+7|8)[[:space:]()\-]*[0-9]{3}[[:space:]()\-]*[0-9]{3}[[:space:]\-]*[0-9]{2}[[:space:]\-]*[0-9]{2}' then 'phone' end,
    case when coalesce(p_text, '') ~ '\m[0-9]{4}[[:space:]\-]+[0-9]{6}\M' then 'passport' end,
    case when coalesce(p_text, '') ~ '\m[0-9]{3}-[0-9]{3}-[0-9]{3}[[:space:]\-]+[0-9]{2}\M' then 'snils' end,
    case when coalesce(p_text, '') ~ '\m[0-9]{2}:[0-9]{2}:[0-9]{6,7}:[0-9]+\M' then 'cadastral_number' end,
    case when coalesce(p_text, '') ~* '(кв(?:артира)?|комн(?:ата)?|офис|пом(?:ещение)?)[[:space:]]*№?[[:space:]]*[0-9]+' then 'unit_number' end,
    case when coalesce(p_text, '') ~ '[А-ЯЁ][а-яё-]{1,30}[[:space:]]+[А-ЯЁ][а-яё-]{1,30}[[:space:]]+[А-ЯЁ][а-яё-]{1,30}' then 'possible_full_name' end,
    case when regexp_replace(coalesce(p_text, ''), '[^0-9]', '', 'g') ~ '[0-9]{16,19}' then 'long_payment_number' end
  ]::text[], null);
$$;

create or replace function nav_v2_private.nav_v2_corporate_document_json(p_document_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', doc.id,
    'deal_id', doc.deal_id,
    'party_side', doc.party_side,
    'document_type', doc.document_type,
    'status', doc.status,
    'is_required', doc.is_required,
    'required_stage', doc.required_stage,
    'responsible_role', doc.responsible_role,
    'assigned_to', doc.assigned_to,
    'assigned_to_name', assignee.full_name,
    'due_date', doc.due_date,
    'signing_method', doc.signing_method,
    'template_code', doc.template_code,
    'template_version', doc.template_version,
    'has_external_signature_reference', doc.has_external_signature_reference,
    'prepared_at', doc.prepared_at,
    'sent_at', doc.sent_at,
    'signed_at', doc.signed_at,
    'problem_note', doc.problem_note,
    'outcome_code', doc.outcome_code,
    'outcome_state', doc.outcome_state,
    'outcome_reason', doc.outcome_reason,
    'replacement_document_id', doc.replacement_document_id,
    'is_complete', nav_v2_private.nav_v2_corporate_document_is_complete(
      doc.status, doc.outcome_code, doc.outcome_state
    ),
    'created_at', doc.created_at,
    'updated_at', doc.updated_at
  )
  from public.nav_deal_corporate_documents_v2 doc
  left join public.nav_user_profiles assignee on assignee.id = doc.assigned_to
  where doc.id = p_document_id;
$$;

create or replace function nav_v2_private.nav_v2_corporate_replay(
  p_client_request_id uuid,
  p_event_type text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_event public.nav_deal_corporate_document_events_v2%rowtype;
begin
  select e.* into v_event
  from public.nav_deal_corporate_document_events_v2 e
  where e.client_request_id = p_client_request_id
  limit 1;

  if not found then
    return null;
  end if;
  if v_event.event_type <> p_event_type then
    raise exception 'client_request_id уже использован другой операцией' using errcode = '22023';
  end if;

  return v_event.result_payload || jsonb_build_object('idempotent_replay', true);
end;
$$;

create or replace function nav_v2_private.nav_v2_corporate_status_transition_allowed(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case coalesce(p_from, '')
    when 'planned' then p_to in ('planned', 'prepared', 'problem')
    when 'prepared' then p_to in ('prepared', 'sent_for_signature', 'problem')
    when 'sent_for_signature' then p_to in ('sent_for_signature', 'signed', 'problem')
    when 'problem' then p_to in ('problem', 'planned', 'prepared', 'sent_for_signature')
    when 'signed' then p_to = 'signed'
    when 'cancelled' then p_to = 'cancelled'
    else false
  end;
$$;

create or replace function nav_v2_private.nav_v2_can_mutate_corporate_document(
  p_document_id uuid,
  p_uid uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.nav_deal_corporate_documents_v2 doc
    join public.nav_deals_v2 deal on deal.id = doc.deal_id
    join public.nav_user_profiles caller on caller.id = p_uid and caller.is_active is true
    where doc.id = p_document_id
      and (
        caller.role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role)
        or (
          caller.role = 'manager'::public.nav_v2_user_role
          and nav_v2_private.nav_v2_can_edit_deal(doc.deal_id, p_uid)
        )
        or (
          caller.role = 'spn'::public.nav_v2_user_role
          and (
            doc.assigned_to = p_uid
            or (doc.party_side = 'seller'::public.nav_v2_side and deal.seller_spn_id = p_uid)
            or (doc.party_side = 'buyer'::public.nav_v2_side and deal.buyer_spn_id = p_uid)
          )
        )
      )
  );
$$;

create or replace function public.nav_v2_initialize_corporate_documents(
  p_deal_id uuid,
  p_items jsonb,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.nav_user_profiles%rowtype;
  v_replay jsonb;
  v_item jsonb;
  v_unknown text[];
  v_side text;
  v_type text;
  v_required boolean;
  v_stage text;
  v_responsible_role text;
  v_assigned_to uuid;
  v_due_date date;
  v_signing_method text;
  v_template_code text;
  v_template_version text;
  v_manager_id uuid;
  v_seller_spn_id uuid;
  v_buyer_spn_id uuid;
  v_existing_id uuid;
  v_document_id uuid;
  v_created jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_selected_count integer;
  v_event_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    raise exception 'client_request_id обязателен' using errcode = '22023';
  end if;

  v_replay := nav_v2_private.nav_v2_corporate_replay(p_client_request_id, 'initialize_selected');
  if v_replay is not null then return v_replay; end if;

  select p.* into v_profile
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;

  if not found or v_profile.role not in ('spn', 'manager', 'owner', 'admin') then
    raise exception 'Нет прав инициализировать корпоративные документы' using errcode = '42501';
  end if;
  if not nav_v2_private.nav_v2_can_edit_deal(p_deal_id, v_uid) then
    raise exception 'Нет прав менять корпоративный план сделки' using errcode = '42501';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items должен быть JSON-массивом' using errcode = '22023';
  end if;

  v_selected_count := jsonb_array_length(p_items);
  if v_selected_count < 1 or v_selected_count > 8 then
    raise exception 'Выберите от 1 до 8 корпоративных документов' using errcode = '22023';
  end if;

  select d.manager_id, d.seller_spn_id, d.buyer_spn_id
    into v_manager_id, v_seller_spn_id, v_buyer_spn_id
  from public.nav_deals_v2 d
  where d.id = p_deal_id;
  if not found then raise exception 'Сделка не найдена' using errcode = 'P0002'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Каждый элемент p_items должен быть объектом' using errcode = '22023';
    end if;

    select coalesce(array_agg(key), '{}'::text[]) into v_unknown
    from jsonb_object_keys(v_item) key
    where key not in (
      'party_side', 'document_type', 'is_required', 'required_stage', 'responsible_role',
      'assigned_to', 'due_date', 'signing_method', 'template_code', 'template_version'
    );
    if cardinality(v_unknown) > 0 then
      raise exception 'Неизвестные поля корпоративного документа: %', array_to_string(v_unknown, ', ')
        using errcode = '22023';
    end if;

    v_side := nullif(trim(coalesce(v_item ->> 'party_side', '')), '');
    v_type := nullif(trim(coalesce(v_item ->> 'document_type', '')), '');
    if v_side not in ('seller', 'buyer') then
      raise exception 'party_side должен быть seller или buyer' using errcode = '22023';
    end if;
    if v_type not in ('service_agreement', 'inspection_act', 'addendum', 'completion_act') then
      raise exception 'Недопустимый тип корпоративного документа' using errcode = '22023';
    end if;
    if v_side = 'seller' and v_seller_spn_id is null then
      raise exception 'Сторона продавца не представляется офисом' using errcode = '22023';
    end if;
    if v_side = 'buyer' and v_buyer_spn_id is null then
      raise exception 'Сторона покупателя не представляется офисом' using errcode = '22023';
    end if;
    if v_profile.role = 'spn'
       and not (
         (v_side = 'seller' and v_seller_spn_id = v_uid)
         or (v_side = 'buyer' and v_buyer_spn_id = v_uid)
       ) then
      raise exception 'СПН может инициализировать документы только своей стороны' using errcode = '42501';
    end if;

    v_required := case
      when v_item ? 'is_required' then (v_item ->> 'is_required')::boolean
      when v_type in ('service_agreement', 'completion_act') then true
      else false
    end;
    v_stage := coalesce(nullif(trim(v_item ->> 'required_stage'), ''), case
      when v_type = 'service_agreement' then 'before_work'
      when v_type = 'completion_act' then 'after_deal'
      else 'conditional'
    end);
    v_responsible_role := coalesce(nullif(trim(v_item ->> 'responsible_role'), ''), 'spn');
    v_assigned_to := case
      when v_item ? 'assigned_to' and nullif(v_item ->> 'assigned_to', '') is not null
        then (v_item ->> 'assigned_to')::uuid
      when v_side = 'seller' then v_seller_spn_id
      else v_buyer_spn_id
    end;
    v_due_date := case
      when v_item ? 'due_date' and nullif(v_item ->> 'due_date', '') is not null
        then (v_item ->> 'due_date')::date
      else null
    end;
    v_signing_method := coalesce(nullif(trim(v_item ->> 'signing_method'), ''), 'unknown');
    v_template_code := nullif(trim(coalesce(v_item ->> 'template_code', '')), '');
    v_template_version := nullif(trim(coalesce(v_item ->> 'template_version', '')), '');

    if v_stage not in ('before_work', 'before_deposit', 'before_deal', 'after_deal', 'conditional') then
      raise exception 'Недопустимая стадия корпоративного документа' using errcode = '22023';
    end if;
    if v_responsible_role not in ('spn', 'manager', 'owner', 'admin') then
      raise exception 'Недопустимая ответственная роль' using errcode = '22023';
    end if;
    if v_signing_method not in ('unknown', 'paper', 'online') then
      raise exception 'Недопустимый способ подписания' using errcode = '22023';
    end if;
    if v_due_date is not null and v_due_date < current_date then
      raise exception 'Срок корпоративного документа не может быть в прошлом' using errcode = '22023';
    end if;
    if char_length(coalesce(v_template_code, '')) > 120
       or char_length(coalesce(v_template_version, '')) > 120 then
      raise exception 'Код и версия шаблона не должны превышать 120 символов' using errcode = '22023';
    end if;
    if v_assigned_to is not null and not exists (
      select 1 from public.nav_user_profiles p
      where p.id = v_assigned_to and p.is_active is true and p.role::text = v_responsible_role
    ) then
      raise exception 'Ответственный сотрудник неактивен или имеет другую роль' using errcode = '22023';
    end if;
    if v_assigned_to is not null and v_responsible_role = 'spn' and not (
      (v_side = 'seller' and v_assigned_to = v_seller_spn_id)
      or (v_side = 'buyer' and v_assigned_to = v_buyer_spn_id)
    ) then
      raise exception 'Ответственный СПН должен совпадать с представителем выбранной стороны' using errcode = '22023';
    end if;
    if v_assigned_to is not null and v_responsible_role = 'manager' and v_assigned_to <> v_manager_id then
      raise exception 'Ответственный менеджер должен совпадать с менеджером сделки' using errcode = '22023';
    end if;

    select doc.id into v_existing_id
    from public.nav_deal_corporate_documents_v2 doc
    where doc.deal_id = p_deal_id
      and doc.party_side::text = v_side
      and doc.document_type = v_type
      and doc.status <> 'cancelled'
      and not (
        coalesce(doc.outcome_state, '') = 'confirmed'
        and coalesce(doc.outcome_code, '') in ('not_applicable', 'replaced', 'cancelled')
      )
    limit 1;

    if v_existing_id is not null then
      v_skipped := v_skipped || jsonb_build_array(
        nav_v2_private.nav_v2_corporate_document_json(v_existing_id)
      );
    else
      insert into public.nav_deal_corporate_documents_v2 (
        deal_id, party_side, document_type, status, is_required, required_stage,
        responsible_role, assigned_to, due_date, signing_method,
        template_code, template_version, created_by
      ) values (
        p_deal_id, v_side::public.nav_v2_side, v_type, 'planned', v_required, v_stage,
        v_responsible_role::public.nav_v2_user_role, v_assigned_to, v_due_date, v_signing_method,
        v_template_code, v_template_version, v_uid
      ) returning id into v_document_id;
      v_created := v_created || jsonb_build_array(
        nav_v2_private.nav_v2_corporate_document_json(v_document_id)
      );
    end if;

    v_existing_id := null;
    v_document_id := null;
  end loop;

  v_result := jsonb_build_object(
    'profile', jsonb_build_object('id', v_profile.id, 'full_name', v_profile.full_name, 'role', v_profile.role),
    'deal_id', p_deal_id,
    'selected_count', v_selected_count,
    'created_count', jsonb_array_length(v_created),
    'created_items', v_created,
    'skipped_existing', v_skipped,
    'event_id', v_event_id,
    'idempotent_replay', false,
    'corporate_readiness_only', true,
    'legal_readiness_changed', false,
    'deal_status_changed', false,
    'risk_gate_changed', false,
    'automatic_rows_created', false,
    'automatic_task_created', false
  );

  insert into public.nav_deal_corporate_document_events_v2 (
    id, deal_id, document_id, event_type, actor_id, actor_role,
    client_request_id, before_state, after_state, result_payload
  ) values (
    v_event_id, p_deal_id, null, 'initialize_selected', v_uid, v_profile.role,
    p_client_request_id, null,
    jsonb_build_object('created_items', v_created, 'skipped_existing', v_skipped),
    v_result
  );
  return v_result;
end;
$$;

create or replace function public.nav_v2_update_corporate_document(
  p_document_id uuid,
  p_patch jsonb,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.nav_user_profiles%rowtype;
  v_doc public.nav_deal_corporate_documents_v2%rowtype;
  v_deal public.nav_deals_v2%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_replay jsonb;
  v_unknown text[];
  v_status text;
  v_assigned_to uuid;
  v_due_date date;
  v_signing_method text;
  v_template_code text;
  v_template_version text;
  v_external_ref boolean;
  v_problem_note text;
  v_findings text[];
  v_event_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Пользователь не авторизован' using errcode = '42501'; end if;
  if p_client_request_id is null then raise exception 'client_request_id обязателен' using errcode = '22023'; end if;

  v_replay := nav_v2_private.nav_v2_corporate_replay(p_client_request_id, 'update_operational');
  if v_replay is not null then return v_replay; end if;

  if jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'p_patch должен быть непустым JSON-объектом' using errcode = '22023';
  end if;
  select coalesce(array_agg(key), '{}'::text[]) into v_unknown
  from jsonb_object_keys(p_patch) key
  where key not in (
    'status', 'assigned_to', 'due_date', 'signing_method', 'template_code',
    'template_version', 'has_external_signature_reference', 'problem_note'
  );
  if cardinality(v_unknown) > 0 then
    raise exception 'Неизвестные поля обновления: %', array_to_string(v_unknown, ', ')
      using errcode = '22023';
  end if;

  select doc.* into v_doc
  from public.nav_deal_corporate_documents_v2 doc
  where doc.id = p_document_id
  for update;
  if not found then raise exception 'Корпоративный документ не найден' using errcode = 'P0002'; end if;
  if not nav_v2_private.nav_v2_can_mutate_corporate_document(p_document_id, v_uid) then
    raise exception 'Нет прав менять корпоративный документ' using errcode = '42501';
  end if;

  select p.* into v_profile
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;
  select d.* into v_deal from public.nav_deals_v2 d where d.id = v_doc.deal_id;

  if v_doc.status in ('signed', 'cancelled')
     or nav_v2_private.nav_v2_corporate_document_is_complete(
       v_doc.status, v_doc.outcome_code, v_doc.outcome_state
     ) then
    raise exception 'Завершённый корпоративный документ нельзя изменять' using errcode = '22023';
  end if;

  v_before := nav_v2_private.nav_v2_corporate_document_json(p_document_id);
  v_status := coalesce(nullif(trim(p_patch ->> 'status'), ''), v_doc.status);
  if v_status = 'cancelled' then
    raise exception 'Для отмены используйте подтверждённый outcome' using errcode = '22023';
  end if;
  if not nav_v2_private.nav_v2_corporate_status_transition_allowed(v_doc.status, v_status) then
    raise exception 'Недопустимый переход статуса: % → %', v_doc.status, v_status using errcode = '22023';
  end if;

  v_assigned_to := case
    when p_patch ? 'assigned_to' then nullif(p_patch ->> 'assigned_to', '')::uuid
    else v_doc.assigned_to
  end;
  v_due_date := case
    when p_patch ? 'due_date' then nullif(p_patch ->> 'due_date', '')::date
    else v_doc.due_date
  end;
  v_signing_method := case
    when p_patch ? 'signing_method' then coalesce(nullif(trim(p_patch ->> 'signing_method'), ''), 'unknown')
    else v_doc.signing_method
  end;
  v_template_code := case
    when p_patch ? 'template_code' then nullif(trim(coalesce(p_patch ->> 'template_code', '')), '')
    else v_doc.template_code
  end;
  v_template_version := case
    when p_patch ? 'template_version' then nullif(trim(coalesce(p_patch ->> 'template_version', '')), '')
    else v_doc.template_version
  end;
  v_external_ref := case
    when p_patch ? 'has_external_signature_reference'
      then (p_patch ->> 'has_external_signature_reference')::boolean
    else v_doc.has_external_signature_reference
  end;
  v_problem_note := case
    when p_patch ? 'problem_note' then nullif(trim(coalesce(p_patch ->> 'problem_note', '')), '')
    else v_doc.problem_note
  end;

  if v_signing_method not in ('unknown', 'paper', 'online') then
    raise exception 'Недопустимый способ подписания' using errcode = '22023';
  end if;
  if v_due_date is not null and v_due_date < current_date then
    raise exception 'Срок корпоративного документа не может быть в прошлом' using errcode = '22023';
  end if;
  if char_length(coalesce(v_template_code, '')) > 120
     or char_length(coalesce(v_template_version, '')) > 120 then
    raise exception 'Код и версия шаблона не должны превышать 120 символов' using errcode = '22023';
  end if;
  if v_assigned_to is not null and not exists (
    select 1 from public.nav_user_profiles p
    where p.id = v_assigned_to and p.is_active is true and p.role = v_doc.responsible_role
  ) then
    raise exception 'Ответственный сотрудник неактивен или имеет другую роль' using errcode = '22023';
  end if;
  if v_assigned_to is not null and v_doc.responsible_role = 'spn'::public.nav_v2_user_role and not (
    (v_doc.party_side = 'seller'::public.nav_v2_side and v_assigned_to = v_deal.seller_spn_id)
    or (v_doc.party_side = 'buyer'::public.nav_v2_side and v_assigned_to = v_deal.buyer_spn_id)
  ) then
    raise exception 'Ответственный СПН должен совпадать с представителем стороны' using errcode = '22023';
  end if;
  if v_assigned_to is not null and v_doc.responsible_role = 'manager'::public.nav_v2_user_role
     and v_assigned_to <> v_deal.manager_id then
    raise exception 'Ответственный менеджер должен совпадать с менеджером сделки' using errcode = '22023';
  end if;

  if v_status in ('prepared', 'sent_for_signature', 'signed')
     and (v_template_code is null or v_template_version is null) then
    raise exception 'Для подготовленного документа нужны код и версия шаблона' using errcode = '22023';
  end if;
  if v_status in ('sent_for_signature', 'signed') and v_signing_method = 'unknown' then
    raise exception 'Выберите бумажное или онлайн-подписание' using errcode = '22023';
  end if;
  if v_status = 'signed' and v_external_ref is not true then
    raise exception 'Для signed требуется внешнее подтверждение подписи' using errcode = '22023';
  end if;
  if v_status = 'problem' and v_problem_note is null then
    raise exception 'Для problem укажите конкретную причину' using errcode = '22023';
  end if;

  v_findings := nav_v2_private.nav_v2_corporate_text_findings(
    concat_ws(E'\n', v_problem_note, v_template_code, v_template_version)
  );
  if cardinality(v_findings) > 0 then
    raise exception 'Удалите персональные или точные идентификаторы: %', array_to_string(v_findings, ', ')
      using errcode = '22023';
  end if;

  update public.nav_deal_corporate_documents_v2
  set status = v_status,
      assigned_to = v_assigned_to,
      due_date = v_due_date,
      signing_method = v_signing_method,
      template_code = v_template_code,
      template_version = v_template_version,
      has_external_signature_reference = v_external_ref,
      problem_note = case
        when v_status = 'problem' then v_problem_note
        when v_doc.status = 'problem' and v_status <> 'problem' then null
        else v_problem_note
      end,
      prepared_at = case when v_status = 'prepared' and v_doc.status <> 'prepared' then now() else v_doc.prepared_at end,
      sent_at = case when v_status = 'sent_for_signature' and v_doc.status <> 'sent_for_signature' then now() else v_doc.sent_at end,
      signed_at = case when v_status = 'signed' and v_doc.status <> 'signed' then now() else v_doc.signed_at end,
      updated_at = now()
  where id = p_document_id;

  v_after := nav_v2_private.nav_v2_corporate_document_json(p_document_id);
  v_result := jsonb_build_object(
    'profile', jsonb_build_object('id', v_profile.id, 'full_name', v_profile.full_name, 'role', v_profile.role),
    'deal_id', v_doc.deal_id,
    'document', v_after,
    'event_id', v_event_id,
    'idempotent_replay', false,
    'corporate_readiness_only', true,
    'legal_readiness_changed', false,
    'deal_status_changed', false,
    'risk_gate_changed', false,
    'automatic_task_created', false
  );

  insert into public.nav_deal_corporate_document_events_v2 (
    id, deal_id, document_id, event_type, actor_id, actor_role,
    client_request_id, before_state, after_state, result_payload
  ) values (
    v_event_id, v_doc.deal_id, p_document_id, 'update_operational', v_uid, v_profile.role,
    p_client_request_id, v_before, v_after, v_result
  );
  return v_result;
end;
$$;

create or replace function public.nav_v2_propose_corporate_document_outcome(
  p_document_id uuid,
  p_outcome_code text,
  p_reason text,
  p_replacement_document_id uuid,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.nav_user_profiles%rowtype;
  v_doc public.nav_deal_corporate_documents_v2%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_replay jsonb;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_findings text[];
  v_event_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Пользователь не авторизован' using errcode = '42501'; end if;
  if p_client_request_id is null then raise exception 'client_request_id обязателен' using errcode = '22023'; end if;

  v_replay := nav_v2_private.nav_v2_corporate_replay(p_client_request_id, 'propose_outcome');
  if v_replay is not null then return v_replay; end if;

  select doc.* into v_doc
  from public.nav_deal_corporate_documents_v2 doc
  where doc.id = p_document_id
  for update;
  if not found then raise exception 'Корпоративный документ не найден' using errcode = 'P0002'; end if;
  if not nav_v2_private.nav_v2_can_mutate_corporate_document(p_document_id, v_uid) then
    raise exception 'Нет прав предлагать исключение' using errcode = '42501';
  end if;

  select p.* into v_profile
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;
  if v_profile.role not in ('spn', 'manager', 'owner', 'admin') then
    raise exception 'Роль не может предлагать исключение' using errcode = '42501';
  end if;
  if v_doc.status = 'signed'
     or nav_v2_private.nav_v2_corporate_document_is_complete(
       v_doc.status, v_doc.outcome_code, v_doc.outcome_state
     ) then
    raise exception 'Для завершённого документа исключение недоступно' using errcode = '22023';
  end if;
  if p_outcome_code not in ('not_applicable', 'replaced', 'cancelled') then
    raise exception 'Недопустимый outcome' using errcode = '22023';
  end if;
  if v_reason is null or char_length(v_reason) < 10 or char_length(v_reason) > 1000 then
    raise exception 'Причина должна содержать от 10 до 1000 символов' using errcode = '22023';
  end if;
  if p_outcome_code = 'replaced' and p_replacement_document_id is null then
    raise exception 'Для replaced укажите replacement_document_id' using errcode = '22023';
  end if;
  if p_outcome_code <> 'replaced' and p_replacement_document_id is not null then
    raise exception 'replacement_document_id разрешён только для replaced' using errcode = '22023';
  end if;
  if p_replacement_document_id = p_document_id then
    raise exception 'Документ не может заменять сам себя' using errcode = '22023';
  end if;
  if p_replacement_document_id is not null and not exists (
    select 1
    from public.nav_deal_corporate_documents_v2 replacement
    where replacement.id = p_replacement_document_id and replacement.deal_id = v_doc.deal_id
  ) then
    raise exception 'Замещающий документ должен относиться к той же сделке' using errcode = '22023';
  end if;

  v_findings := nav_v2_private.nav_v2_corporate_text_findings(v_reason);
  if cardinality(v_findings) > 0 then
    raise exception 'Удалите персональные или точные идентификаторы: %', array_to_string(v_findings, ', ')
      using errcode = '22023';
  end if;

  v_before := nav_v2_private.nav_v2_corporate_document_json(p_document_id);
  update public.nav_deal_corporate_documents_v2
  set outcome_code = p_outcome_code,
      outcome_state = 'proposed',
      outcome_reason = v_reason,
      outcome_proposed_by = v_uid,
      outcome_proposed_at = now(),
      outcome_decided_by = null,
      outcome_decided_at = null,
      replacement_document_id = p_replacement_document_id,
      updated_at = now()
  where id = p_document_id;

  v_after := nav_v2_private.nav_v2_corporate_document_json(p_document_id);
  v_result := jsonb_build_object(
    'profile', jsonb_build_object('id', v_profile.id, 'full_name', v_profile.full_name, 'role', v_profile.role),
    'deal_id', v_doc.deal_id,
    'document', v_after,
    'event_id', v_event_id,
    'idempotent_replay', false,
    'requires_confirmation', true,
    'is_complete', false,
    'corporate_readiness_only', true,
    'legal_readiness_changed', false,
    'deal_status_changed', false,
    'risk_gate_changed', false,
    'automatic_task_created', false
  );

  insert into public.nav_deal_corporate_document_events_v2 (
    id, deal_id, document_id, event_type, actor_id, actor_role,
    client_request_id, before_state, after_state, result_payload
  ) values (
    v_event_id, v_doc.deal_id, p_document_id, 'propose_outcome', v_uid, v_profile.role,
    p_client_request_id, v_before, v_after, v_result
  );
  return v_result;
end;
$$;

create or replace function public.nav_v2_decide_corporate_document_outcome(
  p_document_id uuid,
  p_decision text,
  p_note text,
  p_client_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.nav_user_profiles%rowtype;
  v_doc public.nav_deal_corporate_documents_v2%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_replay jsonb;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_findings text[];
  v_event_id uuid := gen_random_uuid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Пользователь не авторизован' using errcode = '42501'; end if;
  if p_client_request_id is null then raise exception 'client_request_id обязателен' using errcode = '22023'; end if;

  v_replay := nav_v2_private.nav_v2_corporate_replay(p_client_request_id, 'decide_outcome');
  if v_replay is not null then return v_replay; end if;

  select doc.* into v_doc
  from public.nav_deal_corporate_documents_v2 doc
  where doc.id = p_document_id
  for update;
  if not found then raise exception 'Корпоративный документ не найден' using errcode = 'P0002'; end if;

  select p.* into v_profile
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;
  if not found or v_profile.role not in ('manager', 'owner', 'admin') then
    raise exception 'Только менеджер, owner или admin подтверждает исключение' using errcode = '42501';
  end if;
  if not nav_v2_private.nav_v2_can_edit_deal(v_doc.deal_id, v_uid) then
    raise exception 'Нет доступа к сделке' using errcode = '42501';
  end if;
  if p_decision not in ('confirmed', 'rejected') then
    raise exception 'Решение должно быть confirmed или rejected' using errcode = '22023';
  end if;
  if v_doc.outcome_state <> 'proposed' then
    raise exception 'Нет предложенного outcome для решения' using errcode = '22023';
  end if;
  if v_note is not null and (char_length(v_note) < 5 or char_length(v_note) > 1000) then
    raise exception 'Комментарий решения должен содержать от 5 до 1000 символов' using errcode = '22023';
  end if;

  v_findings := nav_v2_private.nav_v2_corporate_text_findings(v_note);
  if cardinality(v_findings) > 0 then
    raise exception 'Удалите персональные или точные идентификаторы: %', array_to_string(v_findings, ', ')
      using errcode = '22023';
  end if;

  v_before := nav_v2_private.nav_v2_corporate_document_json(p_document_id);
  update public.nav_deal_corporate_documents_v2
  set outcome_state = p_decision,
      outcome_decided_by = v_uid,
      outcome_decided_at = now(),
      updated_at = now()
  where id = p_document_id;

  v_after := nav_v2_private.nav_v2_corporate_document_json(p_document_id);
  v_result := jsonb_build_object(
    'profile', jsonb_build_object('id', v_profile.id, 'full_name', v_profile.full_name, 'role', v_profile.role),
    'deal_id', v_doc.deal_id,
    'document', v_after,
    'decision_note', v_note,
    'event_id', v_event_id,
    'idempotent_replay', false,
    'is_complete', nav_v2_private.nav_v2_corporate_document_is_complete(
      v_doc.status, v_doc.outcome_code, p_decision
    ),
    'corporate_readiness_only', true,
    'legal_readiness_changed', false,
    'deal_status_changed', false,
    'risk_gate_changed', false,
    'automatic_task_created', false
  );

  insert into public.nav_deal_corporate_document_events_v2 (
    id, deal_id, document_id, event_type, actor_id, actor_role,
    client_request_id, before_state, after_state, result_payload
  ) values (
    v_event_id, v_doc.deal_id, p_document_id, 'decide_outcome', v_uid, v_profile.role,
    p_client_request_id, v_before,
    v_after || jsonb_build_object('decision_note', v_note),
    v_result
  );
  return v_result;
end;
$$;

revoke execute on function nav_v2_private.nav_v2_corporate_text_findings(text)
  from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_corporate_document_json(uuid)
  from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_corporate_replay(uuid, text)
  from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_corporate_status_transition_allowed(text, text)
  from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_can_mutate_corporate_document(uuid, uuid)
  from public, anon, authenticated;

revoke execute on function public.nav_v2_initialize_corporate_documents(uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.nav_v2_update_corporate_document(uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.nav_v2_propose_corporate_document_outcome(uuid, text, text, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.nav_v2_decide_corporate_document_outcome(uuid, text, text, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.nav_v2_initialize_corporate_documents(uuid, jsonb, uuid)
  to service_role;
grant execute on function public.nav_v2_update_corporate_document(uuid, jsonb, uuid)
  to service_role;
grant execute on function public.nav_v2_propose_corporate_document_outcome(uuid, text, text, uuid, uuid)
  to service_role;
grant execute on function public.nav_v2_decide_corporate_document_outcome(uuid, text, text, uuid)
  to service_role;

-- Explicit separation guarantees:
-- no mutation of public.nav_deal_documents_v2;
-- no mutation of public.nav_deal_tasks_v2;
-- no mutation of public.nav_deal_risks_v2;
-- no mutation of public.nav_deals_v2 status or legal readiness;
-- no automatic corporate document rows: initialization requires explicit p_items;
-- no authenticated EXECUTE until a separate deployment migration.
