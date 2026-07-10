# Navigator v2 — health private helpers

Дата: 2026-07-10

## Назначение

`nav_v2_get_internal_rpc_lockdown_health()` теперь разделяет два разных режима внутренних функций.

### Полностью закрытые public helpers

Эти функции не должны иметь `EXECUTE` у `authenticated`, `anon` и `PUBLIC`:

- проверки переходов статусов;
- unchecked demo helpers;
- trigger functions;
- служебные quality/handoff helpers.

Для них сохранены прежние поля ответа:

- `items`;
- `items_count`;
- `missing_count`;
- `open_count`.

### Private RLS/trigger helpers

Проверяются отдельно в `private_items`:

- `nav_v2_guard_active_spn_manager()`;
- `nav_v2_is_active_user(uuid)`;
- `nav_v2_my_role(uuid)`;
- `nav_v2_is_owner_or_admin(uuid)`;
- `nav_v2_can_view_deal(uuid, uuid)`;
- `nav_v2_can_edit_deal(uuid, uuid)`.

Для каждого элемента проверяется:

- функция существует в `nav_v2_private`;
- публичный дубль отсутствует;
- `anon` и `PUBLIC` не имеют `EXECUTE`;
- `service_role` имеет `EXECUTE`;
- RLS helper имеет необходимый `authenticated EXECUTE`;
- trigger helper не имеет прямого `authenticated EXECUTE`.

Дополнительные поля ответа:

- `private_items`;
- `private_items_count`;
- `private_missing_count`;
- `private_problem_count`;
- `private_schema_ok`;
- `authenticated_schema_usage`;
- `anon_schema_usage`;
- `service_role_schema_usage`.

Поле `ok` учитывает обе группы.

## Проверенное live-состояние

Прямая проверка каталогов PostgreSQL после migration:

- private helpers: 6;
- missing: 0;
- problems: 0;
- публичные дубли: 0;
- `authenticated` schema usage: true;
- `anon` schema usage: false;
- `service_role` schema usage: true.

Migration:

`20260710184255_nav_v2_private_helper_lockdown_health.sql`

## Совместимость

Старые поля RPC не удалены. Существующие страницы продолжают использовать `health.internal.ok`, `missing_count` и `open_count`. Private grant/schema problem автоматически делает общий health красным, даже до отдельного расширения визуального вывода.

## Следующий этап

- добавить подробный вывод `private_items` в owner/admin diagnostics;
- выполнить browser role smoke;
- продолжить dependency audit legacy `nav_*` RPC.
