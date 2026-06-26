# Аудит service_role в Навигаторе v2

Дата: 25 июня 2026.

## Цель

Проверить RPC Навигатора v2 после инцидента с карточкой сделки Овчинникова и убедиться, что служебные read-RPC не ломаются при `auth.uid() = null`.

## Контекст

Проблема карточки Овчинникова оказалась не связана с правами пользователя: под его JWT доступ к сделке есть.

Параллельно при доработке безопасной карточки обнаружен технический долг: некоторые RPC были выданы `service_role`, но внутри всё равно могли вызывать пользовательскую проверку доступа с пустым `auth.uid()`.

## Исправленные read-RPC

### `nav_v2_get_deal_card_lite(uuid)`

Назначение: безопасная облегчённая карточка сделки.

Исправление:

- добавлен `v_is_service`;
- обычные пользователи проходят через `nav_v2_can_view_deal`;
- `service_role` не отправляется в `nav_v2_can_view_deal(..., null)`.

Миграции:

- `supabase/migrations/20260625115000_navigator_deal_card_lite_rpc.sql`
- `supabase/migrations/20260625120500_navigator_deal_card_lite_service_role_bypass.sql`

### `nav_v2_get_handoff_scores(jsonb)`

Назначение: пакетный расчёт готовности передачи юристу для списка сделок.

Исправление:

- добавлен `v_is_service`;
- в visible CTE используется условие `v_is_service or public.nav_v2_can_view_deal(...)`.

Миграция:

- `supabase/migrations/20260625121000_navigator_handoff_scores_service_role_bypass.sql`

### `nav_v2_get_deal_responsibility_snapshot(uuid)`

Назначение: серверный снимок ответственности и готовности передачи юристу.

Исправление:

- компактным DO-патчем добавлен `v_is_service`;
- guard заменён на `not v_is_service and not public.nav_v2_can_view_deal(...)`.

Миграция:

- `supabase/migrations/20260625121500_navigator_responsibility_snapshot_service_role_bypass_compact.sql`

## Проверенные read-RPC

### `nav_v2_get_deal_card(uuid)`

Полная карточка уже имела отдельную service-ветку. Проверено: при `role = service_role` функция возвращает данные.

### `nav_v2_get_deal_status_options(uuid)`

Уже имеет корректный guard:

`not v_is_service_role and not public.nav_v2_can_view_deal(...)`

## RPC, которые не нужно автоматически переводить на service_role bypass

Следующие RPC являются пользовательскими действиями или проверками действий. Их не нужно механически переводить на service-role bypass без отдельного бизнес-решения:

- `nav_v2_add_comment`
- `nav_v2_add_deal_review`
- `nav_v2_add_document`
- `nav_v2_add_risk`
- `nav_v2_add_task`
- `nav_v2_return_spn_rework`
- `nav_v2_update_document_assignment`
- `nav_v2_can_change_deal_status`
- `nav_v2_can_change_document_status`
- `nav_v2_can_change_task_status`

Причина: эти функции связаны с действиями пользователя, авторством, ролью, ответственностью и журналом событий. Если дать им полноценный service bypass, можно потерять смысл авторства и клиентской ответственности.

## Текущая рекомендация

1. Для read-RPC и диагностики service_role допустим.
2. Для mutating RPC service_role оставлять только при явно описанном сценарии использования.
3. Если в будущем появятся фоновые задачи или серверные интеграции, для них лучше делать отдельные service-RPC с явным именем и логированием источника действия.

## CRM «Лидер»

CRM «Лидер» не затрагивалась.
