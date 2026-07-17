-- Synthetic production-like legacy RPC signature for the migration storyboard harness.
-- This file is used only in ephemeral PostgreSQL 17 CI and is never applied to Supabase.

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

revoke execute on function public.nav_v2_get_deal_card_lite(uuid) from public, anon;
grant execute on function public.nav_v2_get_deal_card_lite(uuid) to authenticated, service_role;

select 'Synthetic production-like lite RPC signature created' as result;
