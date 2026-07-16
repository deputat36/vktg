-- REPOSITORY-ONLY PROTOTYPE.
-- Do not apply to production without authenticated role/mutation regression on isolated synthetic data.
-- This creates a lightweight legal-consultation contour without creating a deal, task, risk or document backlog.

create table if not exists public.nav_consultations_v2 (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  requester_role public.nav_v2_user_role not null,
  manager_id uuid references auth.users(id) on delete set null,
  assigned_lawyer_id uuid references auth.users(id) on delete set null,
  status text not null default 'new',
  request_type text not null default 'legal_answer',
  representation_model text not null default 'unknown',
  object_type text,
  safe_reference text,
  stage text not null default 'question',
  funding_sources text[] not null default '{}'::text[],
  circumstances text[] not null default '{}'::text[],
  planned_event_date date,
  has_external_documents boolean not null default false,
  response_decision text,
  response_by uuid references auth.users(id) on delete set null,
  response_at timestamptz,
  closed_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nav_consultation_status_check check (
    status in ('new', 'need_info', 'answered', 'convert_to_preparation', 'closed', 'cancelled')
  ),
  constraint nav_consultation_request_type_check check (
    request_type in ('legal_answer', 'deposit_precheck', 'deal_precheck', 'document_check', 'contract_question', 'other')
  ),
  constraint nav_consultation_representation_check check (
    representation_model in ('seller', 'buyer', 'one_spn_both', 'both', 'partner_agency', 'external_party', 'unknown')
  ),
  constraint nav_consultation_stage_check check (
    stage in ('question', 'deposit_soon', 'deal_soon', 'documents', 'registration', 'unknown')
  ),
  constraint nav_consultation_funding_check check (
    cardinality(funding_sources) <= 7
    and funding_sources <@ array[
      'cash', 'mortgage', 'military_mortgage', 'matcap', 'certificate', 'installment', 'other'
    ]::text[]
  ),
  constraint nav_consultation_circumstances_check check (
    cardinality(circumstances) <= 10
    and circumstances <@ array[
      'children', 'child_money', 'shares', 'power_of_attorney', 'inheritance',
      'privatization', 'court', 'notary', 'after_registration', 'other'
    ]::text[]
  ),
  constraint nav_consultation_safe_reference_check check (
    safe_reference is null or char_length(trim(safe_reference)) between 3 and 160
  ),
  constraint nav_consultation_response_decision_check check (
    response_decision is null or response_decision in ('answer', 'need_info', 'convert_to_preparation')
  )
);

create table if not exists public.nav_consultation_messages_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.nav_consultations_v2(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_role public.nav_v2_user_role not null,
  message_type text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint nav_consultation_message_type_check check (
    message_type in (
      'question', 'clarification_request', 'clarification', 'answer',
      'conversion_recommendation', 'closure_note'
    )
  ),
  constraint nav_consultation_message_body_check check (
    char_length(trim(body)) between 5 and 4000
  )
);

alter table public.nav_consultations_v2 enable row level security;
alter table public.nav_consultation_messages_v2 enable row level security;

revoke all on table public.nav_consultations_v2 from public, anon, authenticated;
revoke all on table public.nav_consultation_messages_v2 from public, anon, authenticated;
grant all on table public.nav_consultations_v2 to service_role;
grant all on table public.nav_consultation_messages_v2 to service_role;

create index if not exists nav_consultations_status_updated_idx
  on public.nav_consultations_v2(status, updated_at desc);
create index if not exists nav_consultations_lawyer_status_idx
  on public.nav_consultations_v2(assigned_lawyer_id, status, updated_at desc);
create index if not exists nav_consultations_creator_updated_idx
  on public.nav_consultations_v2(created_by, updated_at desc);
create index if not exists nav_consultations_manager_status_idx
  on public.nav_consultations_v2(manager_id, status, updated_at desc);
create index if not exists nav_consultation_messages_consultation_created_idx
  on public.nav_consultation_messages_v2(consultation_id, created_at);

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
    case when coalesce(p_text, '') ~ '\m[0-9]{2}:[0-9]{2}:[0-9]{6,7}:[0-9]+\M' then 'cadastral_number' end,
    case when coalesce(p_text, '') ~* '(кв(?:артира)?|комн(?:ата)?|офис|пом(?:ещение)?)[[:space:]]*№?[[:space:]]*[0-9]+' then 'unit_number' end,
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
          and (c.assigned_lawyer_id is null or c.assigned_lawyer_id = p_uid)
        )
        or (
          caller.role = 'manager'::public.nav_v2_user_role
          and (c.manager_id = p_uid or requester.manager_id = p_uid)
        )
      )
  );
$$;

create or replace function nav_v2_private.nav_v2_can_decide_consultation(
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
    where c.id = p_consultation_id
      and (
        caller.role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role)
        or (
          caller.role = 'lawyer'::public.nav_v2_user_role
          and (c.assigned_lawyer_id is null or c.assigned_lawyer_id = p_uid)
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
    'preparation_mode', case
      when c.request_type = 'deposit_precheck' or c.stage = 'deposit_soon' then 'deposit'
      when c.request_type = 'deal_precheck' or c.stage in ('deal_soon', 'registration') then 'deal'
      else 'unknown'
    end,
    'representation_model', c.representation_model,
    'object_type', c.object_type,
    'safe_reference', c.safe_reference,
    'funding_sources', to_jsonb(c.funding_sources),
    'circumstances', to_jsonb(c.circumstances),
    'planned_event_date', c.planned_event_date,
    'has_external_documents', c.has_external_documents
  )
  from public.nav_consultations_v2 c
  where c.id = p_consultation_id;
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
  v_question text := nullif(trim(coalesce(p_payload ->> 'question', '')), '');
  v_safe_reference text := nullif(trim(coalesce(p_payload ->> 'safe_reference', '')), '');
  v_request_type text := coalesce(nullif(trim(p_payload ->> 'request_type'), ''), 'legal_answer');
  v_representation text := coalesce(nullif(trim(p_payload ->> 'representation_model'), ''), 'unknown');
  v_object_type text := nullif(trim(coalesce(p_payload ->> 'object_type', '')), '');
  v_stage text := coalesce(nullif(trim(p_payload ->> 'stage'), ''), 'question');
  v_funding text[] := '{}'::text[];
  v_circumstances text[] := '{}'::text[];
  v_findings text[];
  v_id uuid;
  v_created_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  select p.* into v_profile
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;

  if not found or v_profile.role not in ('spn', 'manager', 'lawyer', 'owner', 'admin') then
    raise exception 'Нет прав создавать юридическую консультацию' using errcode = '42501';
  end if;

  if p_payload ?| array[
    'client_name', 'seller_name', 'buyer_name', 'phone', 'seller_phone', 'buyer_phone',
    'email', 'passport', 'snils', 'cadastral_number', 'address', 'unit_number'
  ] then
    raise exception 'Не передавайте клиентские идентификаторы в консультацию' using errcode = '22023';
  end if;

  if v_question is null or char_length(v_question) < 20 or char_length(v_question) > 4000 then
    raise exception 'Сформулируйте вопрос длиной от 20 до 4000 символов';
  end if;

  select coalesce(array_agg(value), '{}'::text[])
    into v_funding
  from jsonb_array_elements_text(coalesce(p_payload -> 'funding_sources', '[]'::jsonb)) value;

  select coalesce(array_agg(value), '{}'::text[])
    into v_circumstances
  from jsonb_array_elements_text(coalesce(p_payload -> 'circumstances', '[]'::jsonb)) value;

  if not (v_funding <@ array[
    'cash', 'mortgage', 'military_mortgage', 'matcap', 'certificate', 'installment', 'other'
  ]::text[]) then
    raise exception 'Недопустимый источник средств';
  end if;

  if not (v_circumstances <@ array[
    'children', 'child_money', 'shares', 'power_of_attorney', 'inheritance',
    'privatization', 'court', 'notary', 'after_registration', 'other'
  ]::text[]) then
    raise exception 'Недопустимое особое обстоятельство';
  end if;

  v_findings := nav_v2_private.nav_v2_consultation_text_findings(
    concat_ws(E'\n', v_question, v_safe_reference)
  );
  if cardinality(v_findings) > 0 then
    raise exception 'Удалите персональные или точные идентификаторы: %', array_to_string(v_findings, ', ')
      using errcode = '22023';
  end if;

  insert into public.nav_consultations_v2 (
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
    nullif(p_payload ->> 'planned_event_date', '')::date,
    coalesce((p_payload ->> 'has_external_documents')::boolean, false)
  ) returning id, created_at into v_id, v_created_at;

  insert into public.nav_consultation_messages_v2 (
    consultation_id, author_id, author_role, message_type, body
  ) values (
    v_id, v_uid, v_profile.role, 'question', v_question
  );

  return jsonb_build_object(
    'ok', true,
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

  if v_role not in ('lawyer', 'manager', 'owner', 'admin') then
    raise exception 'Очередь консультаций недоступна для этой роли' using errcode = '42501';
  end if;

  with visible as (
    select c.*
    from public.nav_consultations_v2 c
    left join public.nav_user_profiles requester on requester.id = c.created_by
    where c.status not in ('closed', 'cancelled')
      and (
        v_role in ('owner', 'admin')
        or (v_role = 'lawyer' and (c.assigned_lawyer_id is null or c.assigned_lawyer_id = v_uid))
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
      when 'new' then 'Ответить, запросить уточнение или рекомендовать полную подготовку'
      when 'need_info' then 'Ожидается уточнение от СПН'
      when 'answered' then 'Ожидается закрытие запроса инициатором'
      when 'convert_to_preparation' then 'Ожидается запуск полного мастера'
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

create or replace function public.nav_v2_get_consultation(p_consultation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if not nav_v2_private.nav_v2_can_view_consultation(p_consultation_id, v_uid) then
    raise exception 'Нет доступа к консультации' using errcode = '42501';
  end if;

  select p.role into v_role
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;

  select jsonb_build_object(
    'profile', jsonb_build_object('id', caller.id, 'full_name', caller.full_name, 'role', caller.role),
    'consultation', jsonb_build_object(
      'id', c.id,
      'reference', 'Консультация ' || upper(left(replace(c.id::text, '-', ''), 8)),
      'status', c.status,
      'request_type', c.request_type,
      'representation_model', c.representation_model,
      'object_type', c.object_type,
      'safe_reference', c.safe_reference,
      'stage', c.stage,
      'funding_sources', to_jsonb(c.funding_sources),
      'circumstances', to_jsonb(c.circumstances),
      'planned_event_date', c.planned_event_date,
      'has_external_documents', c.has_external_documents,
      'response_decision', c.response_decision,
      'requester_name', requester.full_name,
      'requester_role', c.requester_role,
      'manager_name', manager.full_name,
      'assigned_lawyer_name', lawyer.full_name,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'closed_at', c.closed_at
    ),
    'permissions', jsonb_build_object(
      'can_decide', nav_v2_private.nav_v2_can_decide_consultation(c.id, v_uid) and c.status = 'new',
      'can_clarify', (c.created_by = v_uid or v_role in ('owner', 'admin')) and c.status = 'need_info',
      'can_close', (
        c.created_by = v_uid
        or c.assigned_lawyer_id = v_uid
        or v_role in ('owner', 'admin')
      ) and c.status in ('new', 'need_info', 'answered', 'convert_to_preparation')
    ),
    'conversion_draft', case
      when c.status = 'convert_to_preparation'
        then nav_v2_private.nav_v2_consultation_conversion_draft(c.id)
      else null
    end,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'author_name', author.full_name,
        'author_role', m.author_role,
        'message_type', m.message_type,
        'body', m.body,
        'created_at', m.created_at
      ) order by m.created_at)
      from public.nav_consultation_messages_v2 m
      left join public.nav_user_profiles author on author.id = m.author_id
      where m.consultation_id = c.id
    ), '[]'::jsonb)
  ) into v_result
  from public.nav_consultations_v2 c
  join public.nav_user_profiles caller on caller.id = v_uid
  left join public.nav_user_profiles requester on requester.id = c.created_by
  left join public.nav_user_profiles manager on manager.id = c.manager_id
  left join public.nav_user_profiles lawyer on lawyer.id = c.assigned_lawyer_id
  where c.id = p_consultation_id;

  if v_result is null then
    raise exception 'Консультация не найдена' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

create or replace function public.nav_v2_decide_consultation(
  p_consultation_id uuid,
  p_decision text,
  p_body text
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

create or replace function public.nav_v2_add_consultation_clarification(
  p_consultation_id uuid,
  p_body text
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
  v_findings text[];
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if v_body is null or char_length(v_body) < 5 or char_length(v_body) > 4000 then
    raise exception 'Уточнение должно содержать от 5 до 4000 символов';
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

  select p.role into v_role
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;

  if v_consultation.status <> 'need_info' then
    raise exception 'Уточнение принимается только после запроса юриста';
  end if;

  if v_consultation.created_by <> v_uid and v_role not in ('owner', 'admin') then
    raise exception 'Уточнение может отправить инициатор запроса' using errcode = '42501';
  end if;

  insert into public.nav_consultation_messages_v2 (
    consultation_id, author_id, author_role, message_type, body
  ) values (
    p_consultation_id, v_uid, v_role, 'clarification', v_body
  );

  update public.nav_consultations_v2
  set status = 'new',
      response_decision = null,
      response_by = null,
      response_at = null,
      last_message_at = now(),
      updated_at = now()
  where id = p_consultation_id;

  return jsonb_build_object(
    'ok', true,
    'consultation_id', p_consultation_id,
    'status', 'new',
    'next_action', 'Юристу нужно повторно проверить уточнённый запрос'
  );
end;
$$;

create or replace function public.nav_v2_close_consultation(
  p_consultation_id uuid,
  p_close_code text,
  p_reason text default null
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
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_findings text[];
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if p_close_code not in ('closed', 'cancelled') then
    raise exception 'Недопустимый исход закрытия';
  end if;

  if v_reason is not null then
    v_findings := nav_v2_private.nav_v2_consultation_text_findings(v_reason);
    if cardinality(v_findings) > 0 then
      raise exception 'Удалите персональные или точные идентификаторы: %', array_to_string(v_findings, ', ')
        using errcode = '22023';
    end if;
  end if;

  select c.* into v_consultation
  from public.nav_consultations_v2 c
  where c.id = p_consultation_id
  for update;

  if not found then
    raise exception 'Консультация не найдена' using errcode = 'P0002';
  end if;

  select p.role into v_role
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;

  if p_close_code = 'cancelled' and v_consultation.status not in ('new', 'need_info') then
    raise exception 'Отменить можно только незавершённый запрос';
  end if;
  if p_close_code = 'closed' and v_consultation.status not in ('answered', 'convert_to_preparation') then
    raise exception 'Закрыть можно после ответа или рекомендации полной подготовки';
  end if;

  if v_consultation.created_by <> v_uid
     and v_consultation.assigned_lawyer_id is distinct from v_uid
     and v_role not in ('owner', 'admin') then
    raise exception 'Нет прав закрыть консультацию' using errcode = '42501';
  end if;

  update public.nav_consultations_v2
  set status = p_close_code,
      closed_at = now(),
      last_message_at = case when v_reason is null then last_message_at else now() end,
      updated_at = now()
  where id = p_consultation_id;

  if v_reason is not null then
    insert into public.nav_consultation_messages_v2 (
      consultation_id, author_id, author_role, message_type, body
    ) values (
      p_consultation_id, v_uid, v_role, 'closure_note', v_reason
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'consultation_id', p_consultation_id,
    'status', p_close_code
  );
end;
$$;

revoke execute on function nav_v2_private.nav_v2_consultation_text_findings(text) from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_can_view_consultation(uuid, uuid) from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_can_decide_consultation(uuid, uuid) from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_consultation_conversion_draft(uuid) from public, anon, authenticated;

revoke execute on function public.nav_v2_create_consultation(jsonb) from public, anon, authenticated;
revoke execute on function public.nav_v2_get_consultation_queue(integer) from public, anon, authenticated;
revoke execute on function public.nav_v2_get_consultation(uuid) from public, anon, authenticated;
revoke execute on function public.nav_v2_decide_consultation(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.nav_v2_add_consultation_clarification(uuid, text) from public, anon, authenticated;
revoke execute on function public.nav_v2_close_consultation(uuid, text, text) from public, anon, authenticated;

grant execute on function public.nav_v2_create_consultation(jsonb) to authenticated, service_role;
grant execute on function public.nav_v2_get_consultation_queue(integer) to authenticated, service_role;
grant execute on function public.nav_v2_get_consultation(uuid) to authenticated, service_role;
grant execute on function public.nav_v2_decide_consultation(uuid, text, text) to authenticated, service_role;
grant execute on function public.nav_v2_add_consultation_clarification(uuid, text) to authenticated, service_role;
grant execute on function public.nav_v2_close_consultation(uuid, text, text) to authenticated, service_role;

-- Explicit non-goals of this prototype:
-- no insert into public.nav_deals_v2;
-- no insert into public.nav_deal_tasks_v2;
-- no insert into public.nav_deal_documents_v2;
-- no insert into public.nav_deal_risks_v2;
-- no document URL is persisted before the owner approves source domains and retention rules.
