\set ON_ERROR_STOP on

-- User JWT path: actor identity exists, but authenticated lacks governed EXECUTE.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false);
set role authenticated;

select 1 / case
  when auth.uid() = '00000000-0000-4000-8000-000000000004'::uuid then 1
  else 0
end as assert_authenticated_user_identity_exists;

select 1 / case
  when not has_function_privilege(current_user, 'public.nav_v2_identity_probe()', 'EXECUTE') then 1
  else 0
end as assert_authenticated_governed_execute_absent;

reset role;

-- Service-role path: EXECUTE exists, but the user subject is not guaranteed.
select set_config('request.jwt.claim.sub', '', false);
set role service_role;

select 1 / case
  when auth.uid() is null then 1
  else 0
end as assert_service_role_user_identity_absent;

select 1 / case
  when has_function_privilege(current_user, 'public.nav_v2_identity_probe()', 'EXECUTE') then 1
  else 0
end as assert_service_role_governed_execute_present;

select 1 / case
  when public.nav_v2_identity_probe() is null then 1
  else 0
end as assert_current_service_role_pattern_has_no_actor;

select 1 / case
  when public.nav_v2_identity_probe_actor('00000000-0000-4000-8000-000000000004')
       = '00000000-0000-4000-8000-000000000004'::uuid then 1
  else 0
end as assert_explicit_verified_actor_candidate;

reset role;

-- Inactive or unverified actors remain rejected by the candidate facade.
do $$
begin
  perform public.nav_v2_identity_probe_actor('00000000-0000-4000-8000-000000000009');
  raise exception 'Expected inactive actor rejection was not raised';
exception
  when others then
    if sqlerrm like 'Expected inactive actor rejection%' then
      raise;
    end if;
    if position('active Navigator profile' in sqlerrm) = 0 then
      raise exception 'Unexpected inactive actor error: %', sqlerrm;
    end if;
end;
$$;

select 1 / case
  when (select count(*) from public.nav_user_profiles) = 2 then 1
  else 0
end as assert_identity_probes_do_not_mutate_profiles;

select 'PostgreSQL task Edge identity propagation gate passed' as result;
