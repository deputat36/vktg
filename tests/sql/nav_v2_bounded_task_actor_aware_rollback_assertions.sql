\set ON_ERROR_STOP on

do $$
begin
  if to_regprocedure('public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid,uuid)') is not null
     or to_regprocedure('public.nav_v2_start_bounded_task(uuid,uuid,uuid)') is not null
     or to_regprocedure('public.nav_v2_complete_bounded_task(uuid,uuid,uuid,uuid)') is not null
     or to_regprocedure('public.nav_v2_set_bounded_task_active_outcome(uuid,text,text,date,uuid,uuid)') is not null
     or to_regprocedure('public.nav_v2_propose_bounded_task_terminal_outcome(uuid,text,text,uuid,uuid,uuid)') is not null
     or to_regprocedure('public.nav_v2_decide_bounded_task_terminal_outcome(uuid,text,uuid,uuid)') is not null then
    raise exception 'actor-aware overload remains after overlay rollback';
  end if;

  if to_regprocedure('nav_v2_private.nav_v2_require_verified_actor(uuid)') is not null
     or to_regprocedure('nav_v2_private.nav_v2_assert_actor_replay(uuid,text,uuid)') is not null
     or to_regprocedure('nav_v2_private.nav_v2_actor_claim_restore(text)') is not null then
    raise exception 'actor-aware helper remains after overlay rollback';
  end if;

  if to_regprocedure('public.nav_v2_create_bounded_tasks(uuid,jsonb,uuid)') is null
     or to_regprocedure('public.nav_v2_start_bounded_task(uuid,uuid)') is null
     or to_regprocedure('public.nav_v2_complete_bounded_task(uuid,uuid,uuid)') is null
     or to_regprocedure('public.nav_v2_set_bounded_task_active_outcome(uuid,text,text,date,uuid)') is null
     or to_regprocedure('public.nav_v2_propose_bounded_task_terminal_outcome(uuid,text,text,uuid,uuid)') is null
     or to_regprocedure('public.nav_v2_decide_bounded_task_terminal_outcome(uuid,text,uuid)') is null then
    raise exception 'canonical governed RPC was removed by actor-aware rollback';
  end if;

  if (select count(*) from public.nav_deal_task_mutation_events_v2
      where client_request_id between '41000000-0000-4000-8000-000000000001'::uuid
                                  and '41000000-0000-4000-8000-000000000006'::uuid) <> 6 then
    raise exception 'actor-aware audit rows changed during overlay rollback';
  end if;

  if not exists (
    select 1 from public.nav_deal_tasks_v2
    where task_contract_version=2
      and source='bounded_contract_v2'
      and subject_reference_id='31000000-0000-4000-8000-000000000001'
      and status='done'
  ) then
    raise exception 'actor-aware completed task changed during overlay rollback';
  end if;

  if not exists (
    select 1 from public.nav_deal_tasks_v2
    where id='20000000-0000-4000-8000-000000000001'
      and task_contract_version is null
      and task_type='operational_task'
  ) then
    raise exception 'legacy task changed during actor-aware overlay lifecycle';
  end if;
end;
$$;

select 'PostgreSQL actor-aware bounded task rollback assertions passed' as result;
