-- REPOSITORY-ONLY PROTOTYPE.
-- Do not apply to production without isolated authenticated role/mutation regression.
-- This design creates no deal, task, document or risk until an explicit existing wizard flow is used.
-- No EXECUTE or table grants are added in this prototype.

create table if not exists public.nav_consultations_v2 (
  id uuid primary key default gen_random_uuid(),
  client_request_id uuid not null,
  created_by uuid not null references public.nav_user_profiles(id),
  status text not null default 'new',
  priority text not null default 'normal',
  question text not null,
  side text not null,
  stage text not null,
  object_type text not null,
  safe_orienter text not null,
  funding_codes text[] not null default '{}'::text[],
  circumstance_codes text[] not null default '{}'::text[],
  planned_date date,
  documents_url text,
  known_facts text,
  broker_scope_needed boolean generated always as (
    funding_codes && array['mortgage', 'military_mortgage']::text[]
  ) stored,
  lawyer_id uuid references public.nav_user_profiles(id),
  decision text,
  answer_text text,
  conversion_mode text,
  conversion_requested_by uuid references public.nav_user_profiles(id),
  conversion_requested_at timestamptz,
  converted_deal_id uuid references public.nav_deals_v2(id),
  close_reason text,
  closed_by uuid references public.nav_user_profiles(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nav_consultations_v2_request_unique unique (created_by, client_request_id),
  constraint nav_consultations_v2_status_check check (
    status in ('new', 'need_info', 'answered', 'converted', 'closed')
  ),
  constraint nav_consultations_v2_priority_check check (
    priority in ('normal', 'high', 'urgent')
  ),
  constraint nav_consultations_v2_side_check check (
    side in ('seller', 'buyer', 'both', 'partner', 'unknown')
  ),
  constraint nav_consultations_v2_stage_check check (
    stage in ('first_question', 'before_deposit', 'deposit_planned', 'preparing_deal', 'urgent')
  ),
  constraint nav_consultations_v2_object_type_check check (
    object_type in ('flat', 'house_land', 'land', 'room_share', 'new_building', 'commercial', 'other')
  ),
  constraint nav_consultations_v2_funding_check check (
    funding_codes <@ array['cash', 'mortgage', 'military_mortgage', 'matcap', 'certificate', 'installment']::text[]
  ),
  constraint nav_consultations_v2_circumstance_check check (
    circumstance_codes <@ array[
      'minor_owner', 'minor_buyer', 'minor_registered', 'power_of_attorney', 'shares',
      'inheritance', 'court', 'spouse', 'after_registration', 'other'
    ]::text[]
  ),
  constraint nav_consultations_v2_decision_check check (
    decision is null or decision in ('answer', 'need_info', 'convert_to_preparation')
  ),
  constraint nav_consultations_v2_conversion_mode_check check (
    conversion_mode is null or conversion_mode in ('deposit', 'deal')
  ),
  constraint nav_consultations_v2_shape_check check (
    char_length(trim(question)) between 12 and 1800
    and char_length(trim(safe_orienter)) between 2 and 220
    and (known_facts is null or char_length(known_facts) <= 2400)
    and (documents_url is null or (char_length(documents_url) <= 600 and documents_url ~* '^https://'))
    and (answer_text is null or char_length(answer_text) <= 4000)
    and (decision is null or nullif(trim(answer_text), '') is not null)
    and (decision <> 'convert_to_preparation' or conversion_mode is not null)
    and (status <> 'need_info' or decision = 'need_info')
    and (status <> 'answered' or decision in ('answer', 'convert_to_preparation'))
    and (status <> 'converted' or (decision = 'convert_to_preparation' and converted_deal_id is not null))
    and (status <> 'closed' or closed_at is not null)
  )
);

create table if not exists public.nav_consultation_messages_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.nav_consultations_v2(id) on delete cascade,
  author_id uuid not null references public.nav_user_profiles(id),
  author_role public.nav_v2_user_role not null,
  message_type text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint nav_consultation_messages_v2_type_check check (
    message_type in ('need_info', 'requester_reply', 'answer', 'conversion_instruction', 'close_note')
  ),
  constraint nav_consultation_messages_v2_body_check check (
    char_length(trim(body)) between 2 and 4000
  )
);

create table if not exists public.nav_consultation_events_v2 (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.nav_consultations_v2(id) on delete cascade,
  actor_id uuid references public.nav_user_profiles(id),
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint nav_consultation_events_v2_type_check check (
    event_type in (
      'consultation_created', 'lawyer_decision', 'requester_replied',
      'conversion_requested', 'conversion_bound', 'consultation_closed'
    )
  )
);

create index if not exists nav_consultations_v2_created_by_updated_idx
  on public.nav_consultations_v2 (created_by, updated_at desc);
create index if not exists nav_consultations_v2_lawyer_queue_idx
  on public.nav_consultations_v2 (status, lawyer_id, priority, planned_date, updated_at desc);
create index if not exists nav_consultations_v2_converted_deal_idx
  on public.nav_consultations_v2 (converted_deal_id)
  where converted_deal_id is not null;
create index if not exists nav_consultation_messages_v2_consultation_created_idx
  on public.nav_consultation_messages_v2 (consultation_id, created_at);
create index if not exists nav_consultation_events_v2_consultation_created_idx
  on public.nav_consultation_events_v2 (consultation_id, created_at);

alter table public.nav_consultations_v2 enable row level security;
alter table public.nav_consultation_messages_v2 enable row level security;
alter table public.nav_consultation_events_v2 enable row level security;

-- No direct policies are added intentionally. The production design is RPC-only.
-- Even if a table grant is introduced accidentally, RLS remains deny-by-default.
revoke all on table public.nav_consultations_v2 from public, anon, authenticated;
revoke all on table public.nav_consultation_messages_v2 from public, anon, authenticated;
revoke all on table public.nav_consultation_events_v2 from public, anon, authenticated;

create or replace function nav_v2_private.nav_v2_consultation_text_is_safe(p_text text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_text is null or btrim(p_text) = '' then true
    when p_text ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}' then false
    when p_text ~ '(\+7|8)[ ()-]*[0-9]{3}[ ()-]*[0-9]{3}[ -]*[0-9]{2}[ -]*[0-9]{2}' then false
    when p_text ~ '[0-9]{4}[ -]+[0-9]{6}' then false
    when p_text ~ '[0-9]{3}-[0-9]{3}-[0-9]{3}[ -]+[0-9]{2}' then false
    when p_text ~ '[0-9]{2}:[0-9]{2}:[0-9]{5,9}:[0-9]+' then false
    when p_text ~* '(^|[^[:alpha:][:digit:]])(кв(артира)?|комн(ата)?|офис|помещ(ение)?|апарт(аменты)?)[[:space:]]*[№#-]?[[:space:]]*[0-9]+[а-яa-z]?($|[^[:alpha:][:digit:]])' then false
    when p_text ~ '(^|[^[:alpha:]])[А-ЯЁ][а-яё]{2,}[[:space:]]+[А-ЯЁ][а-яё]{2,}([[:space:]]+[А-ЯЁ][а-яё]{2,})?($|[^[:alpha:]])' then false
    when regexp_replace(p_text, '[^0-9]', '', 'g') ~ '[0-9]{13,19}' then false
    else true
  end;
$$;

create or replace function nav_v2_private.nav_v2_consultation_role_allowed(p_role public.nav_v2_user_role)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_role in (
    'owner'::public.nav_v2_user_role,
    'admin'::public.nav_v2_user_role,
    'manager'::public.nav_v2_user_role,
    'spn'::public.nav_v2_user_role,
    'lawyer'::public.nav_v2_user_role
  );
$$;

create or replace function nav_v2_private.nav_v2_can_view_consultation(
  p_consultation_id uuid,
  p_uid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select true
    from public.nav_consultations_v2 c
    join public.nav_user_profiles me on me.id = p_uid and me.is_active is true
    join public.nav_user_profiles creator on creator.id = c.created_by
    where c.id = p_consultation_id
      and p_uid is not null
      and (
        p_uid = auth.uid()
        or nav_v2_private.nav_v2_is_owner_or_admin(auth.uid())
        or coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role'
      )
      and (
        me.role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role)
        or c.created_by = p_uid
        or (me.role = 'manager'::public.nav_v2_user_role and creator.manager_id = p_uid)
        or c.lawyer_id = p_uid
        or (
          me.role = 'lawyer'::public.nav_v2_user_role
          and c.lawyer_id is null
          and c.status in ('new', 'need_info')
        )
        or exists (
          select 1
          from public.nav_consultation_messages_v2 m
          where m.consultation_id = c.id and m.author_id = p_uid
        )
      )
    limit 1
  ), false);
$$;

create or replace function nav_v2_private.nav_v2_can_manage_consultation_as_requester(
  p_consultation_id uuid,
  p_uid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select true
    from public.nav_consultations_v2 c
    join public.nav_user_profiles me on me.id = p_uid and me.is_active is true
    join public.nav_user_profiles creator on creator.id = c.created_by
    where c.id = p_consultation_id
      and p_uid is not null
      and (
        p_uid = auth.uid()
        or nav_v2_private.nav_v2_is_owner_or_admin(auth.uid())
        or coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), '') = 'service_role'
      )
      and (
        me.role in ('owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role)
        or c.created_by = p_uid
        or (me.role = 'manager'::public.nav_v2_user_role and creator.manager_id = p_uid)
      )
    limit 1
  ), false);
$$;

create or replace function public.nav_v2_create_consultation(
  p_client_request_id uuid,
  p_intake jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_id uuid;
  v_existing public.nav_consultations_v2%rowtype;
  v_question text;
  v_side text;
  v_stage text;
  v_object_type text;
  v_safe_orienter text;
  v_funding text[];
  v_circumstances text[];
  v_planned_date date;
  v_documents_url text;
  v_known_facts text;
  v_priority text;
  v_unknown_keys text[];
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;
  if p_client_request_id is null then
    raise exception 'client_request_id обязателен';
  end if;
  if p_intake is null or jsonb_typeof(p_intake) <> 'object' then
    raise exception 'Consultation intake должен быть JSON-объектом';
  end if;

  v_role := nav_v2_private.nav_v2_my_role(v_uid);
  if not nav_v2_private.nav_v2_consultation_role_allowed(v_role) then
    raise exception 'Роль не участвует в юридическом consultation intake' using errcode = '42501';
  end if;

  select array_agg(k order by k)
  into v_unknown_keys
  from jsonb_object_keys(p_intake) k
  where k not in (
    'question', 'side', 'stage', 'object_type', 'safe_orienter',
    'funding', 'circumstances', 'planned_date', 'documents_url', 'known_facts'
  );
  if coalesce(array_length(v_unknown_keys, 1), 0) > 0 then
    raise exception 'Intake содержит недопустимые поля: %', array_to_string(v_unknown_keys, ', ');
  end if;

  v_question := nullif(trim(coalesce(p_intake ->> 'question', '')), '');
  v_side := nullif(trim(coalesce(p_intake ->> 'side', '')), '');
  v_stage := nullif(trim(coalesce(p_intake ->> 'stage', '')), '');
  v_object_type := nullif(trim(coalesce(p_intake ->> 'object_type', '')), '');
  v_safe_orienter := nullif(trim(coalesce(p_intake ->> 'safe_orienter', '')), '');
  v_documents_url := nullif(trim(coalesce(p_intake ->> 'documents_url', '')), '');
  v_known_facts := nullif(trim(coalesce(p_intake ->> 'known_facts', '')), '');

  if p_intake ? 'funding' and jsonb_typeof(p_intake -> 'funding') <> 'array' then
    raise exception 'funding должен быть массивом';
  end if;
  if p_intake ? 'circumstances' and jsonb_typeof(p_intake -> 'circumstances') <> 'array' then
    raise exception 'circumstances должен быть массивом';
  end if;

  select coalesce(array_agg(distinct value order by value), '{}'::text[])
  into v_funding
  from jsonb_array_elements_text(coalesce(p_intake -> 'funding', '[]'::jsonb));

  select coalesce(array_agg(distinct value order by value), '{}'::text[])
  into v_circumstances
  from jsonb_array_elements_text(coalesce(p_intake -> 'circumstances', '[]'::jsonb));

  begin
    v_planned_date := nullif(p_intake ->> 'planned_date', '')::date;
  exception when invalid_datetime_format then
    raise exception 'planned_date должна быть датой YYYY-MM-DD';
  end;

  if v_question is null or char_length(v_question) < 12 then
    raise exception 'Сформулируйте конкретный вопрос минимум в 12 символах';
  end if;
  if v_side not in ('seller', 'buyer', 'both', 'partner', 'unknown') then
    raise exception 'Недопустимая сторона сопровождения';
  end if;
  if v_stage not in ('first_question', 'before_deposit', 'deposit_planned', 'preparing_deal', 'urgent') then
    raise exception 'Недопустимая стадия';
  end if;
  if v_object_type not in ('flat', 'house_land', 'land', 'room_share', 'new_building', 'commercial', 'other') then
    raise exception 'Недопустимый тип объекта';
  end if;
  if v_safe_orienter is null then
    raise exception 'Безопасный ориентир обязателен';
  end if;
  if not v_funding <@ array['cash', 'mortgage', 'military_mortgage', 'matcap', 'certificate', 'installment']::text[] then
    raise exception 'Недопустимый источник средств';
  end if;
  if not v_circumstances <@ array[
    'minor_owner', 'minor_buyer', 'minor_registered', 'power_of_attorney', 'shares',
    'inheritance', 'court', 'spouse', 'after_registration', 'other'
  ]::text[] then
    raise exception 'Недопустимое особое обстоятельство';
  end if;
  if v_documents_url is not null and (char_length(v_documents_url) > 600 or v_documents_url !~* '^https://') then
    raise exception 'Ссылка на документы должна быть безопасной HTTPS-ссылкой';
  end if;
  if not nav_v2_private.nav_v2_consultation_text_is_safe(v_question)
     or not nav_v2_private.nav_v2_consultation_text_is_safe(v_safe_orienter)
     or not nav_v2_private.nav_v2_consultation_text_is_safe(v_known_facts) then
    raise exception 'Удалите клиентские идентификаторы и точный номер помещения из consultation intake';
  end if;

  v_priority := case
    when v_stage = 'urgent' then 'urgent'
    when v_stage = 'deposit_planned'
      or v_circumstances && array[
        'minor_owner', 'minor_buyer', 'minor_registered', 'power_of_attorney',
        'shares', 'inheritance', 'court', 'after_registration'
      ]::text[] then 'high'
    else 'normal'
  end;

  insert into public.nav_consultations_v2 (
    client_request_id, created_by, priority, question, side, stage, object_type,
    safe_orienter, funding_codes, circumstance_codes, planned_date, documents_url, known_facts
  ) values (
    p_client_request_id, v_uid, v_priority, v_question, v_side, v_stage, v_object_type,
    v_safe_orienter, v_funding, v_circumstances, v_planned_date, v_documents_url, v_known_facts
  )
  on conflict (created_by, client_request_id) do nothing
  returning id into v_id;

  if v_id is null then
    select * into v_existing
    from public.nav_consultations_v2
    where created_by = v_uid and client_request_id = p_client_request_id;
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'consultation_id', v_existing.id,
      'status', v_existing.status,
      'priority', v_existing.priority,
      'broker_scope_needed', v_existing.broker_scope_needed
    );
  end if;

  insert into public.nav_consultation_events_v2 (
    consultation_id, actor_id, event_type, event_data
  ) values (
    v_id, v_uid, 'consultation_created',
    jsonb_build_object(
      'priority', v_priority,
      'stage', v_stage,
      'object_type', v_object_type,
      'broker_scope_needed', v_funding && array['mortgage', 'military_mortgage']::text[],
      'has_planned_date', v_planned_date is not null,
      'has_documents_url', v_documents_url is not null
    )
  );

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'consultation_id', v_id,
    'status', 'new',
    'priority', v_priority,
    'broker_scope_needed', v_funding && array['mortgage', 'military_mortgage']::text[]
  );
end;
$$;

create or replace function public.nav_v2_get_consultations_list(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_profile jsonb;
  v_items jsonb;
  v_counts jsonb;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;
  select p.role, jsonb_build_object('id', p.id, 'full_name', p.full_name, 'role', p.role)
  into v_role, v_profile
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;
  if not nav_v2_private.nav_v2_consultation_role_allowed(v_role) then
    raise exception 'Роль не участвует в юридическом consultation intake' using errcode = '42501';
  end if;

  with visible as (
    select c.*
    from public.nav_consultations_v2 c
    where nav_v2_private.nav_v2_can_view_consultation(c.id, v_uid)
    order by
      case c.priority when 'urgent' then 0 when 'high' then 1 else 2 end,
      c.planned_date asc nulls last,
      c.updated_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 200))
  ), rows as (
    select jsonb_build_object(
      'id', c.id,
      'status', c.status,
      'priority', c.priority,
      'question_preview', left(c.question, 180),
      'side', c.side,
      'stage', c.stage,
      'object_type', c.object_type,
      'safe_orienter', c.safe_orienter,
      'funding_codes', to_jsonb(c.funding_codes),
      'circumstance_codes', to_jsonb(c.circumstance_codes),
      'planned_date', c.planned_date,
      'broker_scope_needed', c.broker_scope_needed,
      'lawyer_state', case when c.lawyer_id is null then 'waiting_assignment' else 'assigned' end,
      'lawyer_name', lawyer.full_name,
      'created_by_name', creator.full_name,
      'decision', c.decision,
      'conversion_mode', c.conversion_mode,
      'has_documents_url', c.documents_url is not null,
      'conversion_requested', c.conversion_requested_at is not null,
      'created_at', c.created_at,
      'updated_at', c.updated_at
    ) as item
    from visible c
    join public.nav_user_profiles creator on creator.id = c.created_by
    left join public.nav_user_profiles lawyer on lawyer.id = c.lawyer_id
  )
  select coalesce(jsonb_agg(item), '[]'::jsonb) into v_items from rows;

  select jsonb_build_object(
    'total', count(*),
    'new', count(*) filter (where item ->> 'status' = 'new'),
    'need_info', count(*) filter (where item ->> 'status' = 'need_info'),
    'answered', count(*) filter (where item ->> 'status' = 'answered'),
    'converted', count(*) filter (where item ->> 'status' = 'converted'),
    'closed', count(*) filter (where item ->> 'status' = 'closed'),
    'urgent', count(*) filter (where item ->> 'priority' = 'urgent'),
    'waiting_lawyer', count(*) filter (where item ->> 'lawyer_state' = 'waiting_assignment')
  ) into v_counts
  from jsonb_array_elements(v_items) item;

  return jsonb_build_object(
    'profile', v_profile,
    'counts', coalesce(v_counts, '{}'::jsonb),
    'items', v_items
  );
end;
$$;

create or replace function public.nav_v2_get_consultation_card(p_consultation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_profile jsonb;
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;
  if not nav_v2_private.nav_v2_can_view_consultation(p_consultation_id, v_uid) then
    raise exception 'Нет доступа к консультации' using errcode = '42501';
  end if;
  select p.role, jsonb_build_object('id', p.id, 'full_name', p.full_name, 'role', p.role)
  into v_role, v_profile
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;

  select jsonb_build_object(
    'profile', v_profile,
    'consultation', jsonb_build_object(
      'id', c.id,
      'status', c.status,
      'priority', c.priority,
      'question', c.question,
      'side', c.side,
      'stage', c.stage,
      'object_type', c.object_type,
      'safe_orienter', c.safe_orienter,
      'funding_codes', to_jsonb(c.funding_codes),
      'circumstance_codes', to_jsonb(c.circumstance_codes),
      'planned_date', c.planned_date,
      'documents_url', c.documents_url,
      'known_facts', c.known_facts,
      'broker_scope_needed', c.broker_scope_needed,
      'lawyer_id', c.lawyer_id,
      'lawyer_name', lawyer.full_name,
      'created_by', c.created_by,
      'created_by_name', creator.full_name,
      'decision', c.decision,
      'answer_text', c.answer_text,
      'conversion_mode', c.conversion_mode,
      'conversion_requested_at', c.conversion_requested_at,
      'converted_deal_id', c.converted_deal_id,
      'close_reason', c.close_reason,
      'created_at', c.created_at,
      'updated_at', c.updated_at
    ),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'author_id', m.author_id,
        'author_name', author.full_name,
        'author_role', m.author_role,
        'message_type', m.message_type,
        'body', m.body,
        'created_at', m.created_at
      ) order by m.created_at)
      from public.nav_consultation_messages_v2 m
      join public.nav_user_profiles author on author.id = m.author_id
      where m.consultation_id = c.id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'actor_id', e.actor_id,
        'event_type', e.event_type,
        'event_data', e.event_data,
        'created_at', e.created_at
      ) order by e.created_at desc)
      from public.nav_consultation_events_v2 e
      where e.consultation_id = c.id
    ), '[]'::jsonb)
  ) into v_result
  from public.nav_consultations_v2 c
  join public.nav_user_profiles creator on creator.id = c.created_by
  left join public.nav_user_profiles lawyer on lawyer.id = c.lawyer_id
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
  p_text text,
  p_conversion_mode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_row public.nav_consultations_v2%rowtype;
  v_status text;
  v_message_type text;
  v_text text := nullif(trim(coalesce(p_text, '')), '');
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;
  v_role := nav_v2_private.nav_v2_my_role(v_uid);
  if v_role not in ('lawyer'::public.nav_v2_user_role, 'owner'::public.nav_v2_user_role, 'admin'::public.nav_v2_user_role) then
    raise exception 'Решение по консультации принимает юрист или owner/admin' using errcode = '42501';
  end if;
  if p_decision not in ('answer', 'need_info', 'convert_to_preparation') then
    raise exception 'Недопустимое решение по консультации';
  end if;
  if v_text is null or not nav_v2_private.nav_v2_consultation_text_is_safe(v_text) then
    raise exception 'Ответ обязателен и не должен содержать клиентские идентификаторы';
  end if;
  if p_decision = 'convert_to_preparation' and p_conversion_mode not in ('deposit', 'deal') then
    raise exception 'Для преобразования укажите deposit или deal';
  end if;

  select * into v_row
  from public.nav_consultations_v2
  where id = p_consultation_id
  for update;
  if not found then
    raise exception 'Консультация не найдена' using errcode = 'P0002';
  end if;
  if v_row.status in ('converted', 'closed') then
    raise exception 'Закрытая или преобразованная консультация не принимает новое решение';
  end if;
  if v_role = 'lawyer'::public.nav_v2_user_role
     and v_row.lawyer_id is not null
     and v_row.lawyer_id <> v_uid then
    raise exception 'Консультация назначена другому юристу' using errcode = '42501';
  end if;

  v_status := case when p_decision = 'need_info' then 'need_info' else 'answered' end;
  v_message_type := case
    when p_decision = 'need_info' then 'need_info'
    when p_decision = 'answer' then 'answer'
    else 'conversion_instruction'
  end;

  update public.nav_consultations_v2
  set lawyer_id = coalesce(lawyer_id, v_uid),
      status = v_status,
      decision = p_decision,
      answer_text = v_text,
      conversion_mode = case when p_decision = 'convert_to_preparation' then p_conversion_mode else null end,
      conversion_requested_by = null,
      conversion_requested_at = null,
      updated_at = now()
  where id = p_consultation_id;

  insert into public.nav_consultation_messages_v2 (
    consultation_id, author_id, author_role, message_type, body
  ) values (
    p_consultation_id, v_uid, v_role, v_message_type, v_text
  );

  insert into public.nav_consultation_events_v2 (
    consultation_id, actor_id, event_type, event_data
  ) values (
    p_consultation_id, v_uid, 'lawyer_decision',
    jsonb_build_object(
      'decision', p_decision,
      'status', v_status,
      'conversion_mode', case when p_decision = 'convert_to_preparation' then p_conversion_mode else null end,
      'has_text', true
    )
  );

  return jsonb_build_object(
    'ok', true,
    'consultation_id', p_consultation_id,
    'status', v_status,
    'decision', p_decision,
    'conversion_mode', case when p_decision = 'convert_to_preparation' then p_conversion_mode else null end,
    'lawyer_id', coalesce(v_row.lawyer_id, v_uid)
  );
end;
$$;

create or replace function public.nav_v2_reply_consultation(
  p_consultation_id uuid,
  p_text text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_row public.nav_consultations_v2%rowtype;
  v_text text := nullif(trim(coalesce(p_text, '')), '');
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;
  if not nav_v2_private.nav_v2_can_manage_consultation_as_requester(p_consultation_id, v_uid) then
    raise exception 'Нет прав отвечать по этой консультации' using errcode = '42501';
  end if;
  if v_text is null or not nav_v2_private.nav_v2_consultation_text_is_safe(v_text) then
    raise exception 'Ответ обязателен и не должен содержать клиентские идентификаторы';
  end if;

  select * into v_row
  from public.nav_consultations_v2
  where id = p_consultation_id
  for update;
  if not found then
    raise exception 'Консультация не найдена' using errcode = 'P0002';
  end if;
  if v_row.status <> 'need_info' or v_row.decision <> 'need_info' then
    raise exception 'Юрист не запрашивал уточнение по этой консультации';
  end if;

  v_role := nav_v2_private.nav_v2_my_role(v_uid);

  update public.nav_consultations_v2
  set status = 'new',
      decision = null,
      answer_text = null,
      conversion_mode = null,
      updated_at = now()
  where id = p_consultation_id;

  insert into public.nav_consultation_messages_v2 (
    consultation_id, author_id, author_role, message_type, body
  ) values (
    p_consultation_id, v_uid, v_role, 'requester_reply', v_text
  );

  insert into public.nav_consultation_events_v2 (
    consultation_id, actor_id, event_type, event_data
  ) values (
    p_consultation_id, v_uid, 'requester_replied', jsonb_build_object('status', 'new', 'has_text', true)
  );

  return jsonb_build_object('ok', true, 'consultation_id', p_consultation_id, 'status', 'new');
end;
$$;

create or replace function public.nav_v2_request_consultation_conversion(p_consultation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.nav_consultations_v2%rowtype;
  v_payments jsonb;
  v_flags jsonb;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;
  if not nav_v2_private.nav_v2_can_manage_consultation_as_requester(p_consultation_id, v_uid) then
    raise exception 'Нет прав преобразовывать эту консультацию' using errcode = '42501';
  end if;

  select * into v_row
  from public.nav_consultations_v2
  where id = p_consultation_id
  for update;
  if not found then
    raise exception 'Консультация не найдена' using errcode = 'P0002';
  end if;
  if v_row.status <> 'answered'
     or v_row.decision <> 'convert_to_preparation'
     or v_row.conversion_mode not in ('deposit', 'deal') then
    raise exception 'Юрист ещё не подтвердил преобразование в подготовку';
  end if;

  select coalesce(jsonb_agg(case when code = 'military_mortgage' then 'militaryMortgage' else code end), '[]'::jsonb)
  into v_payments
  from unnest(v_row.funding_codes) code;

  select coalesce(jsonb_agg(mapped), '[]'::jsonb)
  into v_flags
  from (
    select case code
      when 'minor_owner' then 'minorSeller'
      when 'minor_buyer' then 'minorBuyer'
      when 'minor_registered' then 'minorRegistered'
      when 'power_of_attorney' then 'powerOfAttorney'
      when 'shares' then 'shares'
      when 'spouse' then 'spouse'
    end as mapped
    from unnest(v_row.circumstance_codes) code
  ) x
  where mapped is not null;

  update public.nav_consultations_v2
  set conversion_requested_by = v_uid,
      conversion_requested_at = now(),
      updated_at = now()
  where id = p_consultation_id;

  insert into public.nav_consultation_events_v2 (
    consultation_id, actor_id, event_type, event_data
  ) values (
    p_consultation_id, v_uid, 'conversion_requested',
    jsonb_build_object('conversion_mode', v_row.conversion_mode)
  );

  return jsonb_build_object(
    'ok', true,
    'consultation_id', p_consultation_id,
    'status', 'answered',
    'conversion_mode', v_row.conversion_mode,
    'creates_deal', false,
    'creates_backlog', false,
    'wizard_draft', jsonb_strip_nulls(jsonb_build_object(
      'preparationMode', v_row.conversion_mode,
      'representation', case v_row.side
        when 'seller' then 'seller'
        when 'buyer' then 'buyer'
        when 'both' then 'both'
        when 'partner' then 'partner_agency'
        else 'external_party'
      end,
      'objectType', case v_row.object_type
        when 'room_share' then 'share_room'
        else v_row.object_type
      end,
      'payments', v_payments,
      'flags', v_flags,
      'spnFinalComment', v_row.question,
      'consultationSafeOrienter', v_row.safe_orienter,
      'consultationKnownFacts', v_row.known_facts,
      'consultationPlannedDate', v_row.planned_date,
      'consultationDocumentsUrl', v_row.documents_url,
      'sourceConsultationId', v_row.id
    ))
  );
end;
$$;

create or replace function public.nav_v2_bind_consultation_conversion(
  p_consultation_id uuid,
  p_deal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.nav_consultations_v2%rowtype;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;
  if not nav_v2_private.nav_v2_can_manage_consultation_as_requester(p_consultation_id, v_uid) then
    raise exception 'Нет прав завершать преобразование этой консультации' using errcode = '42501';
  end if;
  if not nav_v2_private.nav_v2_can_view_deal(p_deal_id, v_uid) then
    raise exception 'Нет доступа к созданной сделке' using errcode = '42501';
  end if;

  select * into v_row
  from public.nav_consultations_v2
  where id = p_consultation_id
  for update;
  if not found then
    raise exception 'Консультация не найдена' using errcode = 'P0002';
  end if;
  if v_row.status <> 'answered'
     or v_row.decision <> 'convert_to_preparation'
     or v_row.conversion_requested_at is null then
    raise exception 'Сначала запросите явное преобразование консультации';
  end if;
  if v_row.converted_deal_id is not null and v_row.converted_deal_id <> p_deal_id then
    raise exception 'Консультация уже привязана к другой сделке';
  end if;

  update public.nav_consultations_v2
  set status = 'converted',
      converted_deal_id = p_deal_id,
      updated_at = now()
  where id = p_consultation_id;

  insert into public.nav_consultation_events_v2 (
    consultation_id, actor_id, event_type, event_data
  ) values (
    p_consultation_id, v_uid, 'conversion_bound',
    jsonb_build_object('deal_id', p_deal_id, 'conversion_mode', v_row.conversion_mode)
  );

  insert into public.nav_deal_events_v2 (
    deal_id, actor_id, event_type, event_title, event_data
  ) values (
    p_deal_id, v_uid, 'consultation_conversion_bound',
    'Сделка создана из подтверждённой консультации',
    jsonb_build_object('consultation_id', p_consultation_id, 'conversion_mode', v_row.conversion_mode)
  );

  return jsonb_build_object(
    'ok', true,
    'consultation_id', p_consultation_id,
    'status', 'converted',
    'deal_id', p_deal_id
  );
end;
$$;

create or replace function public.nav_v2_close_consultation(
  p_consultation_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, nav_v2_private
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_row public.nav_consultations_v2%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;
  if v_reason is null or not nav_v2_private.nav_v2_consultation_text_is_safe(v_reason) then
    raise exception 'Причина закрытия обязательна и не должна содержать клиентские идентификаторы';
  end if;

  select * into v_row
  from public.nav_consultations_v2
  where id = p_consultation_id
  for update;
  if not found then
    raise exception 'Консультация не найдена' using errcode = 'P0002';
  end if;
  if not nav_v2_private.nav_v2_can_manage_consultation_as_requester(p_consultation_id, v_uid)
     and v_row.lawyer_id is distinct from v_uid then
    raise exception 'Нет прав закрывать эту консультацию' using errcode = '42501';
  end if;
  if v_row.status = 'converted' then
    raise exception 'Преобразованная консультация закрывается через связанную сделку';
  end if;
  if v_row.status = 'closed' then
    return jsonb_build_object('ok', true, 'idempotent', true, 'consultation_id', p_consultation_id, 'status', 'closed');
  end if;

  v_role := nav_v2_private.nav_v2_my_role(v_uid);

  update public.nav_consultations_v2
  set status = 'closed',
      close_reason = v_reason,
      closed_by = v_uid,
      closed_at = now(),
      updated_at = now()
  where id = p_consultation_id;

  insert into public.nav_consultation_messages_v2 (
    consultation_id, author_id, author_role, message_type, body
  ) values (
    p_consultation_id, v_uid, v_role, 'close_note', v_reason
  );

  insert into public.nav_consultation_events_v2 (
    consultation_id, actor_id, event_type, event_data
  ) values (
    p_consultation_id, v_uid, 'consultation_closed', jsonb_build_object('previous_status', v_row.status)
  );

  return jsonb_build_object('ok', true, 'idempotent', false, 'consultation_id', p_consultation_id, 'status', 'closed');
end;
$$;

-- Repository-only lockdown: functions are intentionally not callable by API roles.
revoke execute on function nav_v2_private.nav_v2_consultation_text_is_safe(text) from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_consultation_role_allowed(public.nav_v2_user_role) from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_can_view_consultation(uuid, uuid) from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_can_manage_consultation_as_requester(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.nav_v2_create_consultation(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.nav_v2_get_consultations_list(integer) from public, anon, authenticated;
revoke execute on function public.nav_v2_get_consultation_card(uuid) from public, anon, authenticated;
revoke execute on function public.nav_v2_decide_consultation(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.nav_v2_reply_consultation(uuid, text) from public, anon, authenticated;
revoke execute on function public.nav_v2_request_consultation_conversion(uuid) from public, anon, authenticated;
revoke execute on function public.nav_v2_bind_consultation_conversion(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.nav_v2_close_consultation(uuid, text) from public, anon, authenticated;

-- No GRANT statements by design. A future deployment migration must explicitly grant only reviewed RPCs.
