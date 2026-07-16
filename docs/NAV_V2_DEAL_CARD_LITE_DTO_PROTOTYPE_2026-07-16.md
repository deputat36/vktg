# Navigator v2 — explicit DTO для lite-карточки

Дата: 2026-07-16.

Статус: repository-only prototype, без production deploy.

## Проблема

Текущая `nav_v2_get_deal_card_lite(p_deal_id uuid)` получает сделку через `to_jsonb(d)`. Поэтому RPC автоматически возвращает все существующие и будущие столбцы `nav_deals_v2`, включая поля, которые не нужны аварийному экрану или permission guards.

Одновременно frontend consumers ожидают permission facts, которых текущая lite-функция не возвращает:

- `task-action-guard-v2.js` использует `can_change_status`;
- `document-action-guard-v2.js` использует `can_change_status`, `can_mark_received`, `can_mark_checked`, `can_mark_problem`;
- безопасная и аварийная карточки используют только короткую сводку, документы, задачи и риски.

## Решение prototype

Файл:

`supabase/prototypes/nav_v2_get_deal_card_lite_explicit_dto.sql`

Он сохраняет публичную signature, но заменяет full-row serialization на explicit JSON allowlists.

### Сделка

Возвращаются только:

- UUID;
- нейтральные `title` и `display_title`;
- статус и уровень риска;
- тип объекта;
- ориентир без номера квартиры, офиса или помещения;
- общая цена;
- признак согласования расчётов;
- дата создания.

ФИО, телефоны, кадастровый номер, исходные JSON snapshots, следующий шаг и вспомогательные суммы в lite DTO не входят.

### Документы

Возвращаются:

- UUID;
- нейтральное название по стороне сделки;
- статус, сторона, обязательность, ответственная роль и срок;
- Permission facts для текущего пользователя.

Описание, источник, проблемная заметка и другие свободные тексты не входят.

### Задачи

Возвращаются:

- UUID;
- нейтральный заголовок;
- статус, приоритет, ответственная роль и срок;
- `can_change_status`.

Описание задачи, source и персональные UUID исполнителей не входят.

### Риски

Возвращаются:

- UUID;
- нейтральный заголовок;
- уровень;
- состояние разрешения;
- блокировка задатка и сделки.

Описание и рекомендация не входят.

### Комментарии

Комментарии в lite DTO возвращаются пустым массивом. Их полный текст не требуется permission guards и не должен передаваться аварийному минимальному RPC.

## Permission facts

Prototype использует действующие серверные helpers:

- `nav_v2_can_change_task_status`;
- `nav_v2_can_change_document_status`;
- `nav_v2_private.nav_v2_can_view_deal`.

Это закрывает существующий consumer gap без переноса ролевой логики в браузер.

## Совместимость

Сохраняются:

- public RPC signature;
- top-level shape `deal`, `documents`, `tasks`, `risks`, `comments`, `lite`;
- ключи, используемые безопасной карточкой, timeout recovery и diagnostic screen;
- service-role bypass;
- текущая серверная модель доступа.

Добавляются:

- `dto_version = 1`;
- permission flags документов и задач.

Меняется только объём данных: lite-карточка становится минимальной сводкой, а не копией полной карточки.

## Что не сделано

- SQL не помещён в `supabase/migrations`;
- prototype не применён к Supabase;
- grants, RLS, Auth и Edge Functions не менялись;
- frontend consumers не переключались на новый contract;
- production-данные не читались и не изменялись;
- `authenticated-smoke = skipped` не считается evidence.

## Проверка

Contract:

`config/nav-v2-deal-card-lite-dto-contract.json`

Checker:

`scripts/check_nav_v2_deal_card_lite_dto_prototype.py`

Проверка запрещает:

- `to_jsonb` и full-row SELECT;
- structured client fields;
- snapshots и кадастровые данные;
- work-item descriptions и comment body;
- изменения grants и destructive DDL;
- несовпадение allowlist с consumer requirements.

## Rollout

Перед production применением:

1. выполнить SQL на изолированной branch или в транзакционном test database;
2. прогнать authenticated matrix по ролям owner/admin/manager/SPN/lawyer/broker;
3. подтвердить task/document permission facts;
4. проверить safe-card и timeout recovery;
5. сравнить payload size до и после;
6. подготовить release alias и production attestation;
7. применить только отдельным reviewable PR и migration.

## Rollback

Восстановить прежнее тело функции из:

`supabase/migrations/20260625120500_navigator_deal_card_lite_service_role_bypass.sql`

Публичная signature не меняется, поэтому rollback не требует frontend rollback или изменения grants.
