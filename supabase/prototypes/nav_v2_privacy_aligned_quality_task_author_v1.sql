-- Apply immediately after nav_v2_privacy_aligned_quality_completeness_v1.sql.
-- Keeps task authorship separate from assignment while preserving the helper signature.

create or replace function nav_v2_private.nav_v2_quality_sync_task_v1(
  p_deal_id uuid,
  p_required boolean,
  p_source text,
  p_title text,
  p_description text,
  p_assigned_to uuid,
  p_assigned_role public.nav_v2_user_role,
  p_priority public.nav_v2_task_priority,
  p_task_type text,
  p_sla_days integer
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public, nav_v2_private
as $function$
declare
  v_rows integer := 0;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_closed integer := 0;
  v_created_by uuid;
begin
  if p_source is null or p_source not like 'auto_quality_%' then
    raise exception 'Quality task source is invalid' using errcode = '22023';
  end if;
  if p_task_type <> all(array[
    'operational_task', 'document_request', 'quality_warning', 'system_recommendation',
    'legal_blocker', 'broker_task', 'management_escalation'
  ]) then
    raise exception 'Quality task type is invalid' using errcode = '22023';
  end if;

  select created_by into v_created_by
  from public.nav_deals_v2
  where id = p_deal_id;
  if v_created_by is null then
    raise exception 'Quality task deal creator is missing' using errcode = '23502';
  end if;

  if p_required is not true then
    update public.nav_deal_tasks_v2
    set status = 'done'::public.nav_v2_task_status,
        completed_at = coalesce(completed_at, clock_timestamp()),
        updated_at = clock_timestamp()
    where deal_id = p_deal_id
      and source = p_source
      and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status);
    get diagnostics v_closed = row_count;
    return jsonb_build_object('inserted', 0, 'updated', 0, 'closed', v_closed);
  end if;

  update public.nav_deal_tasks_v2
  set title = p_title,
      description = p_description,
      assigned_to = p_assigned_to,
      assigned_role = p_assigned_role,
      priority = p_priority,
      task_type = p_task_type,
      sla_days = p_sla_days,
      updated_at = clock_timestamp()
  where deal_id = p_deal_id
    and source = p_source
    and status in ('open'::public.nav_v2_task_status, 'in_progress'::public.nav_v2_task_status);
  get diagnostics v_rows = row_count;
  v_updated := v_rows;

  if v_rows = 0 then
    insert into public.nav_deal_tasks_v2 (
      deal_id, title, description, assigned_to, assigned_role, status, priority,
      due_date, source, created_by, task_type, sla_days
    ) values (
      p_deal_id, p_title, p_description, p_assigned_to, p_assigned_role,
      'open'::public.nav_v2_task_status, p_priority, null, p_source,
      v_created_by, p_task_type, p_sla_days
    );
    v_inserted := 1;
  end if;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'closed', 0);
end;
$function$;

revoke all on function nav_v2_private.nav_v2_quality_sync_task_v1(
  uuid, boolean, text, text, text, uuid, public.nav_v2_user_role,
  public.nav_v2_task_priority, text, integer
) from public, anon, authenticated;
grant execute on function nav_v2_private.nav_v2_quality_sync_task_v1(
  uuid, boolean, text, text, text, uuid, public.nav_v2_user_role,
  public.nav_v2_task_priority, text, integer
) to service_role;
