# Настройка Supabase

Supabase в проекте подключается необязательно.

Если `config/supabase.js` пустой, инструмент работает локально:
- сценарии;
- рекомендации;
- карточка юристу;
- сообщения клиенту;
- локальное сохранение в браузере;
- экспорт JSON.

Если заполнить Supabase URL и publishable/anon key, появятся:
- панель входа;
- выход;
- сохранение сделки в таблицу `deals`;
- просмотр последних сохраненных сделок.

## 1. Создать проект Supabase

Создайте новый проект в Supabase.

## 2. Создать таблицы

Откройте SQL Editor и выполните:

```text
supabase/schema.sql
```

Потом выполните дополнительную миграцию:

```text
supabase/upgrade_profiles.sql
```

Она нужна, чтобы после создания пользователя в Auth автоматически создавался профиль в `public.profiles`.

## 3. Создать пользователей

В Supabase откройте:

```text
Authentication → Users
```

Создайте сотрудников по email и паролю.

По умолчанию новые профили получают роль `spn`.

Если нужно назначить роль менеджера, юриста, брокера или админа, выполните SQL:

```sql
update public.profiles
set role = 'manager', full_name = 'Ковтун Алексей Вадимович'
where id = 'UUID_ПОЛЬЗОВАТЕЛЯ';
```

Роли:
- `spn`;
- `lawyer`;
- `broker`;
- `manager`;
- `admin`.

## 4. Подключить ключи к проекту

Откройте файл:

```text
config/supabase.js
```

Заполните:

```js
export const SUPABASE_URL = 'https://xxxx.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_...';
```

Можно использовать publishable key или anon key.

Нельзя вставлять в браузерный код:
- secret key;
- service_role key.

## 5. Проверить на сайте

После публикации GitHub Pages:

1. Откройте сайт.
2. Если ключи заполнены, под шапкой появится панель Supabase.
3. Войдите email/паролем.
4. Заполните сделку.
5. Нажмите `Сохранить в Supabase`.
6. Нажмите `Мои сделки`.

## 6. Если сохранение не работает

Проверьте:

- выполнен ли `schema.sql`;
- выполнен ли `upgrade_profiles.sql`;
- создан ли пользователь в Authentication;
- есть ли строка в `public.profiles`;
- не вставлен ли случайно secret/service_role key в `config/supabase.js`;
- включены ли RLS-политики из `schema.sql`.
