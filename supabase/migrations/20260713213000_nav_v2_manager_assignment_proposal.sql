create or replace function nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_role public.nav_v2_user_role;
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_items jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_issue_counts jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  select profile.role
  into v_role
  from public.nav_user_profiles profile
  where profile.id = v_uid
    and profile.is_active is true
  limit 1;

  if v_role is null or v_role not in ('owner', 'admin', 'manager') then
    raise exception 'Предложения по менеджеру доступны владельцу, администратору и менеджеру' using errcode = '42501';
  end if;

  with scoped_deals as (
    select deal.*
    from public.nav_deals_v2 deal
    where not (
      coalesce((deal.deal_summary ->> 'demo') = 'true', false)
      or coalesce((deal.wizard_snapshot ->> 'demo') = 'true', false)
      or coalesce(deal.title, '') like 'ДЕМО:%'
    )
      and (
        v_role in ('owner', 'admin')
        or deal.created_by = v_uid
        or deal.manager_id = v_uid
        or deal.seller_spn_id = v_uid
        or deal.buyer_spn_id = v_uid
        or exists (
          select 1
          from public.nav_deal_participants_v2 participant
          where participant.deal_id = deal.id
            and participant.user_id = v_uid
        )
        or exists (
          select 1
          from public.nav_user_profiles spn
          where spn.id in (deal.seller_spn_id, deal.buyer_spn_id)
            and spn.manager_id = v_uid
            and spn.is_active is true
        )
      )
  ), evaluated as (
    select
      deal.id as deal_id,
      deal.title as deal_title,
      deal.address,
      deal.status::text as deal_status,
      deal.created_at as deal_created_at,
      deal.updated_at as deal_updated_at,
      deal.manager_id as current_manager_id,
      current_manager.full_name as current_manager_name,
      current_manager.role::text as current_manager_role,
      current_manager.is_active as current_manager_active,
      deal.seller_spn_id,
      seller.full_name as seller_spn_name,
      seller.role::text as seller_profile_role,
      seller.is_active as seller_profile_active,
      seller.manager_id as seller_manager_id,
      seller_manager.full_name as seller_manager_name,
      seller_manager.role::text as seller_manager_role,
      seller_manager.is_active as seller_manager_active,
      deal.buyer_spn_id,
      buyer.full_name as buyer_spn_name,
      buyer.role::text as buyer_profile_role,
      buyer.is_active as buyer_profile_active,
      buyer.manager_id as buyer_manager_id,
      buyer_manager.full_name as buyer_manager_name,
      buyer_manager.role::text as buyer_manager_role,
      buyer_manager.is_active as buyer_manager_active,
      array(
        select distinct candidate_id
        from unnest(array[
          case
            when seller.role = 'spn'
              and seller.is_active is true
              and seller_manager.is_active is true
              and seller_manager.role in ('owner', 'admin', 'manager')
            then seller.manager_id
          end,
          case
            when buyer.role = 'spn'
              and buyer.is_active is true
              and buyer_manager.is_active is true
              and buyer_manager.role in ('owner', 'admin', 'manager')
            then buyer.manager_id
          end
        ]::uuid[]) candidate_id
        where candidate_id is not null
      ) as candidate_ids,
      array_remove(array[
        case
          when deal.seller_spn_id is null then 'seller_spn_missing'
          when seller.id is null then 'seller_profile_missing'
          when seller.is_active is not true then 'seller_profile_inactive'
          when seller.role <> 'spn' then 'seller_role_not_spn'
          when seller.manager_id is null then 'seller_manager_missing'
          when seller_manager.id is null then 'seller_manager_profile_missing'
          when seller_manager.is_active is not true then 'seller_manager_inactive'
          when seller_manager.role not in ('owner', 'admin', 'manager') then 'seller_manager_role_invalid'
        end,
        case
          when deal.buyer_spn_id is null then 'buyer_spn_missing'
          when buyer.id is null then 'buyer_profile_missing'
          when buyer.is_active is not true then 'buyer_profile_inactive'
          when buyer.role <> 'spn' then 'buyer_role_not_spn'
          when buyer.manager_id is null then 'buyer_manager_missing'
          when buyer_manager.id is null then 'buyer_manager_profile_missing'
          when buyer_manager.is_active is not true then 'buyer_manager_inactive'
          when buyer_manager.role not in ('owner', 'admin', 'manager') then 'buyer_manager_role_invalid'
        end
      ]::text[], null) as source_issues
    from scoped_deals deal
    left join public.nav_user_profiles current_manager
      on current_manager.id = deal.manager_id
    left join public.nav_user_profiles seller
      on seller.id = deal.seller_spn_id
    left join public.nav_user_profiles seller_manager
      on seller_manager.id = seller.manager_id
    left join public.nav_user_profiles buyer
      on buyer.id = deal.buyer_spn_id
    left join public.nav_user_profiles buyer_manager
      on buyer_manager.id = buyer.manager_id
  ), classified as (
    select
      evaluated.*,
      case
        when evaluated.current_manager_id is not null then 'already_assigned'
        when cardinality(evaluated.candidate_ids) = 1 then 'single_candidate'
        when cardinality(evaluated.candidate_ids) > 1 then 'conflict'
        else 'missing_source'
      end as proposal_state,
      case
        when evaluated.current_manager_id is not null then evaluated.current_manager_id
        when cardinality(evaluated.candidate_ids) = 1 then evaluated.candidate_ids[1]
        else null
      end as proposed_manager_id
    from evaluated
  ), prepared as (
    select
      classified.*,
      proposed_manager.full_name as proposed_manager_name,
      proposed_manager.role::text as proposed_manager_role,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', candidate.id,
            'full_name', candidate.full_name,
            'role', candidate.role
          )
          order by candidate.full_name, candidate.id
        )
        from public.nav_user_profiles candidate
        where candidate.id = any(classified.candidate_ids)
      ), '[]'::jsonb) as candidates,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'code', issue_code,
            'label', case issue_code
              when 'seller_spn_missing' then 'СПН продавца не назначен'
              when 'seller_profile_missing' then 'Профиль СПН продавца не найден'
              when 'seller_profile_inactive' then 'Профиль СПН продавца неактивен'
              when 'seller_role_not_spn' then 'В поле СПН продавца указан профиль другой роли'
              when 'seller_manager_missing' then 'У СПН продавца не указан менеджер'
              when 'seller_manager_profile_missing' then 'Профиль менеджера СПН продавца не найден'
              when 'seller_manager_inactive' then 'Менеджер СПН продавца неактивен'
              when 'seller_manager_role_invalid' then 'У менеджера СПН продавца неподходящая роль'
              when 'buyer_spn_missing' then 'СПН покупателя не назначен'
              when 'buyer_profile_missing' then 'Профиль СПН покупателя не найден'
              when 'buyer_profile_inactive' then 'Профиль СПН покупателя неактивен'
              when 'buyer_role_not_spn' then 'В поле СПН покупателя указан профиль другой роли'
              when 'buyer_manager_missing' then 'У СПН покупателя не указан менеджер'
              when 'buyer_manager_profile_missing' then 'Профиль менеджера СПН покупателя не найден'
              when 'buyer_manager_inactive' then 'Менеджер СПН покупателя неактивен'
              when 'buyer_manager_role_invalid' then 'У менеджера СПН покупателя неподходящая роль'
              else issue_code
            end
          )
          order by issue_code
        )
        from unnest(classified.source_issues) issue_code
      ), '[]'::jsonb) as source_issue_details,
      case classified.proposal_state
        when 'already_assigned' then 'Менеджер уже назначен'
        when 'single_candidate' then 'Найден один кандидат'
        when 'conflict' then 'Конфликт кандидатов'
        else 'Нет источника для предложения'
      end as proposal_state_label,
      case classified.proposal_state
        when 'already_assigned' then format(
          'В сделке уже указан менеджер: %s.',
          coalesce(classified.current_manager_name, 'профиль не найден')
        )
        when 'single_candidate' then format(
          'У назначенных СПН найден один общий активный менеджер: %s.',
          coalesce(proposed_manager.full_name, 'профиль не найден')
        )
        when 'conflict' then 'У СПН продавца и покупателя указаны разные активные менеджеры. Требуется решение владельца или администратора.'
        else 'Из назначенных СПН нельзя безопасно вывести менеджера. Сначала исправьте профиль или назначение СПН.'
      end as proposal_reason,
      case classified.proposal_state
        when 'already_assigned' then 'Проверить актуальность назначения; автоматических изменений нет.'
        when 'single_candidate' then 'Подтвердить кандидата вручную после проверки сделки; автоматическое назначение отключено.'
        when 'conflict' then 'Выбрать ответственного менеджера вручную и зафиксировать основание.'
        else 'Заполнить корректного СПН и его manager_id либо оформить явное исключение для сделки.'
      end as suggested_action
    from classified
    left join public.nav_user_profiles proposed_manager
      on proposed_manager.id = classified.proposed_manager_id
  ), limited as (
    select prepared.*
    from prepared
    order by
      case prepared.proposal_state
        when 'conflict' then 0
        when 'single_candidate' then 1
        when 'missing_source' then 2
        else 3
      end,
      prepared.deal_updated_at desc,
      prepared.deal_id
    limit v_limit
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'deal_id', item.deal_id,
        'deal_title', item.deal_title,
        'address', item.address,
        'deal_status', item.deal_status,
        'deal_created_at', item.deal_created_at,
        'deal_updated_at', item.deal_updated_at,
        'current_manager_id', item.current_manager_id,
        'current_manager_name', item.current_manager_name,
        'current_manager_role', item.current_manager_role,
        'current_manager_active', item.current_manager_active,
        'seller_spn_id', item.seller_spn_id,
        'seller_spn_name', item.seller_spn_name,
        'seller_profile_role', item.seller_profile_role,
        'seller_profile_active', item.seller_profile_active,
        'seller_manager_id', item.seller_manager_id,
        'seller_manager_name', item.seller_manager_name,
        'buyer_spn_id', item.buyer_spn_id,
        'buyer_spn_name', item.buyer_spn_name,
        'buyer_profile_role', item.buyer_profile_role,
        'buyer_profile_active', item.buyer_profile_active,
        'buyer_manager_id', item.buyer_manager_id,
        'buyer_manager_name', item.buyer_manager_name,
        'candidate_ids', to_jsonb(item.candidate_ids),
        'candidates', item.candidates,
        'candidate_count', cardinality(item.candidate_ids),
        'proposal_state', item.proposal_state,
        'proposal_state_label', item.proposal_state_label,
        'proposed_manager_id', item.proposed_manager_id,
        'proposed_manager_name', item.proposed_manager_name,
        'proposed_manager_role', item.proposed_manager_role,
        'source_issues', to_jsonb(item.source_issues),
        'source_issue_details', item.source_issue_details,
        'proposal_reason', item.proposal_reason,
        'suggested_action', item.suggested_action,
        'mutation_available', false,
        'card_url', format('./deal-card-v2.html?id=%s', item.deal_id)
      )
      order by
        case item.proposal_state
          when 'conflict' then 0
          when 'single_candidate' then 1
          when 'missing_source' then 2
          else 3
        end,
        item.deal_updated_at desc,
        item.deal_id
    ),
    '[]'::jsonb
  )
  into v_items
  from limited item;

  with scoped_deals as (
    select deal.*
    from public.nav_deals_v2 deal
    where not (
      coalesce((deal.deal_summary ->> 'demo') = 'true', false)
      or coalesce((deal.wizard_snapshot ->> 'demo') = 'true', false)
      or coalesce(deal.title, '') like 'ДЕМО:%'
    )
      and (
        v_role in ('owner', 'admin')
        or deal.created_by = v_uid
        or deal.manager_id = v_uid
        or deal.seller_spn_id = v_uid
        or deal.buyer_spn_id = v_uid
        or exists (
          select 1
          from public.nav_deal_participants_v2 participant
          where participant.deal_id = deal.id
            and participant.user_id = v_uid
        )
        or exists (
          select 1
          from public.nav_user_profiles spn
          where spn.id in (deal.seller_spn_id, deal.buyer_spn_id)
            and spn.manager_id = v_uid
            and spn.is_active is true
        )
      )
  ), evaluated as (
    select
      deal.id,
      deal.manager_id,
      array(
        select distinct candidate_id
        from unnest(array[
          case
            when seller.role = 'spn'
              and seller.is_active is true
              and seller_manager.is_active is true
              and seller_manager.role in ('owner', 'admin', 'manager')
            then seller.manager_id
          end,
          case
            when buyer.role = 'spn'
              and buyer.is_active is true
              and buyer_manager.is_active is true
              and buyer_manager.role in ('owner', 'admin', 'manager')
            then buyer.manager_id
          end
        ]::uuid[]) candidate_id
        where candidate_id is not null
      ) as candidate_ids,
      array_remove(array[
        case
          when deal.seller_spn_id is null then 'seller_spn_missing'
          when seller.id is null then 'seller_profile_missing'
          when seller.is_active is not true then 'seller_profile_inactive'
          when seller.role <> 'spn' then 'seller_role_not_spn'
          when seller.manager_id is null then 'seller_manager_missing'
          when seller_manager.id is null then 'seller_manager_profile_missing'
          when seller_manager.is_active is not true then 'seller_manager_inactive'
          when seller_manager.role not in ('owner', 'admin', 'manager') then 'seller_manager_role_invalid'
        end,
        case
          when deal.buyer_spn_id is null then 'buyer_spn_missing'
          when buyer.id is null then 'buyer_profile_missing'
          when buyer.is_active is not true then 'buyer_profile_inactive'
          when buyer.role <> 'spn' then 'buyer_role_not_spn'
          when buyer.manager_id is null then 'buyer_manager_missing'
          when buyer_manager.id is null then 'buyer_manager_profile_missing'
          when buyer_manager.is_active is not true then 'buyer_manager_inactive'
          when buyer_manager.role not in ('owner', 'admin', 'manager') then 'buyer_manager_role_invalid'
        end
      ]::text[], null) as source_issues
    from scoped_deals deal
    left join public.nav_user_profiles seller on seller.id = deal.seller_spn_id
    left join public.nav_user_profiles seller_manager on seller_manager.id = seller.manager_id
    left join public.nav_user_profiles buyer on buyer.id = deal.buyer_spn_id
    left join public.nav_user_profiles buyer_manager on buyer_manager.id = buyer.manager_id
  ), classified as (
    select
      evaluated.*,
      case
        when evaluated.manager_id is not null then 'already_assigned'
        when cardinality(evaluated.candidate_ids) = 1 then 'single_candidate'
        when cardinality(evaluated.candidate_ids) > 1 then 'conflict'
        else 'missing_source'
      end as proposal_state
    from evaluated
  )
  select jsonb_build_object(
    'deals_in_scope', count(*)::integer,
    'already_assigned', count(*) filter (where proposal_state = 'already_assigned')::integer,
    'single_candidate', count(*) filter (where proposal_state = 'single_candidate')::integer,
    'conflict', count(*) filter (where proposal_state = 'conflict')::integer,
    'missing_source', count(*) filter (where proposal_state = 'missing_source')::integer,
    'needs_owner_decision', count(*) filter (where proposal_state in ('conflict', 'missing_source'))::integer,
    'safe_candidate_available', count(*) filter (where proposal_state = 'single_candidate')::integer
  )
  into v_summary
  from classified;

  with item_issues as (
    select value ->> 'code' as issue_code
    from jsonb_array_elements(v_items) item
    cross join lateral jsonb_array_elements(item -> 'source_issue_details') value
  ), grouped as (
    select
      issue_code,
      max(case issue_code
        when 'seller_spn_missing' then 'СПН продавца не назначен'
        when 'seller_profile_missing' then 'Профиль СПН продавца не найден'
        when 'seller_profile_inactive' then 'Профиль СПН продавца неактивен'
        when 'seller_role_not_spn' then 'В поле СПН продавца указан профиль другой роли'
        when 'seller_manager_missing' then 'У СПН продавца не указан менеджер'
        when 'seller_manager_profile_missing' then 'Профиль менеджера СПН продавца не найден'
        when 'seller_manager_inactive' then 'Менеджер СПН продавца неактивен'
        when 'seller_manager_role_invalid' then 'У менеджера СПН продавца неподходящая роль'
        when 'buyer_spn_missing' then 'СПН покупателя не назначен'
        when 'buyer_profile_missing' then 'Профиль СПН покупателя не найден'
        when 'buyer_profile_inactive' then 'Профиль СПН покупателя неактивен'
        when 'buyer_role_not_spn' then 'В поле СПН покупателя указан профиль другой роли'
        when 'buyer_manager_missing' then 'У СПН покупателя не указан менеджер'
        when 'buyer_manager_profile_missing' then 'Профиль менеджера СПН покупателя не найден'
        when 'buyer_manager_inactive' then 'Менеджер СПН покупателя неактивен'
        when 'buyer_manager_role_invalid' then 'У менеджера СПН покупателя неподходящая роль'
        else issue_code
      end) as issue_label,
      count(*)::integer as deal_count
    from item_issues
    group by issue_code
  )
  select coalesce(
    jsonb_agg(to_jsonb(grouped) order by deal_count desc, issue_code),
    '[]'::jsonb
  )
  into v_issue_counts
  from grouped;

  return jsonb_build_object(
    'proposal_version', 1,
    'generated_at', now(),
    'preview_only', true,
    'mutation_available', false,
    'source_policy', 'assigned_spn_manager_id_only',
    'summary', v_summary,
    'issue_counts', v_issue_counts,
    'items', v_items,
    'decision_note', 'Предложение строится только из manager_id корректных активных СПН. Owner-профиль в поле СПН, отсутствующий СПН и пустой manager_id не превращаются в автоматическое назначение.'
  );
end;
$function$;

revoke all on function nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(integer) from public;
revoke execute on function nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(integer) from anon, authenticated;
grant execute on function nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(integer) to service_role;

comment on function nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(integer) is
  'Private read-only manager assignment proposal derived only from active SPN manager_id links; never mutates deals or profiles.';

create or replace function public.nav_v2_get_operational_adoption_report(
  p_days integer default 30,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_report jsonb;
  v_comparison jsonb;
  v_manager_proposal jsonb;
begin
  if v_uid is null then
    raise exception 'Сначала войдите в Навигатор' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.nav_user_profiles profile
    where profile.id = v_uid
      and profile.is_active is true
      and profile.role in (
        'owner'::public.nav_v2_user_role,
        'admin'::public.nav_v2_user_role,
        'manager'::public.nav_v2_user_role
      )
  ) then
    raise exception 'Отчёт внедрения доступен владельцу, администратору и менеджеру' using errcode = '42501';
  end if;

  v_report := nav_v2_private.nav_v2_get_operational_adoption_report_unchecked_20260713(
    p_days,
    p_limit
  );
  v_comparison := nav_v2_private.nav_v2_get_operational_adoption_period_comparison_unchecked_20260713(
    p_days
  );
  v_manager_proposal := nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(
    p_limit
  );

  return v_report || jsonb_build_object(
    'report_version', 3,
    'comparison', v_comparison,
    'manager_assignment_proposal', v_manager_proposal
  );
end;
$function$;

revoke all on function public.nav_v2_get_operational_adoption_report(integer, integer) from public;
revoke execute on function public.nav_v2_get_operational_adoption_report(integer, integer) from anon;
grant execute on function public.nav_v2_get_operational_adoption_report(integer, integer) to authenticated, service_role;

comment on function public.nav_v2_get_operational_adoption_report(integer, integer) is
  'Role-gated read-only adoption report with exact period comparison and non-mutating manager assignment proposal.';

do $assertions$
declare
  v_wrapper_definition text;
  v_private_definition text;
  v_public_execute boolean;
  v_anon_execute boolean;
  v_authenticated_execute boolean;
  v_private_authenticated_execute boolean;
begin
  select pg_get_functiondef(
    'public.nav_v2_get_operational_adoption_report(integer, integer)'::regprocedure
  ) into v_wrapper_definition;

  select pg_get_functiondef(
    'nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(integer)'::regprocedure
  ) into v_private_definition;

  if position('nav_v2_get_manager_assignment_proposal_unchecked_20260713' in v_wrapper_definition) = 0
    or position('manager_assignment_proposal' in v_wrapper_definition) = 0
    or position('report_version' in v_wrapper_definition) = 0 then
    raise exception 'Operational adoption manager proposal wrapper definition drifted';
  end if;

  if position('single_candidate' in v_private_definition) = 0
    or position('conflict' in v_private_definition) = 0
    or position('missing_source' in v_private_definition) = 0
    or position('mutation_available' in v_private_definition) = 0
    or position('assigned_spn_manager_id_only' in v_private_definition) = 0 then
    raise exception 'Manager assignment proposal definition drifted';
  end if;

  select has_function_privilege(
    'public',
    'public.nav_v2_get_operational_adoption_report(integer, integer)',
    'EXECUTE'
  ) into v_public_execute;
  select has_function_privilege(
    'anon',
    'public.nav_v2_get_operational_adoption_report(integer, integer)',
    'EXECUTE'
  ) into v_anon_execute;
  select has_function_privilege(
    'authenticated',
    'public.nav_v2_get_operational_adoption_report(integer, integer)',
    'EXECUTE'
  ) into v_authenticated_execute;
  select has_function_privilege(
    'authenticated',
    'nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(integer)',
    'EXECUTE'
  ) into v_private_authenticated_execute;

  if v_public_execute or v_anon_execute or not v_authenticated_execute then
    raise exception 'Operational adoption manager proposal wrapper grants drifted';
  end if;

  if v_private_authenticated_execute then
    raise exception 'Manager assignment proposal implementation must remain private';
  end if;
end
$assertions$;

notify pgrst, 'reload schema';
