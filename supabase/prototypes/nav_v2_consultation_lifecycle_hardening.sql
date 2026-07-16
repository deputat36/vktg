-- REPOSITORY-ONLY HARDENING OVERLAY.
-- Apply after supabase/prototypes/nav_v2_consultation_lifecycle.sql in isolated tests only.
-- Do not apply either file to production until authenticated role/mutation E2E and deploy review.

alter table public.nav_consultations_v2
  add column if not exists client_request_id uuid,
  add column if not exists conversion_mode text;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'nav_consultation_conversion_mode_check'
      and conrelid = 'public.nav_consultations_v2'::regclass
  ) then
    alter table public.nav_consultations_v2
      add constraint nav_consultation_conversion_mode_check
      check (conversion_mode is null or conversion_mode in ('deposit', 'deal'));
  end if;
end;
$constraints$;

create unique index if not exists nav_consultations_creator_request_unique_idx
  on public.nav_consultations_v2(created_by, client_request_id)
  where client_request_id is not null;

create or replace function nav_v2_private.nav_v2_consultation_text_findings(p_text text)
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
    case when coalesce(p_text, '') ~ '\m[0-9]{2}:[0-9]{2}:[0-9]{5,9}:[0-9]+\M' then 'cadastral_number' end,
    case when coalesce(p_text, '') ~* '(^|[^[:alpha:][:digit:]])(кв(?:артира)?|комн(?:ата)?|офис|пом(?:ещение)?|апарт(?:аменты)?)[[:space:]]*[№#\-]?[[:space:]]*[0-9]+[а-яa-z]?($|[^[:alpha:][:digit:]])' then 'unit_number' end,
    case when coalesce(p_text, '') ~ '(^|[^[:alpha:]])[А-ЯЁ][а-яё]{2,}[[:space:]]+[А-ЯЁ][а-яё]{2,}([[:space:]]+[А-ЯЁ][а-яё]{2,})?($|[^[:alpha:]])' then 'possible_full_name' end,
    case when regexp_replace(coalesce(p_text, ''), '[^0-9]', '', 'g') ~ '[0-9]{16,19}' then 'long_payment_number' end
  ]::text[], null);
$$;

create or replace function nav_v2_private.nav_v2_can_view_consultation(
  p_consultation_id uuid,
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
    from public.nav_consultations_v2 c
    join public.nav_user_profiles caller
      on caller.id = p_uid
     and caller.is_active is true
    left join public.nav_user_profiles requester
      on requester.id = c.created_by
    where c.id = p_consultation_id
      and (
        caller.role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role)
        or c.created_by = p_uid
        or (
          caller.role = 'lawyer'::public.nav_v2_user_role
          and (
            c.assigned_lawyer_id = p_uid
            or (
              c.assigned_lawyer_id is null
              and c.status in ('new', 'need_info')
            )
          )
        )
        or (
          caller.role = 'manager'::public.nav_v2_user_role
          and (c.manager_id = p_uid or requester.manager_id = p_uid)
        )
      )
  );
$$;

create or replace function nav_v2_private.nav_v2_consultation_conversion_draft(
  p_consultation_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'consultation_id', c.id,
    'preparation_mode', c.conversion_mode,
    'representation_model', c.representation_model,
    'object_type', c.object_type,
    'safe_reference', c.safe_reference,
    'funding_sources', to_jsonb(c.funding_sources),
    'circumstances', to_jsonb(c.circumstances),
    'planned_event_date', c.planned_event_date,
    'has_external_documents', c.has_external_documents,
    'creates_deal', false,
    'creates_backlog', false
  )
  from public.nav_consultations_v2 c
  where c.id = p_consultation_id
    and c.response_decision = 'convert_to_preparation'
    and c.conversion_mode in ('deposit', 'deal');
$$;

create or replace function public.nav_v2_create_consultation(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.nav_user_profiles%rowtype;
  v_client_request_id uuid;
  v_question text;
  v_safe_reference text;
  v_request_type text;
  v_representation text;
  v_object_type text;
  v_stage text;
  v_funding text[] := '{}'::text[];
  v_circumstances text[] := '{}'::text[];
  v_planned_event_date date;
  v_has_external_documents boolean := false;
  v_findings text[];
  v_unknown_keys text[];
  v_id uuid;
  v_created_at timestamptz;
  v_existing public.nav_consultations_v2%rowtype;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Consultation payload должен быть JSON-объектом' using errcode = '22023';
  end if;

  select p.* into v_profile
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;

  if not found or v_profile.role not in ('spn', 'manager', 'lawyer', 'owner', 'admin') then
    raise exception 'Нет прав создавать юридическую консультацию' using errcode = '42501';
  end if;

  select array_agg(key order by key)
  into v_unknown_keys
  from jsonb_object_keys(p_payload) key
  where key not in (
    'client_request_id', 'question', 'safe_reference', 'request_type',
    'representation_model', 'object_type', 'stage', 'funding_sources',
    'circumstances', 'planned_event_date', 'has_external_documents'
  );
  if coalesce(array_length(v_unknown_keys, 1), 0) > 0 then
    raise exception 'Payload содержит недопустимые поля: %', array_to_string(v_unknown_keys, ', ')
      using errcode = '22023';
  end if;

  begin
    v_client_request_id := nullif(p_payload ->> 'client_request_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'client_request_id должен быть UUID' using errcode = '22023';
  end;
  if v_client_request_id is null then
    raise exception 'client_request_id обязателен для защиты от повторного создания' using errcode = '22023';
  end if;

  v_question := nullif(trim(coalesce(p_payload ->> 'question', '')), '');
  v_safe_reference := nullif(trim(coalesce(p_payload ->> 'safe_reference', '')), '');
  v_request_type := coalesce(nullif(trim(p_payload ->> 'request_type'), ''), 'legal_answer');
  v_representation := coalesce(nullif(trim(p_payload ->> 'representation_model'), ''), 'unknown');
  v_object_type := nullif(trim(coalesce(p_payload ->> 'object_type', '')), '');
  v_stage := coalesce(nullif(trim(p_payload ->> 'stage'), ''), 'question');

  if p_payload ? 'funding_sources' and jsonb_typeof(p_payload -> 'funding_sources') <> 'array' then
    raise exception 'funding_sources должен быть массивом' using errcode = '22023';
  end if;
  if p_payload ? 'circumstances' and jsonb_typeof(p_payload -> 'circumstances') <> 'array' then
    raise exception 'circumstances должен быть массивом' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct value order by value), '{}'::text[])
    into v_funding
  from jsonb_array_elements_text(coalesce(p_payload -> 'funding_sources', '[]'::jsonb)) value;

  select coalesce(array_agg(distinct value order by value), '{}'::text[])
    into v_circumstances
  from jsonb_array_elements_text(coalesce(p_payload -> 'circumstances', '[]'::jsonb)) value;

  begin
    v_planned_event_date := nullif(p_payload ->> 'planned_event_date', '')::date;
  exception when invalid_datetime_format then
    raise exception 'planned_event_date должна быть датой YYYY-MM-DD' using errcode = '22023';
  end;

  begin
    v_has_external_documents := coalesce((p_payload ->> 'has_external_documents')::boolean, false);
  exception when invalid_text_representation then
    raise exception 'has_external_documents должен быть boolean' using errcode = '22023';
  end;

  if v_question is null or char_length(v_question) < 20 or char_length(v_question) > 4000 then
    raise exception 'Сформулируйте вопрос длиной от 20 до 4000 символов';
  end if;
  if v_request_type not in ('legal_answer', 'deposit_precheck', 'deal_precheck', 'document_check', 'contract_question', 'other') then
    raise exception 'Недопустимый тип консультации';
  end if;
  if v_representation not in ('seller', 'buyer', 'one_spn_both', 'both', 'partner_agency', 'external_party', 'unknown') then
    raise exception 'Недопустимая модель представительства';
  end if;
  if v_stage not in ('question', 'deposit_soon', 'deal_soon', 'documents', 'registration', 'unknown') then
    raise exception 'Недопустимая стадия';
  end if;
  if cardinality(v_funding) > 7 or not (v_funding <@ array[
    'cash', 'mortgage', 'military_mortgage', 'matcap', 'certificate', 'installment', 'other'
  ]::text[]) then
    raise exception 'Недопустимый источник средств';
  end if;
  if cardinality(v_circumstances) > 10 or not (v_circumstances <@ array[
    'children', 'child_money', 'shares', 'power_of_attorney', 'inheritance',
    'privatization', 'court', 'notary', 'after_registration', 'other'
  ]::text[]) then
    raise exception 'Недопустимое особое обстоятельство';
  end if;
  if v_safe_reference is not null and char_length(v_safe_reference) not between 3 and 160 then
    raise exception 'Безопасный ориентир должен содержать от 3 до 160 символов';
  end if;

  v_findings := nav_v2_private.nav_v2_consultation_text_findings(
    concat_ws(E'\n', v_question, v_safe_reference)
  );
  if cardinality(v_findings) > 0 then
    raise exception 'Удалите персональные или точные идентификаторы: %', array_to_string(v_findings, ', ')
      using errcode = '22023';
  end if;

  insert into public.nav_consultations_v2 (
    client_request_id,
    created_by,
    requester_role,
    manager_id,
    status,
    request_type,
    representation_model,
    object_type,
    safe_reference,
    stage,
    funding_sources,
    circumstances,
    planned_event_date,
    has_external_documents
  ) values (
    v_client_request_id,
    v_uid,
    v_profile.role,
    case
      when v_profile.role = 'spn' then v_profile.manager_id
      when v_profile.role = 'manager' then v_uid
      else null
    end,
    'new',
    v_request_type,
    v_representation,
    v_object_type,
    v_safe_reference,
    v_stage,
    v_funding,
    v_circumstances,
    v_planned_event_date,
    v_has_external_documents
  )
  on conflict (created_by, client_request_id) where client_request_id is not null do nothing
  returning id, created_at into v_id, v_created_at;

  if v_id is null then
    select c.* into v_existing
    from public.nav_consultations_v2 c
    where c.created_by = v_uid
      and c.client_request_id = v_client_request_id
    limit 1;

    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'consultation_id', v_existing.id,
      'status', v_existing.status,
      'created_at', v_existing.created_at,
      'route', jsonb_build_object(
        'lawyer', true,
        'broker_parallel', v_existing.funding_sources && array['mortgage', 'military_mortgage']::text[],
        'broker_scope', case
          when v_existing.funding_sources && array['mortgage', 'military_mortgage']::text[]
            then 'Ипотечная консультация, программа и одобрение'
          else null
        end
      )
    );
  end if;

  insert into public.nav_consultation_messages_v2 (
    consultation_id, author_id, author_role, message_type, body
  ) values (
    v_id, v_uid, v_profile.role, 'question', v_question
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'consultation_id', v_id,
    'status', 'new',
    'created_at', v_created_at,
    'route', jsonb_build_object(
      'lawyer', true,
      'broker_parallel', v_funding && array['mortgage', 'military_mortgage']::text[],
      'broker_scope', case
        when v_funding && array['mortgage', 'military_mortgage']::text[]
          then 'Ипотечная консультация, программа и одобрение'
        else null
      end
    ),
    'next_action', 'Ожидать ответ юриста или запрос уточнения'
  );
end;
$$;

create or replace function public.nav_v2_get_consultation_queue(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_profile jsonb;
  v_items jsonb;
  v_summary jsonb;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  select p.role,
         jsonb_build_object('id', p.id, 'full_name', p.full_name, 'role', p.role)
    into v_role, v_profile
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;

  if v_role not in ('spn', 'lawyer', 'manager', 'owner', 'admin') then
    raise exception 'Список консультаций недоступен для этой роли' using errcode = '42501';
  end if;

  with visible as (
    select c.*
    from public.nav_consultations_v2 c
    left join public.nav_user_profiles requester on requester.id = c.created_by
    where c.status not in ('closed', 'cancelled')
      and (
        v_role in ('owner', 'admin')
        or (v_role = 'spn' and c.created_by = v_uid)
        or (
          v_role = 'lawyer'
          and (
            c.assigned_lawyer_id = v_uid
            or (c.assigned_lawyer_id is null and c.status in ('new', 'need_info'))
          )
        )
        or (v_role = 'manager' and (c.manager_id = v_uid or requester.manager_id = v_uid))
      )
    order by
      case
        when c.status = 'new' and c.planned_event_date is not null and c.planned_event_date <= current_date + 2 then 0
        when c.status = 'new' then 1
        when c.status = 'need_info' then 2
        else 3
      end,
      c.updated_at asc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  ), message_counts as (
    select m.consultation_id,
           count(*)::int as message_count,
           max(m.created_at) as latest_message_at
    from public.nav_consultation_messages_v2 m
    where m.consultation_id in (select id from visible)
    group by m.consultation_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'reference', 'Консультация ' || upper(left(replace(c.id::text, '-', ''), 8)),
    'status', c.status,
    'request_type', c.request_type,
    'representation_model', c.representation_model,
    'object_type', c.object_type,
    'stage', c.stage,
    'funding_sources', to_jsonb(c.funding_sources),
    'circumstances_count', cardinality(c.circumstances),
    'planned_event_date', c.planned_event_date,
    'has_external_documents', c.has_external_documents,
    'requester_name', requester.full_name,
    'requester_role', c.requester_role,
    'assigned_lawyer_name', lawyer.full_name,
    'message_count', coalesce(mc.message_count, 0),
    'latest_message_at', coalesce(mc.latest_message_at, c.created_at),
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'age_hours', greatest(0, floor(extract(epoch from (now() - c.created_at)) / 3600))::int,
    'priority_code', case
      when c.status = 'need_info' then 'waiting_requester'
      when c.planned_event_date is not null and c.planned_event_date <= current_date then 'urgent'
      when c.planned_event_date is not null and c.planned_event_date <= current_date + 2 then 'high'
      else 'normal'
    end,
    'actionable_for_lawyer', v_role in ('lawyer', 'owner', 'admin') and c.status = 'new',
    'next_action', case c.status
      when 'new' then case
        when v_role = 'spn' then 'Ожидать ответ юриста или запрос уточнения'
        else 'Ответить, запросить уточнение или рекомендовать полную подготовку'
      end
      when 'need_info' then case
        when v_role = 'spn' then 'Ответить на уточнение юриста'
        else 'Ожидается уточнение от СПН'
      end
      when 'answered' then 'Закрыть запрос после ознакомления с ответом'
      when 'convert_to_preparation' then 'Запустить полный мастер подготовки'
      else 'Проверить состояние консультации'
    end
  ) order by
    case
      when c.status = 'new' and c.planned_event_date is not null and c.planned_event_date <= current_date + 2 then 0
      when c.status = 'new' then 1
      when c.status = 'need_info' then 2
      else 3
    end,
    c.updated_at asc), '[]'::jsonb)
  into v_items
  from visible c
  left join message_counts mc on mc.consultation_id = c.id
  left join public.nav_user_profiles requester on requester.id = c.created_by
  left join public.nav_user_profiles lawyer on lawyer.id = c.assigned_lawyer_id;

  with items as (
    select value as item from jsonb_array_elements(v_items)
  )
  select jsonb_build_object(
    'total', count(*)::int,
    'new_count', count(*) filter (where item ->> 'status' = 'new')::int,
    'need_info_count', count(*) filter (where item ->> 'status' = 'need_info')::int,
    'urgent_high_count', count(*) filter (where item ->> 'priority_code' in ('urgent', 'high'))::int,
    'actionable_count', count(*) filter (where coalesce((item ->> 'actionable_for_lawyer')::boolean, false))::int
  ) into v_summary
  from items;

  return jsonb_build_object(
    'profile', v_profile,
    'summary', v_summary,
    'items', v_items
  );
end;
$$;

-- Replace the three-argument prototype. Conversion must explicitly choose deposit or deal.
revoke execute on function public.nav_v2_decide_consultation(uuid, text, text) from public, anon, authenticated, service_role;
drop function if exists public.nav_v2_decide_consultation(uuid, text, text);

create or replace function public.nav_v2_decide_consultation(
  p_consultation_id uuid,
  p_decision text,
  p_body text,
  p_conversion_mode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_consultation public.nav_consultations_v2%rowtype;
  v_body text := nullif(trim(coalesce(p_body, '')), '');
  v_status text;
  v_message_type text;
  v_findings text[];
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if p_decision not in ('answer', 'need_info', 'convert_to_preparation') then
    raise exception 'Недопустимое решение по консультации';
  end if;
  if p_decision = 'convert_to_preparation' and p_conversion_mode not in ('deposit', 'deal') then
    raise exception 'Для полной подготовки выберите deposit или deal';
  end if;
  if p_decision <> 'convert_to_preparation' and p_conversion_mode is not null then
    raise exception 'conversion_mode разрешён только для convert_to_preparation';
  end if;
  if v_body is null or char_length(v_body) < 10 or char_length(v_body) > 4000 then
    raise exception 'Для решения нужен текст длиной от 10 до 4000 символов';
  end if;

  v_findings := nav_v2_private.nav_v2_consultation_text_findings(v_body);
  if cardinality(v_findings) > 0 then
    raise exception 'Удалите персональные или точные идентификаторы: %', array_to_string(v_findings, ', ')
      using errcode = '22023';
  end if;

  select c.* into v_consultation
  from public.nav_consultations_v2 c
  where c.id = p_consultation_id
  for update;

  if not found then
    raise exception 'Консультация не найдена' using errcode = 'P0002';
  end if;
  if v_consultation.status <> 'new' then
    raise exception 'Решение доступно только для нового или повторно уточнённого запроса';
  end if;
  if not nav_v2_private.nav_v2_can_decide_consultation(p_consultation_id, v_uid) then
    raise exception 'Нет прав принимать юридическое решение' using errcode = '42501';
  end if;

  select p.role into v_role
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;

  v_status := case p_decision
    when 'answer' then 'answered'
    when 'need_info' then 'need_info'
    else 'convert_to_preparation'
  end;
  v_message_type := case p_decision
    when 'answer' then 'answer'
    when 'need_info' then 'clarification_request'
    else 'conversion_recommendation'
  end;

  update public.nav_consultations_v2
  set status = v_status,
      assigned_lawyer_id = case
        when assigned_lawyer_id is null and v_role = 'lawyer' then v_uid
        else assigned_lawyer_id
      end,
      response_decision = p_decision,
      conversion_mode = case when p_decision = 'convert_to_preparation' then p_conversion_mode else null end,
      response_by = v_uid,
      response_at = now(),
      last_message_at = now(),
      updated_at = now()
  where id = p_consultation_id;

  insert into public.nav_consultation_messages_v2 (
    consultation_id, author_id, author_role, message_type, body
  ) values (
    p_consultation_id, v_uid, v_role, v_message_type, v_body
  );

  return jsonb_build_object(
    'ok', true,
    'consultation_id', p_consultation_id,
    'status', v_status,
    'decision', p_decision,
    'conversion_mode', case when p_decision = 'convert_to_preparation' then p_conversion_mode else null end,
    'conversion_draft', case
      when p_decision = 'convert_to_preparation'
        then nav_v2_private.nav_v2_consultation_conversion_draft(p_consultation_id)
      else null
    end,
    'deal_created', false,
    'backlog_created', false
  );
end;
$$;

-- Repository-only ACL hardening. API roles remain unable to call prototype RPCs.
revoke execute on function nav_v2_private.nav_v2_consultation_text_findings(text) from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_can_view_consultation(uuid, uuid) from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_can_decide_consultation(uuid, uuid) from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_consultation_conversion_draft(uuid) from public, anon, authenticated;

revoke execute on function public.nav_v2_create_consultation(jsonb) from public, anon, authenticated;
revoke execute on function public.nav_v2_get_consultation_queue(integer) from public, anon, authenticated;
revoke execute on function public.nav_v2_get_consultation(uuid) from public, anon, authenticated;
revoke execute on function public.nav_v2_decide_consultation(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.nav_v2_add_consultation_clarification(uuid, text) from public, anon, authenticated;
revoke execute on function public.nav_v2_close_consultation(uuid, text, text) from public, anon, authenticated;

grant execute on function public.nav_v2_create_consultation(jsonb) to service_role;
grant execute on function public.nav_v2_get_consultation_queue(integer) to service_role;
grant execute on function public.nav_v2_get_consultation(uuid) to service_role;
grant execute on function public.nav_v2_decide_consultation(uuid, text, text, text) to service_role;
grant execute on function public.nav_v2_add_consultation_clarification(uuid, text) to service_role;
grant execute on function public.nav_v2_close_consultation(uuid, text, text) to service_role;

-- Effective prototype after base + overlay:
-- authenticated has no EXECUTE until a separate deploy migration grants reviewed RPCs.
-- SPN can list only own active consultations.
-- An unassigned lawyer cannot open historical answered/closed/cancelled consultations.
-- client_request_id makes create idempotent.
-- convert_to_preparation requires explicit deposit/deal mode.
