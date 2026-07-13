create or replace function nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(
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
  v_all_items jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
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
    raise exception 'План исправления источников доступен владельцу, администратору и менеджеру' using errcode = '42501';
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
  ), sources as (
    select
      deal.id as deal_id,
      deal.title as deal_title,
      deal.address,
      'seller'::text as side,
      'seller_spn_id'::text as side_field,
      deal.seller_spn_id as assigned_spn_id,
      spn.id as profile_id,
      spn.full_name as profile_name,
      spn.role::text as profile_role,
      spn.is_active as profile_active,
      spn.manager_id,
      manager.id as manager_profile_id,
      manager.full_name as manager_name,
      manager.role::text as manager_role,
      manager.is_active as manager_active
    from scoped_deals deal
    left join public.nav_user_profiles spn on spn.id = deal.seller_spn_id
    left join public.nav_user_profiles manager on manager.id = spn.manager_id

    union all

    select
      deal.id,
      deal.title,
      deal.address,
      'buyer',
      'buyer_spn_id',
      deal.buyer_spn_id,
      spn.id,
      spn.full_name,
      spn.role::text,
      spn.is_active,
      spn.manager_id,
      manager.id,
      manager.full_name,
      manager.role::text,
      manager.is_active
    from scoped_deals deal
    left join public.nav_user_profiles spn on spn.id = deal.buyer_spn_id
    left join public.nav_user_profiles manager on manager.id = spn.manager_id
  ), classified as (
    select
      source.*,
      case
        when source.assigned_spn_id is null then 'deal_spn_missing'
        when source.profile_id is null then 'deal_spn_profile_missing'
        when source.profile_active is not true then 'deal_spn_profile_inactive'
        when source.profile_role <> 'spn' then 'deal_field_points_to_non_spn'
        when source.manager_id is null then 'profile_manager_missing'
        when source.manager_profile_id is null then 'profile_manager_profile_missing'
        when source.manager_active is not true then 'profile_manager_inactive'
        when source.manager_role not in ('owner', 'admin', 'manager') then 'profile_manager_role_invalid'
        else 'ok'
      end as remediation_code
    from sources source
  ), actionable as (
    select
      classified.*,
      case
        when remediation_code like 'profile_manager_%' then 'profile_field'
        else 'deal_field_group'
      end as target_kind,
      profile_id as target_profile_id,
      case
        when remediation_code like 'profile_manager_%' then 'manager_id'
        else side_field
      end as target_field,
      case remediation_code
        when 'deal_field_points_to_non_spn' then 1
        when 'deal_spn_profile_missing' then 1
        when 'deal_spn_profile_inactive' then 1
        when 'profile_manager_missing' then 2
        when 'profile_manager_profile_missing' then 2
        when 'profile_manager_inactive' then 2
        when 'profile_manager_role_invalid' then 2
        when 'deal_spn_missing' then 3
        else 4
      end as priority_order,
      case remediation_code
        when 'deal_field_points_to_non_spn' then 'В поле СПН указан профиль другой роли'
        when 'deal_spn_profile_missing' then 'Профиль указанного СПН не найден'
        when 'deal_spn_profile_inactive' then 'Указанный СПН неактивен'
        when 'profile_manager_missing' then 'У профиля СПН не указан менеджер'
        when 'profile_manager_profile_missing' then 'Профиль менеджера СПН не найден'
        when 'profile_manager_inactive' then 'Менеджер профиля СПН неактивен'
        when 'profile_manager_role_invalid' then 'У менеджера СПН неподходящая роль'
        when 'deal_spn_missing' then 'СПН стороны сделки не назначен'
        else 'Источник менеджера требует проверки'
      end as remediation_label
    from classified
    where remediation_code <> 'ok'
  ), distinct_deal_refs as (
    select distinct
      remediation_code,
      remediation_label,
      target_kind,
      target_profile_id,
      target_field,
      profile_name,
      profile_role,
      priority_order,
      deal_id,
      deal_title,
      address,
      side_field
    from actionable
  ), grouped as (
    select
      remediation_code,
      max(remediation_label) as remediation_label,
      target_kind,
      target_profile_id,
      target_field,
      max(profile_name) as current_profile_name,
      max(profile_role) as current_profile_role,
      min(priority_order) as priority_order,
      count(*)::integer as affected_deal_sides,
      count(distinct deal_id)::integer as affected_deals,
      jsonb_agg(
        jsonb_build_object(
          'deal_id', deal_id,
          'deal_title', deal_title,
          'address', address,
          'side_field', side_field,
          'card_url', format('./deal-card-v2.html?id=%s', deal_id)
        )
        order by deal_title nulls last, deal_id, side_field
      ) as deal_refs
    from distinct_deal_refs
    group by
      remediation_code,
      target_kind,
      target_profile_id,
      target_field
  ), prepared as (
    select
      grouped.*,
      case priority_order
        when 1 then 'Сначала'
        when 2 then 'Затем'
        when 3 then 'После проверки сторон'
        else 'Дополнительно'
      end as priority_label,
      case priority_order
        when 1 then 'urgent'
        when 2 then 'high'
        else 'normal'
      end as priority,
      case remediation_code
        when 'deal_field_points_to_non_spn' then format(
          'Заменить неверный профиль в поле %s',
          target_field
        )
        when 'deal_spn_profile_missing' then format(
          'Заменить отсутствующий профиль в поле %s',
          target_field
        )
        when 'deal_spn_profile_inactive' then format(
          'Заменить неактивного СПН в поле %s',
          target_field
        )
        when 'profile_manager_missing' then 'Указать manager_id профиля СПН'
        when 'profile_manager_profile_missing' then 'Исправить ссылку manager_id профиля СПН'
        when 'profile_manager_inactive' then 'Назначить активного менеджера профилю СПН'
        when 'profile_manager_role_invalid' then 'Назначить менеджера допустимой роли профилю СПН'
        when 'deal_spn_missing' then format(
          'Заполнить отсутствующее поле %s',
          target_field
        )
        else 'Исправить источник ответственного менеджера'
      end as action_title,
      case remediation_code
        when 'deal_field_points_to_non_spn' then
          'Не меняйте роль текущего профиля. В затронутых сделках выберите корректного активного СПН соответствующей стороны.'
        when 'deal_spn_profile_missing' then
          'Проверьте неверный идентификатор и назначьте существующего активного СПН.'
        when 'deal_spn_profile_inactive' then
          'Назначьте активного СПН; не активируйте профиль автоматически без подтверждения владельца.'
        when 'profile_manager_missing' then
          'После подтверждения владельца заполните manager_id профиля СПН и повторно проверьте связанные сделки.'
        when 'profile_manager_profile_missing' then
          'Исправьте manager_id профиля СПН на существующий активный профиль допустимой роли.'
        when 'profile_manager_inactive' then
          'Назначьте профилю СПН активного менеджера после подтверждения владельца.'
        when 'profile_manager_role_invalid' then
          'Укажите в manager_id профиль роли owner, admin или manager после проверки полномочий.'
        when 'deal_spn_missing' then
          'Определите фактического СПН стороны и заполните поле в каждой сделке после ручной проверки.'
        else 'Проверьте источник вручную и зафиксируйте основание изменения.'
      end as safe_action,
      greatest(0, jsonb_array_length(deal_refs) - 5) as more_deals_count,
      (
        select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
        from jsonb_array_elements(deal_refs) with ordinality
        where ordinality <= 5
      ) as preview_deals
    from grouped
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'remediation_code', item.remediation_code,
        'remediation_label', item.remediation_label,
        'target_kind', item.target_kind,
        'target_profile_id', item.target_profile_id,
        'target_field', item.target_field,
        'current_profile_name', item.current_profile_name,
        'current_profile_role', item.current_profile_role,
        'priority', item.priority,
        'priority_order', item.priority_order,
        'priority_label', item.priority_label,
        'action_title', item.action_title,
        'safe_action', item.safe_action,
        'affected_deal_sides', item.affected_deal_sides,
        'affected_deals', item.affected_deals,
        'preview_deals', item.preview_deals,
        'more_deals_count', item.more_deals_count,
        'mutation_available', false
      )
      order by item.priority_order, item.affected_deals desc, item.remediation_code, item.target_field
    ),
    '[]'::jsonb
  )
  into v_all_items
  from prepared item;

  with expanded as (
    select value, ordinality
    from jsonb_array_elements(v_all_items) with ordinality
    order by ordinality
    limit v_limit
  )
  select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
  into v_items
  from expanded;

  with groups as (
    select value as item
    from jsonb_array_elements(v_all_items)
  ), affected as (
    select distinct deal_id
    from actionable
  )
  select jsonb_build_object(
    'remediation_groups', count(*)::integer,
    'urgent_groups', count(*) filter (where item ->> 'priority' = 'urgent')::integer,
    'high_groups', count(*) filter (where item ->> 'priority' = 'high')::integer,
    'normal_groups', count(*) filter (where item ->> 'priority' = 'normal')::integer,
    'affected_deals', (select count(*)::integer from affected),
    'mutation_available', false
  )
  into v_summary
  from groups;

  return jsonb_build_object(
    'plan_version', 1,
    'generated_at', now(),
    'preview_only', true,
    'mutation_available', false,
    'summary', v_summary,
    'items', v_items,
    'execution_order', jsonb_build_array(
      'Заменить профили неподходящей роли в полях СПН сделок.',
      'Исправить manager_id корректных активных СПН.',
      'Заполнить отсутствующих СПН сторон сделок.',
      'Повторно открыть предложение менеджера и проверить появление single_candidate или conflict.'
    ),
    'decision_note', 'План группирует только выявленные источники ошибки. Он не выбирает нового СПН или менеджера и не меняет данные.'
  );
end;
$function$;

revoke all on function nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(integer) from public;
revoke execute on function nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(integer) from anon, authenticated;
grant execute on function nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(integer) to service_role;

comment on function nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(integer) is
  'Private read-only grouped remediation plan for invalid SPN and manager sources; never chooses replacements or mutates production data.';

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
  v_remediation_plan jsonb;
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
  v_remediation_plan := nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(
    p_limit
  );

  return v_report || jsonb_build_object(
    'report_version', 4,
    'comparison', v_comparison,
    'manager_assignment_proposal', v_manager_proposal,
    'manager_source_remediation_plan', v_remediation_plan
  );
end;
$function$;

revoke all on function public.nav_v2_get_operational_adoption_report(integer, integer) from public;
revoke execute on function public.nav_v2_get_operational_adoption_report(integer, integer) from anon;
grant execute on function public.nav_v2_get_operational_adoption_report(integer, integer) to authenticated, service_role;

comment on function public.nav_v2_get_operational_adoption_report(integer, integer) is
  'Role-gated read-only adoption report with exact period comparison, manager proposal and grouped source remediation plan.';

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
    'nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(integer)'::regprocedure
  ) into v_private_definition;

  if position('nav_v2_get_manager_source_remediation_plan_unchecked_20260713' in v_wrapper_definition) = 0
    or position('manager_source_remediation_plan' in v_wrapper_definition) = 0
    or position('report_version' in v_wrapper_definition) = 0 then
    raise exception 'Operational adoption remediation wrapper definition drifted';
  end if;

  if position('deal_field_points_to_non_spn' in v_private_definition) = 0
    or position('profile_manager_missing' in v_private_definition) = 0
    or position('deal_spn_missing' in v_private_definition) = 0
    or position('execution_order' in v_private_definition) = 0
    or position('mutation_available' in v_private_definition) = 0 then
    raise exception 'Manager source remediation plan definition drifted';
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
    'nav_v2_private.nav_v2_get_manager_source_remediation_plan_unchecked_20260713(integer)',
    'EXECUTE'
  ) into v_private_authenticated_execute;

  if v_public_execute or v_anon_execute or not v_authenticated_execute then
    raise exception 'Operational adoption remediation wrapper grants drifted';
  end if;

  if v_private_authenticated_execute then
    raise exception 'Manager source remediation implementation must remain private';
  end if;
end
$assertions$;

notify pgrst, 'reload schema';
