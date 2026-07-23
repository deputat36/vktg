# Navigator v2 — release drift в общем Supabase-проекте

Дата: 23 июля 2026 года.

## Проблема

Navigator v2 и `leader_*` используют один Supabase project `ofewxuqfjhamgerwzull`.

Старый release drift gate сравнивал `latest_live_migration` Navigator с глобально последней migration проекта. После появления более новых `leader_*` migrations это давало ложный drift, даже когда:

- утверждённая Navigator migration оставалась в production;
- repository migration history содержала более новые migrations;
- неизвестных remote-only migrations не было;
- обе Navigator Edge Functions совпадали с baseline.

Дополнительно approved baseline не включал уже применённую migration:

`20260716063401_nav_v2_correct_mortgage_broker_scope`

Её канонический repository source:

`supabase/migrations/20260716064500_nav_v2_correct_mortgage_broker_scope.sql`

Git blob SHA:

`93687e0aed8d88d604e31a730ba8c9f8c806b94e`

## Решение

Добавлен repository-only evaluator:

`scripts/check_nav_v2_release_drift_shared_project.py`

Контракт:

`config/nav-v2-release-drift-shared-project-v1.json`

Новая семантика baseline:

`required_present_not_global_latest`

Это означает:

1. утверждённая Navigator migration обязана присутствовать в remote history;
2. более новые migrations общего проекта допустимы, если они известны repository history или утверждённым aliases;
3. неизвестные remote-only migrations остаются блокирующим drift;
4. repository-only migrations без утверждённого alias остаются блокирующим drift;
5. Edge Function version, status, `verify_jwt`, live bundle SHA и source blob остаются строгими;
6. отсутствие утверждённой Navigator migration остаётся блокирующей ошибкой.

## Обновлённый baseline

`config/nav-v2-release-baseline.json` теперь фиксирует:

`latest_live_migration = 20260716063401`

`config/nav-v2-release-migration-aliases.json` связывает:

- live `20260716063401`;
- canonical `20260716064500`;
- source blob `93687e0aed8d88d604e31a730ba8c9f8c806b94e`.

Более поздние `leader_*` migrations не добавляются в Navigator baseline и не считаются изменением Navigator.

## Что по-прежнему блокирует release drift gate

- утверждённая Navigator migration отсутствует в production;
- production содержит migration без repository source или approved alias;
- repository содержит migration, отсутствующую в production и не отмеченную approved repository-only;
- `nav-invite-user` или `nav-v2-deal-api` отсутствует;
- Edge version, status, `verify_jwt` или bundle hash отличаются;
- repository source Edge Function отличается от approved source blob;
- появляется незарегистрированная live Navigator Edge Function.

## Границы

Изменения repository-only и read-only.

Не выполнялись:

- SQL DDL или DML;
- migration apply/repair;
- Edge deploy;
- Auth changes;
- создание preview branch;
- создание технических пользователей;
- cost confirmation;
- изменения `leader_*` schema, data или functions.

Решение:

`shared_project_release_drift_false_positive_removed_repository_only`
