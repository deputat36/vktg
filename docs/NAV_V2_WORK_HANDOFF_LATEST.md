# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-16.
- Репозиторий: `deputat36/vktg`.
- Текущий `main`: `434fb6981a4f814ef2ddfa04c46f47071cd33896` — merge PR #345.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Последняя подтверждённая production migration: `20260715203158_nav_v2_minimize_client_identifiers`.
- Канонический source: `20260715224500_nav_v2_minimize_client_identifiers.sql`.
- Последний контрольный baseline: 5 профилей, 0 viewer, 23 сделки, 98 задач, 198 документов, 53 риска.
- Production trigger `nav_v2_deals_guard_client_identifiers` включён.
- Edge Functions после privacy-волн не менялись.
- Открытых PR после merge #345 нет.

Counts могут изменяться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Завершённые волны

### PR #333–#334 — автономный план и task feedback

- зафиксированы продуктовые волны и ручные gates;
- закрыт первый клик permission/action flow задач;
- добавлены busy/success/error и desktop/mobile regression.

### PR #336–#337 — retirement viewer

- новое назначение роли `viewer` заблокировано в UI и на границе базы;
- активных viewer-профилей нет;
- legacy enum/workspace сохранены только для совместимости.

### PR #338–#340 — минимизация новых данных

- мастер больше не собирает ФИО и телефоны клиентов;
- browser draft и save payload очищаются;
- public save wrapper и table guard защищают новые записи;
- свободный ввод блокирует явные чувствительные форматы;
- исторические строки физически не очищались.

### PR #341–#342 — frontend read-layer

- RPC-ответы минимизируются до кэширования, поиска и рендера;
- клиентские structured identifiers удаляются;
- заголовки заменяются нейтральной ссылкой;
- номер квартиры/офиса убирается из ориентира;
- явные чувствительные значения в историческом рабочем тексте маскируются при чтении;
- рабочие данные сотрудников, суммы, даты и процессные факты сохраняются.

### PR #343 — release correction

- repository baseline исправлен по фактической Supabase migration history;
- live timestamp: `20260715203158`;
- alias, strict checker, attestation и handoff синхронизированы.

### PR #344 — RPC privacy inventory

- проинвентаризированы 11 ключевых read RPC;
- добавлены registry, correction overlay, отчёт и CI;
- различены реальные API-экспозиции и internal-only client dependencies;
- критическими признаны:
  - `nav_v2_get_deals_list`;
  - `nav_v2_get_deal_card`;
  - `nav_v2_get_deal_card_lite`;
  - `nav_v2_get_lawyer_queue`;
- rollout разбит на четыре волны;
- production schema и данные не менялись.

Основные файлы:

- `config/nav-v2-rpc-privacy-inventory.json`;
- `config/nav-v2-rpc-privacy-inventory-corrections.json`;
- `docs/NAV_V2_RPC_PRIVACY_INVENTORY_2026-07-16.md`;
- `scripts/check_nav_v2_rpc_privacy_inventory.py`.

### PR #345 — deal-card-lite explicit DTO prototype

- подготовлен repository-only SQL prototype вне migrations;
- public signature сохранена;
- `to_jsonb(d)` заменён explicit allowlists;
- добавлены серверные permission facts задач и документов;
- lite DTO не возвращает комментарии и подробные описания;
- нейтрализованы названия и unit-level address;
- добавлены contract JSON, consumer matrix, rollback и CI;
- Supabase не менялся.

Основные файлы:

- `supabase/prototypes/nav_v2_get_deal_card_lite_explicit_dto.sql`;
- `config/nav-v2-deal-card-lite-dto-contract.json`;
- `docs/NAV_V2_DEAL_CARD_LITE_DTO_PROTOTYPE_2026-07-16.md`.

## Проверки

Зелёные фактически выполненные проверки последних волн:

- основной static suite;
- release integrity и migration aliases;
- общий JavaScript syntax;
- privacy semantic/source contracts;
- desktop/mobile browser regressions;
- RPC privacy inventory contract;
- deal-card-lite DTO contract;
- public guest smoke;
- review threads отсутствовали перед merge.

`authenticated-smoke` завершался со статусом `skipped`. Это не authenticated evidence и не подтверждение полной ролевой матрицы.

## Обнаруженный продуктовый риск

После frontend privacy minimization `dashboardDuplicateKey()` больше не имеет прежних клиентских полей, а нейтральный `display_title` содержит короткий ID сделки.

Следствие:

- старый heuristic duplicate grouping больше не является надёжным;
- наличие ID в заголовке делает каждую карточку формально уникальной;
- попытка убрать ID может, наоборот, скрыть разные сделки одного объекта;
- список не должен автоматически скрывать сделки без подтверждённого server duplicate evidence.

Это не означает, что строки нужно удалять или объединять. Issue #273 и owner gate остаются обязательными.

## Следующий безопасный slice

P0 — сделать frontend duplicate handling evidence-only.

Требования:

1. Не использовать ФИО, телефоны, legacy title или свободный текст для duplicate key.
2. Группировать только при наличии явного server field, например `exact_duplicate_group_id` или эквивалентного подтверждённого token.
3. Если server evidence отсутствует — считать сделки отдельными и ничего не скрывать.
4. Сохранить demo filtering отдельно от duplicate filtering.
5. Обновить pure model и regression tests.
6. Не удалять, не архивировать и не объединять production-строки.
7. Не менять Supabase в этом slice.
8. После исправления продолжить repository-only explicit DTO prototype для `nav_v2_get_deals_list`.

## Следующий Wave 1 prototype

`nav_v2_get_deals_list` должен сохранить:

- профиль текущего сотрудника;
- нейтральную ссылку на сделку;
- статус, риск, object type и безопасный ориентир;
- readiness, flags, deadlines и activity counters;
- ФИО ответственных сотрудников;
- признак наличия следующего шага без передачи исходного свободного текста;
- server duplicate evidence, если оно будет формально определено.

Он не должен возвращать:

- клиентские ФИО и телефоны;
- исходный legacy title;
- полный текст следующего шага;
- snapshots или full-row serialization.

SQL остаётся в `supabase/prototypes` до authenticated regression или отдельного решения владельца.

## Ручные ограничения

- Issue #273: duplicate cleanup запрещён без решения владельца.
- Не менять `seller_spn_id`, `buyer_spn_id`, `manager_id` без evidence и подтверждения владельца.
- Исторические значения физически не очищать автоматически.
- Operational pilot mutation запрещена без evidence-пакета.
- Платную Supabase branch не создавать без явного согласования стоимости.
- Не считать skipped authenticated job доказательством ролей.
- Не применять repository-only prototypes к production.
- Не менять grants, RLS, Auth или Edge Functions без отдельного review/deploy slice.

## Не повторять без новой причины

- общий аудит проекта;
- task feedback;
- retirement viewer;
- сбор ФИО/телефонов в мастере;
- input guard;
- frontend read-layer masking;
- historical text masking;
- RPC privacy inventory;
- deal-card-lite DTO prototype;
- production cleanup без решения владельца.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #345. Сначала исправь frontend duplicate handling на evidence-only без Supabase mutations, затем продолжи repository-only prototype для nav_v2_get_deals_list. Не удаляй и не объединяй production-строки.`
