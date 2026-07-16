# Navigator v2 — инвентаризация privacy-контракта RPC

Дата: 2026-07-16.

## Цель

Проверить определения высокочастотных read RPC без чтения значений рабочих строк и определить порядок server-side minimization.

Инвентаризация охватывает 11 RPC. Она основана на:

- `pg_get_functiondef` production-функций;
- канонических SQL migrations в репозитории;
- текущем frontend read-layer masking;
- фактических signatures, grants и serialization patterns.

В этом slice нет production deploy, DDL, изменения grants/RLS/Auth/Edge Functions или очистки данных.

## Категории данных

- Рабочий факт: статус, срок, сумма, счётчик, роль, permission или результат процесса.
- Идентификатор сотрудника: ФИО, email, телефон и UUID ответственного сотрудника.
- Клиентский идентификатор: ФИО, телефон, email, паспортные, страховые и платёжные идентификаторы клиента.
- Чувствительный свободный текст: комментарий, описание, решение или следующий шаг, куда ранее могли записать идентификатор.
- Технические metadata: UUID сделки, URL карточки, версия, permission flag и server timestamp.

## Главные выводы

1. `nav_v2_get_deals_list` напрямую возвращает четыре structured client identifier fields.
2. `nav_v2_get_lawyer_queue` также напрямую возвращает эти поля.
3. `nav_v2_get_deal_card` использует `to_jsonb(d)` и полные child rows. Это критический контракт: любой новый столбец сделки автоматически становится частью API.
4. `nav_v2_get_deal_card_lite` тоже сериализует полную строку сделки, хотя используется главным образом permission/action flows.
5. Dashboard, manager, lawyer review и broker queue не всегда возвращают structured identifiers, но возвращают legacy title и чувствительный свободный текст.
6. Operational adoption report объединяет несколько private payloads. Его нельзя считать безопасным, пока не завершена инвентаризация каждой зависимости.
7. Responsibility snapshot не выдаёт клиентские значения напрямую, но его readiness policy всё ещё требует ФИО и телефоны клиента. После минимизации новых сделок это устаревшее бизнес-правило.
8. `nav_v2_get_handoff_scores` остаётся лучшим образцом: aggregate-only DTO без текста и клиентских identifiers.

## Реестр риска

| RPC | Риск | Причина | Текущая защита | Целевой серверный контракт |
|---|---|---|---|---|
| `nav_v2_get_deals_list` | critical | прямые client identifiers, legacy title и next action | frontend read-layer | explicit allowlist без клиентских полей |
| `nav_v2_get_dashboard` | high | title, deal title, task description, next action | frontend read-layer | neutral reference и redacted work text |
| `nav_v2_get_deal_card` | critical | `to_jsonb(d)` и полные child rows | frontend read-layer | explicit deal/child DTO |
| `nav_v2_get_deal_card_lite` | critical | полная строка сделки для action-flow | frontend read-layer | минимальный permission/action DTO |
| `nav_v2_get_operational_readiness_preview` | high | title и operational free text; зависимость от client names | frontend read-layer | neutral reference и новая completeness policy |
| `nav_v2_get_lawyer_queue` | critical | прямые client identifiers и review text | frontend read-layer | убрать client columns, redact text |
| `nav_v2_get_lawyer_review_summary` | high | latest review body | frontend read-layer | structured decision summary или redaction |
| `nav_v2_get_broker_queue_preview` | high | title, address, settlements comment, task text | frontend read-layer | neutral reference и redacted finance text |
| `nav_v2_get_operational_adoption_report` | high | composite private payloads | frontend read-layer | dependency-by-dependency inventory |
| `nav_v2_get_deal_responsibility_snapshot` | medium | employee contacts и устаревшая client completeness policy | frontend read-layer | сохранить ответственность сотрудников, убрать client PII dependency |
| `nav_v2_get_handoff_scores` | low | aggregate-only DTO | не требуется | сохранить без расширения текста |

## Почему frontend masking недостаточно

Текущий frontend корректно минимизирует данные до кэширования, поиска и рендера. Но это защита конкретного клиента, а не API-контракт:

- другой клиент может вызвать RPC напрямую;
- новый экран может обойти общий helper;
- `to_jsonb(d)` автоматически выдаст новые столбцы;
- raw network response всё ещё содержит лишние поля;
- server logs и промежуточные consumers могут увидеть payload до frontend masking.

Поэтому frontend read-layer остаётся defence-in-depth, но не заменяет server-side allowlist.

## Rollout order

### Wave 1 — критические high-use RPC

1. `nav_v2_get_deal_card_lite` — самый узкий целевой DTO и меньшая поверхность регрессии.
2. `nav_v2_get_deals_list` — убрать structured identifiers, сохранить рабочие counters и employee responsibility.
3. `nav_v2_get_lawyer_queue` — убрать structured identifiers и redaction review text.
4. `nav_v2_get_deal_card` — заменить `to_jsonb(d)` и full child rows после стабилизации DTO helpers.

### Wave 2 — очереди и dashboard

- dashboard;
- operational readiness preview;
- lawyer review summary;
- broker queue.

### Wave 3 — composite и policy

- operational adoption dependencies;
- responsibility snapshot completeness policy;
- единый neutral deal reference helper на стороне PostgreSQL.

### Wave 4 — consistency

- проверить aggregate-only RPC;
- исключить повторное появление full-row serialization;
- подтвердить frontend/server DTO parity.

## Repository-only design

Следующий implementation slice должен подготовить без production deploy:

1. private pure helpers для neutral deal reference и JSON redaction;
2. explicit DTO prototypes для Wave 1;
3. совместимые public signatures;
4. contract tests на отсутствие client identifier keys;
5. rollback plan и comparison fixtures;
6. authenticated role regression перед применением.

## Gate применения

Production wrapper rollout разрешён только после одного из условий:

- выполнен authenticated regression в изолированной среде;
- владелец отдельно согласовал ограниченный production rollout с контрольным evidence и rollback.

Зелёный public-smoke или workflow с `authenticated-smoke = skipped` не является достаточным evidence.

## Машинно-читаемый источник

Полный registry:

`config/nav-v2-rpc-privacy-inventory.json`

Проверка:

`scripts/check_nav_v2_rpc_privacy_inventory.py`

Она сверяет последние SQL-определения, source paths, structured identifiers, sensitive free-text keys, full-row serialization и rollout gates.
