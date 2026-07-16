-- REPOSITORY-ONLY PROTOTYPE.
-- Do not apply to production before isolated authenticated role/mutation tests.
-- Corporate service documents are intentionally separated from legal/object documents.

create table if not exists public.nav_deal_corporate_documents_v2 (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.nav_deals_v2(id) on delete cascade,
  party_side public.nav_v2_side not null,
  document_type text not null,
  status text not null default 'planned',
  is_required boolean not null default false,
  required_stage text not null default 'conditional',
  responsible_role public.nav_v2_user_role not null default 'spn',
  assigned_to uuid references auth.users(id) on delete set null,
  due_date date,
  signing_method text not null default 'unknown',
  template_code text,
  template_version text,
  has_external_signature_reference boolean not null default false,
  prepared_at timestamptz,
  sent_at timestamptz,
  signed_at timestamptz,
  problem_note text,
  outcome_code text,
  outcome_state text,
  outcome_reason text,
  outcome_proposed_by uuid references auth.users(id) on delete set null,
  outcome_proposed_at timestamptz,
  outcome_decided_by uuid references auth.users(id) on delete set null,
  outcome_decided_at timestamptz,
  replacement_document_id uuid references public.nav_deal_corporate_documents_v2(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nav_corporate_document_type_check check (
    document_type in ('service_agreement', 'inspection_act', 'addendum', 'completion_act')
  ),
  constraint nav_corporate_document_status_check check (
    status in ('planned', 'prepared', 'sent_for_signature', 'signed', 'problem', 'cancelled')
  ),
  constraint nav_corporate_document_stage_check check (
    required_stage in ('before_work', 'before_deposit', 'before_deal', 'after_deal', 'conditional')
  ),
  constraint nav_corporate_document_signing_method_check check (
    signing_method in ('unknown', 'paper', 'online')
  ),
  constraint nav_corporate_document_responsible_role_check check (
    responsible_role in ('spn', 'manager', 'owner', 'admin')
  ),
  constraint nav_corporate_document_outcome_code_check check (
    outcome_code is null or outcome_code in ('not_applicable', 'replaced', 'cancelled')
  ),
  constraint nav_corporate_document_outcome_state_check check (
    outcome_state is null or outcome_state in ('proposed', 'confirmed', 'rejected')
  ),
  constraint nav_corporate_document_outcome_pair_check check (
    (outcome_code is null and outcome_state is null)
    or (outcome_code is not null and outcome_state is not null)
  ),
  constraint nav_corporate_document_replacement_check check (
    outcome_code <> 'replaced' or replacement_document_id is not null
  ),
  constraint nav_corporate_document_signed_check check (
    status <> 'signed' or signed_at is not null
  ),
  constraint nav_corporate_document_problem_check check (
    status <> 'problem' or nullif(trim(coalesce(problem_note, '')), '') is not null
  )
);

alter table public.nav_deal_corporate_documents_v2 enable row level security;

revoke all on table public.nav_deal_corporate_documents_v2 from public, anon, authenticated;
grant all on table public.nav_deal_corporate_documents_v2 to service_role;

create unique index if not exists nav_corporate_documents_active_unique_idx
  on public.nav_deal_corporate_documents_v2(deal_id, party_side, document_type)
  where status <> 'cancelled'
    and not (
      outcome_state = 'confirmed'
      and outcome_code in ('not_applicable', 'replaced', 'cancelled')
    );

create index if not exists nav_corporate_documents_deal_stage_idx
  on public.nav_deal_corporate_documents_v2(deal_id, required_stage, status);
create index if not exists nav_corporate_documents_assignee_due_idx
  on public.nav_deal_corporate_documents_v2(assigned_to, due_date)
  where status not in ('signed', 'cancelled');

create or replace function nav_v2_private.nav_v2_corporate_document_is_complete(
  p_status text,
  p_outcome_code text,
  p_outcome_state text
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    coalesce(p_status, '') = 'signed'
    or (
      coalesce(p_outcome_state, '') = 'confirmed'
      and coalesce(p_outcome_code, '') in ('not_applicable', 'replaced', 'cancelled')
    );
$$;

create or replace function nav_v2_private.nav_v2_corporate_recommended_items(
  p_deal_id uuid
)
returns table (
  party_side public.nav_v2_side,
  document_type text,
  is_required boolean,
  required_stage text,
  default_responsible_role public.nav_v2_user_role,
  rationale text
)
language sql
stable
security definer
set search_path = ''
as $$
  with deal_scope as (
    select d.id, d.seller_spn_id, d.buyer_spn_id
    from public.nav_deals_v2 d
    where d.id = p_deal_id
  ), represented_sides as (
    select 'seller'::public.nav_v2_side as party_side
    from deal_scope where seller_spn_id is not null
    union all
    select 'buyer'::public.nav_v2_side as party_side
    from deal_scope where buyer_spn_id is not null
  )
  select side.party_side,
         item.document_type,
         item.is_required,
         item.required_stage,
         'spn'::public.nav_v2_user_role,
         item.rationale
  from represented_sides side
  cross join (values
    ('service_agreement'::text, true, 'before_work'::text,
      'Договор оказания услуг по представляемой стороне. Применимость и шаблон подтверждает СПН.'::text),
    ('inspection_act'::text, false, 'conditional'::text,
      'Акт осмотра добавляется явно, если был осмотр/показ и офисный регламент требует фиксацию.'::text),
    ('addendum'::text, false, 'conditional'::text,
      'Дополнительное соглашение требуется только при изменении согласованных условий или объёма услуг.'::text),
    ('completion_act'::text, true, 'after_deal'::text,
      'Акт выполненных работ закрывает корпоративный цикл после завершения услуги.'::text)
  ) item(document_type, is_required, required_stage, rationale);
$$;

create or replace function public.nav_v2_preview_corporate_document_plan(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
  v_items jsonb;
  v_existing_count integer;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if not nav_v2_private.nav_v2_can_view_deal(p_deal_id, v_uid) then
    raise exception 'Нет доступа к сделке' using errcode = '42501';
  end if;

  select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'role', p.role)
    into v_profile
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;

  if v_profile is null then
    raise exception 'Нет активного профиля Navigator' using errcode = '42501';
  end if;

  select count(*)::int
    into v_existing_count
  from public.nav_deal_corporate_documents_v2 doc
  where doc.deal_id = p_deal_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'party_side', rec.party_side,
    'document_type', rec.document_type,
    'is_required', rec.is_required,
    'required_stage', rec.required_stage,
    'responsible_role', rec.default_responsible_role,
    'rationale', rec.rationale,
    'already_initialized', exists (
      select 1
      from public.nav_deal_corporate_documents_v2 existing
      where existing.deal_id = p_deal_id
        and existing.party_side = rec.party_side
        and existing.document_type = rec.document_type
        and existing.status <> 'cancelled'
        and not (
          existing.outcome_state = 'confirmed'
          and existing.outcome_code in ('not_applicable', 'replaced', 'cancelled')
        )
    )
  ) order by rec.party_side, rec.document_type), '[]'::jsonb)
  into v_items
  from nav_v2_private.nav_v2_corporate_recommended_items(p_deal_id) rec;

  return jsonb_build_object(
    'profile', v_profile,
    'deal_id', p_deal_id,
    'preview_only', true,
    'inference_source', 'seller_spn_id/buyer_spn_id',
    'requires_user_confirmation', true,
    'existing_items_count', v_existing_count,
    'recommended_items', v_items,
    'legal_readiness_changed', false,
    'backlog_created', false
  );
end;
$$;

create or replace function public.nav_v2_get_corporate_document_readiness(p_deal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
  v_items jsonb;
  v_summary jsonb;
begin
  if v_uid is null then
    raise exception 'Пользователь не авторизован' using errcode = '42501';
  end if;

  if not nav_v2_private.nav_v2_can_view_deal(p_deal_id, v_uid) then
    raise exception 'Нет доступа к сделке' using errcode = '42501';
  end if;

  select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'role', p.role)
    into v_profile
  from public.nav_user_profiles p
  where p.id = v_uid and p.is_active is true
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', doc.id,
    'party_side', doc.party_side,
    'document_type', doc.document_type,
    'status', doc.status,
    'is_required', doc.is_required,
    'required_stage', doc.required_stage,
    'responsible_role', doc.responsible_role,
    'assigned_to_name', assignee.full_name,
    'due_date', doc.due_date,
    'signing_method', doc.signing_method,
    'template_code', doc.template_code,
    'template_version', doc.template_version,
    'has_external_signature_reference', doc.has_external_signature_reference,
    'outcome_code', doc.outcome_code,
    'outcome_state', doc.outcome_state,
    'is_complete', nav_v2_private.nav_v2_corporate_document_is_complete(
      doc.status, doc.outcome_code, doc.outcome_state
    ),
    'created_at', doc.created_at,
    'updated_at', doc.updated_at
  ) order by doc.party_side, doc.required_stage, doc.document_type), '[]'::jsonb)
  into v_items
  from public.nav_deal_corporate_documents_v2 doc
  left join public.nav_user_profiles assignee on assignee.id = doc.assigned_to
  where doc.deal_id = p_deal_id;

  with items as (
    select value as item
    from jsonb_array_elements(v_items)
  )
  select jsonb_build_object(
    'total', count(*)::int,
    'complete', count(*) filter (where (item ->> 'is_complete')::boolean)::int,
    'required_incomplete', count(*) filter (
      where (item ->> 'is_required')::boolean
        and not (item ->> 'is_complete')::boolean
    )::int,
    'before_deposit_incomplete', count(*) filter (
      where (item ->> 'is_required')::boolean
        and item ->> 'required_stage' in ('before_work', 'before_deposit')
        and not (item ->> 'is_complete')::boolean
    )::int,
    'before_deal_incomplete', count(*) filter (
      where (item ->> 'is_required')::boolean
        and item ->> 'required_stage' in ('before_work', 'before_deposit', 'before_deal')
        and not (item ->> 'is_complete')::boolean
    )::int,
    'after_deal_incomplete', count(*) filter (
      where (item ->> 'is_required')::boolean
        and item ->> 'required_stage' = 'after_deal'
        and not (item ->> 'is_complete')::boolean
    )::int,
    'problems', count(*) filter (where item ->> 'status' = 'problem')::int,
    'awaiting_signature', count(*) filter (where item ->> 'status' = 'sent_for_signature')::int
  ) into v_summary
  from items;

  return jsonb_build_object(
    'profile', v_profile,
    'deal_id', p_deal_id,
    'summary', v_summary,
    'items', v_items,
    'corporate_readiness_only', true,
    'legal_readiness_changed', false,
    'deal_status_changed', false
  );
end;
$$;

revoke execute on function nav_v2_private.nav_v2_corporate_document_is_complete(text, text, text)
  from public, anon, authenticated;
revoke execute on function nav_v2_private.nav_v2_corporate_recommended_items(uuid)
  from public, anon, authenticated;

revoke execute on function public.nav_v2_preview_corporate_document_plan(uuid)
  from public, anon, authenticated;
revoke execute on function public.nav_v2_get_corporate_document_readiness(uuid)
  from public, anon, authenticated;

grant execute on function public.nav_v2_preview_corporate_document_plan(uuid)
  to authenticated, service_role;
grant execute on function public.nav_v2_get_corporate_document_readiness(uuid)
  to authenticated, service_role;

-- Explicit non-goals:
-- no automatic insert into public.nav_deal_corporate_documents_v2;
-- no changes to public.nav_deal_documents_v2;
-- no changes to legal readiness, risk gates or deal status;
-- no client names, phones, signatures, scans or document URLs are stored.
