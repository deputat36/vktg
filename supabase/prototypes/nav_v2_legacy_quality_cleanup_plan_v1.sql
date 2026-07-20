-- Repository-only deterministic cleanup decision planner.
-- Not a migration. Performs no business DML and must not be applied to production without approval.

create or replace function nav_v2_private.nav_v2_classify_legacy_quality_task_v1(
  p_source text,
  p_representation text,
  p_preparation_mode text,
  p_has_address boolean,
  p_has_cadastral boolean,
  p_has_seller_spn boolean,
  p_has_buyer_spn boolean
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path = pg_catalog
as $function$
declare
  v_rep text := coalesce(nullif(btrim(p_representation), ''), 'unknown');
  v_classification text;
  v_action text;
  v_replacement text;
begin
  case p_source
    when 'auto_quality_seller_name', 'auto_quality_buyer_name' then
      v_classification := 'obsolete_privacy_conflict';
      v_action := 'close_only_after_replacement_deployed_and_owner_approved';
      v_replacement := null;
    when 'auto_quality_address' then
      if coalesce(p_has_address, false) or coalesce(p_has_cadastral, false) then
        v_classification := 'resolved_under_new_contract';
        v_action := 'close_after_reconciliation';
        v_replacement := null;
      else
        v_classification := 'replace_object_context';
        v_action := 'close_legacy_then_create_bounded_replacement';
        v_replacement := 'auto_quality_object_context';
      end if;
    when 'auto_quality_responsible_spn' then
      if v_rep = 'unknown' or v_rep not in ('seller','buyer','both','one_spn_both','partner_agency') then
        v_classification := 'replace_representation';
        v_action := 'close_legacy_then_create_bounded_replacement';
        v_replacement := 'auto_quality_representation';
      elsif v_rep = 'partner_agency' then
        v_classification := 'replace_representation';
        v_action := 'close_legacy_then_create_bounded_replacement';
        v_replacement := 'auto_quality_representation';
      elsif v_rep = 'seller' and not coalesce(p_has_seller_spn, false) then
        v_classification := 'replace_seller_spn';
        v_action := 'close_legacy_then_create_bounded_replacement';
        v_replacement := 'auto_quality_seller_spn';
      elsif v_rep = 'buyer' and not coalesce(p_has_buyer_spn, false) then
        v_classification := 'replace_buyer_spn';
        v_action := 'close_legacy_then_create_bounded_replacement';
        v_replacement := 'auto_quality_buyer_spn';
      elsif v_rep = 'both' and not coalesce(p_has_seller_spn, false) and not coalesce(p_has_buyer_spn, false) then
        v_classification := 'replace_both_spn';
        v_action := 'close_legacy_then_create_two_bounded_replacements';
        v_replacement := 'auto_quality_seller_spn,auto_quality_buyer_spn';
      elsif v_rep = 'both' and not coalesce(p_has_seller_spn, false) then
        v_classification := 'replace_seller_spn';
        v_action := 'close_legacy_then_create_bounded_replacement';
        v_replacement := 'auto_quality_seller_spn';
      elsif v_rep = 'both' and not coalesce(p_has_buyer_spn, false) then
        v_classification := 'replace_buyer_spn';
        v_action := 'close_legacy_then_create_bounded_replacement';
        v_replacement := 'auto_quality_buyer_spn';
      elsif v_rep = 'one_spn_both' and not coalesce(p_has_seller_spn, false) and not coalesce(p_has_buyer_spn, false) then
        v_classification := 'replace_both_spn';
        v_action := 'close_legacy_then_create_two_bounded_replacements';
        v_replacement := 'auto_quality_seller_spn,auto_quality_buyer_spn';
      elsif v_rep = 'one_spn_both' and (not coalesce(p_has_seller_spn, false) or not coalesce(p_has_buyer_spn, false)) then
        v_classification := 'replace_one_spn_consistency';
        v_action := 'close_legacy_then_create_bounded_replacement';
        v_replacement := 'auto_quality_one_spn_consistency';
      else
        v_classification := 'resolved_under_new_contract';
        v_action := 'close_after_reconciliation';
        v_replacement := null;
      end if;
    else
      v_classification := 'manual_review';
      v_action := 'no_automatic_action';
      v_replacement := null;
  end case;

  return jsonb_build_object(
    'classification', v_classification,
    'proposed_action', v_action,
    'replacement_source', v_replacement
  );
end;
$function$;

create or replace function nav_v2_private.nav_v2_plan_legacy_quality_cleanup_v1()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, nav_v2_private
as $function$
with candidates as (
  select
    t.id as task_id,
    t.deal_id,
    t.source,
    t.status::text as status,
    case
      when t.created_at >= clock_timestamp() - interval '7 days' then '0_7_days'
      when t.created_at >= clock_timestamp() - interval '30 days' then '8_30_days'
      else 'over_30_days'
    end as age_bucket,
    nav_v2_private.nav_v2_classify_legacy_quality_task_v1(
      t.source,
      d.representation_model,
      d.preparation_mode,
      nullif(btrim(coalesce(d.address, '')), '') is not null,
      nullif(btrim(coalesce(d.cadastral_number, '')), '') is not null,
      d.seller_spn_id is not null,
      d.buyer_spn_id is not null
    ) as decision
  from public.nav_deal_tasks_v2 t
  join public.nav_deals_v2 d on d.id = t.deal_id
  where t.source in (
    'auto_quality_seller_name', 'auto_quality_buyer_name',
    'auto_quality_address', 'auto_quality_responsible_spn'
  )
    and t.status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status)
), items as (
  select jsonb_build_object(
    'task_id', task_id,
    'deal_id', deal_id,
    'source', source,
    'status', status,
    'age_bucket', age_bucket,
    'classification', decision->>'classification',
    'proposed_action', decision->>'proposed_action',
    'replacement_source', decision->>'replacement_source'
  ) as item
  from candidates
  order by source, deal_id, task_id
), summary as (
  select
    count(*)::integer as total,
    coalesce(jsonb_object_agg(classification, row_count order by classification), '{}'::jsonb) as by_classification
  from (
    select decision->>'classification' as classification, count(*)::integer as row_count
    from candidates
    group by decision->>'classification'
  ) grouped
)
select jsonb_build_object(
  'contract_version', 1,
  'repository_only', true,
  'writes_performed', false,
  'production_ready', false,
  'selected_option', null,
  'inventory', jsonb_build_object(
    'total', coalesce((select total from summary), 0),
    'by_classification', coalesce((select by_classification from summary), '{}'::jsonb)
  ),
  'items', coalesce((select jsonb_agg(item) from items), '[]'::jsonb),
  'owner_options', jsonb_build_array(
    jsonb_build_object('id','gradual_on_touch','recommended',true,'requires_deployment',true,'requires_cleanup_approval',true),
    jsonb_build_object('id','one_time_name_only_after_deploy','recommended',false,'requires_deployment',true,'requires_cleanup_approval',true),
    jsonb_build_object('id','controlled_reconciliation_after_deploy','recommended',false,'requires_deployment',true,'requires_cleanup_approval',true)
  ),
  'mandatory_stops', jsonb_build_array(
    'selected_option_missing',
    'privacy_aligned_replacement_not_deployed',
    'authenticated_role_matrix_not_run',
    'owner_cleanup_approval_missing',
    'deployment_approval_missing',
    'rollback_attestation_missing'
  )
);
$function$;

revoke all on function nav_v2_private.nav_v2_classify_legacy_quality_task_v1(text,text,text,boolean,boolean,boolean,boolean)
  from public, anon, authenticated;
revoke all on function nav_v2_private.nav_v2_plan_legacy_quality_cleanup_v1()
  from public, anon, authenticated;
grant execute on function nav_v2_private.nav_v2_classify_legacy_quality_task_v1(text,text,text,boolean,boolean,boolean,boolean)
  to service_role;
grant execute on function nav_v2_private.nav_v2_plan_legacy_quality_cleanup_v1()
  to service_role;
