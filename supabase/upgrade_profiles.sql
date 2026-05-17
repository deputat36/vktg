-- Дополнительная миграция для Supabase.
-- Выполнить после supabase/schema.sql.
-- Нужна, чтобы после создания пользователя в Auth автоматически появлялась строка в public.profiles.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, 'Новый пользователь'),
    'spn'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Если пользователи уже были созданы до этой миграции, можно вручную добавить профиль:
-- insert into public.profiles (id, full_name, role)
-- values ('UUID_ИЗ_AUTH_USERS', 'ФИО сотрудника', 'spn');
