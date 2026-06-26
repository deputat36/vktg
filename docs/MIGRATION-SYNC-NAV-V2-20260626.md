# Синхронизация миграций Навигатора v2

Дата фиксации: 26 июня 2026.

## Контекст

Часть миграций применялась через `Supabase.apply_migration`. В Supabase версии миграций получили timestamp времени применения, а SQL-файлы в GitHub были сохранены с рабочими именами `20260625...`.

Это не ошибка, но важно понимать соответствие между историей базы и файлами репозитория.

## Последние применённые миграции в Supabase

По `Supabase.list_migrations` в базе видны последние миграции:

- `20260626070055` — `navigator_deal_card_lite_rpc`
- `20260626090036` — `navigator_deal_card_lite_service_role_bypass`
- `20260626091003` — `navigator_handoff_scores_service_role_bypass`
- `20260626091148` — `navigator_responsibility_snapshot_service_role_bypass_compact`

## Соответствующие SQL-файлы в GitHub

### `navigator_deal_card_lite_rpc`

Файл:

`supabase/migrations/20260625115000_navigator_deal_card_lite_rpc.sql`

Суть:

- добавлена облегчённая RPC `nav_v2_get_deal_card_lite(uuid)`;
- используется безопасной карточкой `deal-card-safe-v2.html`;
- возвращает сделку, документы, задачи, риски и комментарии.

### `navigator_deal_card_lite_service_role_bypass`

Файл:

`supabase/migrations/20260625120500_navigator_deal_card_lite_service_role_bypass.sql`

Суть:

- добавлен корректный `service_role` bypass в `nav_v2_get_deal_card_lite(uuid)`;
- обычный пользователь проходит через `nav_v2_can_view_deal`;
- служебная роль не вызывает `nav_v2_can_view_deal(..., null)`.

### `navigator_handoff_scores_service_role_bypass`

Файл:

`supabase/migrations/20260625121000_navigator_handoff_scores_service_role_bypass.sql`

Суть:

- исправлен batch RPC `nav_v2_get_handoff_scores(jsonb)`;
- service-role проходит через `v_is_service or public.nav_v2_can_view_deal(...)`.

### `navigator_responsibility_snapshot_service_role_bypass_compact`

Файл:

`supabase/migrations/20260625121500_navigator_responsibility_snapshot_service_role_bypass_compact.sql`

Суть:

- компактным DO-патчем исправлен `nav_v2_get_deal_responsibility_snapshot(uuid)`;
- добавлен `v_is_service`;
- проверка доступа стала учитывать `service_role`.

## Почему версии отличаются

`Supabase.apply_migration` создаёт запись в истории миграций с фактическим временем применения. Поэтому версия в Supabase может отличаться от имени файла, который был создан в GitHub после применения.

Критично не имя версии, а совпадение `name` и содержания SQL.

## Проверенный результат

После применения:

- `nav_v2_get_deal_card_lite(uuid)` работает под СПН;
- `nav_v2_get_deal_card_lite(uuid)` работает под `service_role`;
- `nav_v2_get_handoff_scores(jsonb)` работает под СПН;
- `nav_v2_get_deal_responsibility_snapshot(uuid)` структурно содержит `v_is_service` и service-aware guard;
- права на read-RPC выданы `authenticated` и `service_role`;
- `anon` execute не выдан.

## CRM «Лидер»

CRM «Лидер» не затрагивалась.
