create or replace function public.nav_v2_guard_active_spn_manager()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.is_active is true
     and new.role = 'spn'::public.nav_v2_user_role
     and new.manager_id is null
     and (
       tg_op = 'INSERT'
       or old.role is distinct from new.role
       or old.manager_id is distinct from new.manager_id
       or old.is_active is distinct from new.is_active
     )
  then
    raise exception 'Для активного СПН обязательно назначьте менеджера.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists nav_v2_require_manager_for_active_spn on public.nav_user_profiles;
create trigger nav_v2_require_manager_for_active_spn
before insert or update on public.nav_user_profiles
for each row execute function public.nav_v2_guard_active_spn_manager();
