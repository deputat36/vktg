-- Synthetic production-like legacy RPC signatures for the migration storyboard harness.
-- This file is used only in ephemeral PostgreSQL 17 CI and is never applied to Supabase.
-- The functions are not called by the preflight and contain no table mutations.

create or replace function public.nav_v2_add_task(
  p_deal_id uuid,
  p_title text,
  p_description text default null,
  p_assigned_role public.nav_v2_user_role default null,
  p_priority public.nav_v2_task_priority default 'normal'::public.nav_v2_task_priority,
  p_source text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  return;
end;
$$;

create or replace function public.nav_v2_update_task_status(
  p_task_id uuid,
  p_status public.nav_v2_task_status
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'task_id', p_task_id, 'status', p_status);
$$;

create or replace function public.nav_v2_get_deal_card_lite(p_deal_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'dto_version', 1,
    'task_contract_aware', false,
    'deal_id', p_deal_id
  );
$$;

revoke execute on function public.nav_v2_add_task(
  uuid, text, text, public.nav_v2_user_role, public.nav_v2_task_priority, text
) from public, anon;
revoke execute on function public.nav_v2_update_task_status(uuid, public.nav_v2_task_status)
  from public, anon;
revoke execute on function public.nav_v2_get_deal_card_lite(uuid) from public, anon;

grant execute on function public.nav_v2_add_task(
  uuid, text, text, public.nav_v2_user_role, public.nav_v2_task_priority, text
) to authenticated, service_role;
grant execute on function public.nav_v2_update_task_status(uuid, public.nav_v2_task_status)
  to authenticated, service_role;
grant execute on function public.nav_v2_get_deal_card_lite(uuid) to authenticated, service_role;

select 'Synthetic production-like legacy RPC signatures created' as result;
