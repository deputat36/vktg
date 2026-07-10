# Navigator v2 — аудит зависимостей legacy RPC

Дата: 2026-07-10

## Статус

Read-only аудит выполнен после переноса основных Navigator v2 access helpers в `nav_v2_private`.

Цель документа — объяснить оставшиеся предупреждения Supabase Security Advisor по legacy `nav_*` функциям и зафиксировать безопасное решение без изменения старого контура.

## Граница работ

Аудит не менял:

- таблицы legacy Navigator;
- RLS policies legacy Navigator;
- данные legacy Navigator;
- функции `leader_*`;
- функции и таблицы `parket_*`;
- рабочий API Navigator v2.

## Проверенные legacy functions

| Функция | Прямой `authenticated EXECUTE` | Caller functions | RLS policies | Решение |
|---|---:|---:|---:|---|
| `nav_can_create_deal(p_uid uuid)` | да | 1 | 1 | сохранить до отдельной миграции legacy-контура |
| `nav_can_edit_deal(p_deal_id uuid, p_uid uuid)` | да | 0 | 6 | сохранить: требуется legacy RLS |
| `nav_can_view_deal(p_deal_id uuid, p_uid uuid)` | да | 0 | 10 | сохранить: требуется legacy RLS |
| `nav_current_role()` | да | 0 | 2 | сохранить: требуется legacy RLS |
| `nav_is_admin()` | да | 0 | 9 | сохранить: требуется legacy RLS |

Для всех пяти функций:

- `anon EXECUTE = false`;
- `PUBLIC EXECUTE = false`;
- `service_role EXECUTE = true`;
- функции используют `SECURITY DEFINER` и проверяют `auth.uid()` или роль текущего пользователя.

## Caller и policy зависимости

### `nav_can_create_deal`

Вызывается legacy RPC:

- `nav_save_wizard_deal(p_result jsonb)`.

Используется policy создания записи в:

- `nav_deals`.

### `nav_can_edit_deal`

Используется legacy RLS policies таблиц:

- `nav_deals`;
- `nav_deal_participants`;
- `nav_deal_tasks`.

### `nav_can_view_deal`

Используется legacy RLS policies таблиц:

- `nav_deals`;
- `nav_deal_participants`;
- `nav_deal_tasks`;
- `nav_deal_comments`;
- `nav_deal_events`;
- `nav_deal_reviews`.

### `nav_current_role`

Используется legacy RLS policies:

- обновления событий сделки;
- добавления юридического review.

### `nav_is_admin`

Используется legacy RLS policies:

- профилей;
- участников сделки;
- событий сделки.

## Использование из репозитория

Поиск по исходному коду не обнаружил прямых вызовов этих функций из:

- `assets/js/nav-v2/**`;
- Edge Function `nav-v2-deal-api`;
- Edge Function `nav-invite-user`.

Совпадения находятся только в:

- старых migrations;
- документации;
- legacy server-side функциях.

Дополнительно `scripts/check_nav_v2_rpc_surface.py` запрещает появление legacy RPC-вызовов в источниках Navigator v2.

## Состояние legacy данных

Обезличенная проверка количества записей:

| Таблица | Строк |
|---|---:|
| `nav_profiles` | 8 |
| `nav_deals` | 1 |
| `nav_deal_participants` | 0 |
| `nav_deal_tasks` | 0 |
| `nav_deal_comments` | 0 |
| `nav_deal_events` | 0 |
| `nav_deal_reviews` | 0 |

Legacy-контур почти не используется, но не является полностью пустым. Поэтому удаление таблиц, функций или policies без отдельного решения недопустимо.

## Почему нельзя выполнить простой REVOKE

`REVOKE EXECUTE ... FROM authenticated` для этих functions нарушит выполнение legacy RLS policies. Результатом могут стать:

- невозможность прочитать единственную legacy-сделку;
- ошибки старого wizard RPC;
- блокировка legacy insert/update/select операций;
- ложные ошибки в старых административных сценариях.

## Принятое решение

На текущем релизе:

- не отзывать `authenticated EXECUTE`;
- не переносить legacy helpers в `nav_v2_private`;
- не смешивать legacy и Navigator v2 private schema;
- не удалять legacy данные;
- считать соответствующие Security Advisor warnings документированными и ожидаемыми для старого RLS-контура.

Это не распространяется на Navigator v2 helpers: основные v2 access helpers уже вынесены из exposed `public`.

## Возможный отдельный проект decommission

После отдельного решения можно выполнить:

1. определить владельца единственной legacy-сделки;
2. решить, требуется ли перенос записи в `nav_deals_v2` или архивирование;
3. подтвердить отсутствие пользователей старого интерфейса;
4. отключить legacy wizard;
5. перенести legacy RLS helpers в отдельную схему, например `nav_legacy_private`, либо удалить legacy-контур;
6. повторить role regression;
7. проверить Security и Performance Advisors.

Это должна быть отдельная задача и отдельный набор migrations.

## Итог для #161 и #178

- browser/admin RPC Navigator v2 классифицированы;
- основные internal access helpers Navigator v2 находятся в `nav_v2_private`;
- legacy warnings разобраны и имеют документированную причину;
- legacy функции не менялись из-за RLS-зависимостей и существующих данных;
- следующий открытый security-блок — ручной invite/recovery/password QA и leaked-password protection.
