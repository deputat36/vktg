-- Synthetic PostgreSQL 17 identity-propagation environment.
-- Repository-only: no production schema or Supabase project is changed.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;

create table public.nav_user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null,
  is_active boolean not null default true
);

insert into auth.users(id, email) values
  ('00000000-0000-4000-8000-000000000004', 'spn@example.test'),
  ('00000000-0000-4000-8000-000000000009', 'inactive@example.test');

insert into public.nav_user_profiles(id, role, is_active) values
  ('00000000-0000-4000-8000-000000000004', 'spn', true),
  ('00000000-0000-4000-8000-000000000009', 'spn', false);

-- Models the current governed pattern: service-role-only EXECUTE while actor comes from auth.uid().
create or replace function public.nav_v2_identity_probe()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid();
$$;

-- Models the candidate future Edge facade: verified actor is injected outside the client payload.
create or replace function public.nav_v2_identity_probe_actor(p_actor_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor_id is null or not exists (
    select 1
    from public.nav_user_profiles p
    where p.id = p_actor_id
      and p.is_active is true
  ) then
    raise exception 'Verified actor does not have an active Navigator profile' using errcode = '42501';
  end if;
  return p_actor_id;
end;
$$;

revoke execute on function public.nav_v2_identity_probe() from public, anon, authenticated;
revoke execute on function public.nav_v2_identity_probe_actor(uuid) from public, anon, authenticated;
grant execute on function public.nav_v2_identity_probe() to service_role;
grant execute on function public.nav_v2_identity_probe_actor(uuid) to service_role;

select 'Navigator v2 task Edge identity setup created' as result;
