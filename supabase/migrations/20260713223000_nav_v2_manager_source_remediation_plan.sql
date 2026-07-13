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
  v_proposal jsonb := '{}'::jsonb;
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

  v_proposal := nav_v2_private.nav_v2_get_manager_assignment_proposal_unchecked_20260713(500);

  with proposal_items as (
    select item
    from jsonb_array_elements(coalesce(v_proposal -> 'items', '[]'::jsonb)) item
  ), issue_rows as (
    select
      (proposal.item ->> 'deal_id')::uuid as deal_id,
      proposal.item ->> 'deal_title' as deal_title,
      proposal.item ->> 'address' as address,
      issue ->> 'code' as remediation_code,
      issue ->> 'label' as remediation_label,
      case
        when issue ->> 'code' like 'seller_%' then 'seller_spn_id'
        when issue ->> 'code' like 'buyer_%' then 'buyer_spn_id'
        else null
      end as side_field,
      case
        when issue ->> 'code' like 'seller_%' then nullif(proposal.item ->> 'seller_spn_id', '')::uuid
        when issue ->> 'code' like 'buyer_%' then nullif(proposal.item ->> 'buyer_spn_id', '')::uuid
        else null
      end as current_profile_id,
      case
        when issue ->> 'code' like 'seller_%' then proposal.item ->> 'seller_spn_name'
        when issue ->> 'code' like 'buyer_%' then proposal.item ->> 'buyer_spn_name'
        else null
      end as current_profile_name,
      case
        when issue ->> 'code' like 'seller_%' then proposal.item ->> 'seller_profile_role'
        when issue ->> 'code' like 'buyer_%' then proposal.item ->> 'buyer_profile_role'
        else null
      end as current_profile_role,
      case
        when issue ->> 'code' in (
          'seller_manager_missing',
          'seller_manager_profile_missing',
          'seller_manager_inactive',
          'seller_manager_role_invalid',
          'buyer_manager_missing',
          'buyer_manager_profile_missing',
          'buyer_manager_inactive',
          'buyer_manager_role_invalid'
        ) then 'profile_field'
        else 'deal_field_group'
      end as target_kind,
      case
        when issue ->> 'code' in (
          'seller_manager_missing',
          'seller_manager_profile_missing',
          'seller_manager_inactive',
          'seller_manager_role_invalid',
          'buyer_manager_missing',
          'buyer_manager_profile_missing',
          'buyer_manager_inactive',
          'buyer_manager_role_invalid'
        ) then 'manager_id'
        when issue ->> 'code' like 'seller_%' then 'seller_spn_id'
        when issue ->> 'code' like 'buyer_%' then 'buyer_spn_id'
        else null
      end as target_field
    from proposal_items proposal
    cross join lateral jsonb_array_elements(
      coalesce(proposal.item -> 'source_issue_details', '[]'::jsonb)
    ) issue
  ), normalized as (
    select
      issue_rows.*,
      case
        when target_kind = 'profile_field' then current_profile_id
        else current_profile_id
      end as target_profile_id,
      case remediation_code
        when 'seller_role_not_spn' then 1
        when 'buyer_role_not_spn' then 1
        when 'seller_profile_missing' then 1
        when 'buyer_profile_missing' then 1
        when 'seller_profile_inactive' then 1
        when 'buyer_profile_inactive' then 1
        when 'seller_manager_missing' then 2
        when 'buyer_manager_missing' then 2
        when 'seller_manager_profile_missing' then 2
        when 'buyer_manager_profile_missing' then 2
        when 'seller_manager_inactive' then 2
        when 'buyer_manager_inactive' then 2
        when 'seller_manager_role_invalid' then 2
        when 'buyer_manager_role_invalid' then 2
        when 'seller_spn_missing' then 3
        when 'buyer_spn_missing' then 3
        else 4
      end as priority_order,
      case remediation_code
        when 'seller_role_not_spn' then 'Заменить неверный профиль в поле СПН продавца'
        when 'buyer_role_not_spn' then 'Заменить неверный профиль в поле СПН покупателя'
        when 'seller_profile_missing' then 'Восстановить профиль или заменить СПН продавца'
        when 'buyer_profile_missing' then 'Восстановить профиль или заменить СПН покупателя'
        when 'seller_profile_inactive' then 'Заменить неактивного СПН продавца'
        when 'buyer_profile_inactive' then 'Заменить неактивного СПН покупателя'
        when 'seller_manager_missing' then 'Указать менеджера в профиле СПН'
        when 'buyer_manager_missing' then 'Указать менеджера в профиле СПН'
        when 'seller_manager_profile_missing' then 'Исправить ссылку на профиль менеджера СПН'
        when 'buyer_manager_profile_missing' then 'Исправить ссылку на профиль менеджера СПН'
        when 'seller_manager_inactive' then 'Назначить активного менеджера профилю СПН'
        when 'buyer_manager_inactive' then 'Назначить активного менеджера профилю СПН'
        when 'seller_manager_role_invalid' then 'Назначить профиль допустимой роли менеджером СПН'
        when 'buyer_manager_role_invalid' then 'Назначить профиль допустимой роли менеджером СПН'
        when 'seller_spn_missing' then 'Заполнить СПН продавца в сделках'
        when 'buyer_spn_missing' then 'Заполнить СПН покупателя в сделках'
        else 'Исправить источник ответственного менеджера'
      end as action_title,
      case
        when remediation_code in ('seller_role_not_spn', 'buyer_role_not_spn') then
          'Не меняйте роль текущего профиля. В каждой затронутой сделке выберите корректного активного СПН для соответствующей стороны.'
        when remediation_code in ('seller_profile_missing', 'buyer_profile_missing') then
          'Проверьте удалённый или неверный идентификатор профиля и назначьте существующего активного СПН.'
        when remediation_code in ('seller_profile_inactive', 'buyer_profile_inactive') then
          'Назначьте активного СПН; не активируйте профиль автоматически без подтверждения владельца.'
        when remediation_code in (
          'seller_manager_missing',
          'buyer_manager_missing',
          'seller_manager_profile_missing',
          'buyer_manager_profile_missing',
          'seller_manager_inactive',
          'buyer_manager_inactive',
          'seller_manager_role_invalid',
          'buyer_manager_role_invalid'
        ) then
          'После подтверждения владельца исправьте manager_id профиля СПН. Затем повторно проверьте предложение по всем связанным сделкам.'
        when remediation_code in ('seller_spn_missing', 'buyer_spn_missing') then
          'Определите фактического СПН стороны и заполните поле в каждой сделке после ручной проверки.'
        else 'Проверьте источник вручную и зафиксируйте основание изменения.'
      end as safe_action
    from issue_rows
  ), distinct_deal_refs as (
    select distinct
      remediation_code,
      target_kind,
      target_profile_id,
      target_field,
      current_profile_name,
      current_profile_role,
      priority_order,
      action_title,
      safe_action,
      deal_id,
      deal_title,
      address,
      side_field
    from normalized
  ), grouped as (
    select
      remediation_code,
      max(remediation_label) as remediation_label,
      target_kind,
      target_profile_id,
      target_field,
      max(current_profile_name) as current_profile_name,
      max(current_profile_role) as current_profile_role,
      min(priority_order) as priority_order,
      max(action_title) as action_title,
      max(safe_action) as safe_action,
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
  ), affected_deals as (
    select distinct (deal ->> 'deal_id')::uuid as deal_id
    from groups
    cross join lateral jsonb_array_elements(item -> 'preview_deals') deal
    union
    select distinct (proposal_item ->> 'deal_id')::uuid
    from jsonb_array_elements(coalesce(v_proposal -> 'items', '[]'::jsonb)) proposal_item
    where jsonb_array_length(coalesce(proposal_item -> 'source_issue_details', '[]'::jsonb)) > 0
  )
  select jsonb_build_object(
    'remediation_groups', count(*)::integer,
    'urgent_groups', count(*) filter (where item ->> 'priority' = 'urgent')::integer,
    'high_groups', count(*) filter (where item ->> 'priority' = 'high')::integer,
    'normal_groups', count(*) filter (where item ->> 'priority' = 'normal')::integer,
    'affected_deals', (select count(*)::integer from affected_deals),
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
      'Повторно открыть предложение менеджера и проверить появление single_candidate/conflict.'
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
