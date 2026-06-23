drop policy if exists nav_v2_profiles_select on public.nav_user_profiles;

create policy nav_v2_profiles_select
on public.nav_user_profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or public.nav_v2_is_owner_or_admin((select auth.uid()))
  or manager_id = (select auth.uid())
  or public.nav_v2_my_role((select auth.uid())) in (
    'manager'::public.nav_v2_user_role,
    'lawyer'::public.nav_v2_user_role,
    'broker'::public.nav_v2_user_role
  )
);
