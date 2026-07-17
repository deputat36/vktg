-- Repository-only rollback for actor-aware overloads.
-- Canonical bounded contract/mutations and all task/audit rows remain unchanged.

\set ON_ERROR_STOP on

drop function if exists public.nav_v2_create_bounded_tasks(uuid, jsonb, uuid, uuid);
drop function if exists public.nav_v2_start_bounded_task(uuid, uuid, uuid);
drop function if exists public.nav_v2_complete_bounded_task(uuid, uuid, uuid, uuid);
drop function if exists public.nav_v2_set_bounded_task_active_outcome(uuid, text, text, date, uuid, uuid);
drop function if exists public.nav_v2_propose_bounded_task_terminal_outcome(uuid, text, text, uuid, uuid, uuid);
drop function if exists public.nav_v2_decide_bounded_task_terminal_outcome(uuid, text, uuid, uuid);

drop function if exists nav_v2_private.nav_v2_actor_claim_restore(text);
drop function if exists nav_v2_private.nav_v2_assert_actor_replay(uuid, text, uuid);
drop function if exists nav_v2_private.nav_v2_require_verified_actor(uuid);

select 'PostgreSQL actor-aware bounded task overlay rollback completed' as result;
