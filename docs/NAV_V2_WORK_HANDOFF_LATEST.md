# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 20 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- `main`: `687002e6119207fb0719283b8d786e3b0bc72ced` — squash merge PR #406.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.6.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Production Supabase, Auth, Edge Functions, RLS, grants и рабочие строки в PR #394–#406 не менялись.
- Все новые intake SQL-файлы остаются только в `supabase/prototypes`.

Live counts могут меняться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Цель и продуктовая граница

Navigator — единая заявка на подготовку сделки и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`потребность → короткий сбор фактов → маршрутизация → план документов и условий → решение профильной роли → выполнение → evidence → подтверждение готовности → задаток/сделка → закрытие`

Navigator не является CRM, файловым архивом, банковской CRM или автоматическим юристом.

- СПН фиксирует известные факты, собирает безопасные статусы документов и выполняет свои действия.
- Юрист принимает юридические решения и подтверждает юридические gates.
- Брокер отвечает только за ипотечную консультацию, программу и одобрение.
- Маткапитал, сертификаты, субсидии, дети и опека без ипотеки относятся к СПН и юристу.
- Менеджер контролирует владельцев, сроки и исключения, но не заменяет профильную роль.
- Файлы остаются во внешнем утверждённом хранилище; Navigator хранит только безопасную ссылку, статус, владельца и срок.

Каждый создаваемый пункт обязан иметь:

`trigger → owner → deadline → action → evidence → outcome → confirmation → gate impact`

Автоматический backlog нельзя расширять без completion contract.

## Текущий production baseline

Read-only проверка после PR #406:

- 23 сделки;
- 24 участника;
- 198 документов;
- 53 риска;
- 98 задач;
- 122 события;
- governed intake ledger отсутствует;
- production intake mapper отсутствует;
- production mapping table отсутствует;
- bounded task columns и canonical governed task RPC отсутствуют;
- actor-aware task overloads отсутствуют;
- intake Edge route и новый frontend transport отсутствуют.

Не использовать сырые production counts для оценки сотрудников: база содержит исторические, учебные и тестовые записи.

## Действующий пользовательский runtime

Production создание сделки по-прежнему использует:

- `spn-v2.html`;
- `assets/js/nav-v2/spn-smart-v4.js`;
- legacy RPC `public.nav_v2_save_wizard_result(jsonb)`;
- сохранённый legacy server implementation;
- текущие duplicate/idempotency/recovery guards.

Новый трёхэтапный intake остаётся detached prototype и не отправляет mutation-запросы.

## Завершённая intake-цепочка

### PR #394 — безопасное восстановление сохранения

Убрано небезопасное восстановление созданной сделки только по совпадению типа объекта. Recovery требует точного авторского и контекстного совпадения.

### PR #395 — аудит и versioned intake contract

- ролевой аудит текущего мастера;
- три верхнеуровневых этапа;
- четыре состояния факта: да / нет / не знаю / не относится;
- источник сведения: документ / клиент / не проверено;
- versioned каталог вопросов, триггеров, рисков, документов и решений;
- legal passport v1;
- gates сохранения черновика, формирования карточки и передачи юристу.

### PR #396 — detached трёхэтапный prototype

Новый интерфейс создан отдельно от production save path.

### PR #397 — lawyer-first passport

Юрист получает отдельные блоки:

- что требуется решить;
- срок и срочность;
- подтверждённые факты;
- сведения со слов клиента;
- неизвестные факты;
- риски;
- документы;
- следующий шаг СПН.

### PR #398 — side-aware work plan

Документы и задачи формируются только для сопровождаемых сторон. Для каждой задачи фиксируются action, evidence, expected result, owner, deadline и gate impact.

### PR #400 — detached server adapter

Server recomputation не доверяет client legal passport/work plan, запрещает client owner IDs и чувствительные идентификаторы.

### PR #402 — detached integration preview

- UUID request ID;
- verified actor и trusted owner context;
- legacy projection inventory;
- 13 поддержанных и 12 неподдержанных правил;
- production call всегда выключен.

### PR #404 — governed atomic save boundary

Repository-only prototype доказал:

- private request ledger;
- actor + payload fingerprint;
- advisory lock;
- exact and concurrent replay;
- atomic rollback после injected failure;
- owner-aware participants/tasks;
- side-aware document plan;
- fail-closed unsupported semantics.

### PR #406 — exact production-schema mapping rehearsal

Merge: `687002e6119207fb0719283b8d786e3b0bc72ced`.

Добавлены:

- read-only snapshot действующих columns/constraints/indexes/grants;
- pure mapper governed plan → существующие deal/participant/document/risk/task/event columns;
- exact PostgreSQL 17 write-surface harness;
- 13 supported-rule fixtures;
- FK, enum, check, replay, rollback и trigger assertions;
- explicit `production_ready=false`.

Ключевые совместимости:

- intake scope `object` и `deal` отсутствуют в production `nav_v2_side`; rehearsal отображает их в `both`, сохраняя исходный scope в `source_hint`;
- risk level `info` отсутствует в production enum и отображается в `green`, сохраняя broker route отдельно;
- task owner отображается только в разрешённые `legal_blocker`, `broker_task`, `operational_task`;
- новый task source использует `intake_v1:`, а не `auto_`, поэтому не получает неявный auto due date.

## Главный найденный P0-блокер

### Privacy guard и quality trigger противоречат друг другу

Production privacy trigger намеренно очищает:

- `seller_name`;
- `buyer_name`;
- телефоны сторон;
- запрещённые client identifiers в JSON.

После вставки production quality trigger видит пустые имена и создаёт задачи:

- `Указать продавца`;
- `Указать покупателя`.

PostgreSQL 17 rehearsal воспроизвёл две такие задачи для каждой privacy-compliant новой карточки.

Это ложный и потенциально незакрываемый backlog, потому что текущая privacy-модель не разрешает хранить эти ФИО в Navigator.

До решения конфликт остаётся обязательным STOP:

`privacy_quality_task_collision`

Нельзя подключать governed intake mapper к production save path, пока этот STOP не закрыт и не проверен authenticated matrix.

## Supported и unsupported rules

Поддержанные structural mapping rules:

- `minor_seller`;
- `minor_buyer`;
- `child_money`;
- `power_of_attorney`;
- `shares`;
- `minor_registered`;
- `privatisation`;
- `court_basis`;
- `matcap`;
- `mortgage`;
- `military_mortgage`;
- `settlements_not_agreed`;
- `expenses_not_agreed`.

Fail-closed rules:

- `spouse`;
- `seller_absent`;
- `encumbrance`;
- `inheritance`;
- `bankruptcy_risk`;
- `redevelopment`;
- `after_registration`;
- `legal_problem`;
- `partner_agency`;
- `flat_ground`;
- `house_land`;
- `certificate`.

## Канонические intake-артефакты

- `docs/NAV_V2_SPN_INTAKE_AUDIT_2026-07-17.md`
- `docs/NAV_V2_SPN_INTAKE_DESIGN_2026-07-17.md`
- `config/nav-v2-intake-contract-v1.json`
- `docs/NAV_V2_INTAKE_SERVER_ADAPTER_V1_2026-07-18.md`
- `supabase/prototypes/nav_v2_intake_save_adapter_v1.sql`
- `docs/NAV_V2_INTAKE_SAVE_INTEGRATION_V1_2026-07-18.md`
- `config/nav-v2-intake-save-integration-v1.json`
- `supabase/prototypes/nav_v2_intake_save_integration_v1.sql`
- `docs/NAV_V2_GOVERNED_INTAKE_SAVE_BOUNDARY_V1_2026-07-18.md`
- `config/nav-v2-governed-intake-save-boundary-v1.json`
- `supabase/prototypes/nav_v2_governed_intake_save_boundary_v1.sql`
- `docs/NAV_V2_INTAKE_PRODUCTION_SCHEMA_MAPPING_V1_2026-07-20.md`
- `config/nav-v2-intake-production-schema-mapping-v1.json`
- `supabase/prototypes/nav_v2_intake_production_schema_mapping_v1.sql`

## Binding ограничения

Issue #282 остаётся обязательным cost/deployment gate.

Generic команда `продолжай` не является:

- согласием на платную Supabase branch;
- согласием на technical accounts;
- согласием на production migration;
- согласием на Edge deployment;
- согласием на изменение RLS/grants/Auth;
- согласием на массовый backfill или cleanup.

Не изменять production `leader_*`. Navigator использует только `nav_*` / `nav_v2_*` и общий Auth.

## Следующий безопасный slice

Без production approval выполнить repository-only redesign quality completeness:

1. Зафиксировать contract, что ФИО и телефоны не являются quality requirement Navigator.
2. Заменить name-based quality checks структурированными признаками:
   - определена ли сопровождаемая сторона;
   - назначен ли СПН этой стороны;
   - понятен ли объект или причина его отсутствия;
   - есть ли следующий шаг;
   - есть ли срок или отметка «дата неизвестна»;
   - при handoff указан ли конкретный вопрос профильной роли.
3. Сделать checks representation-aware:
   - seller-only не получает buyer requirement;
   - buyer-only не получает seller requirement;
   - partner/unknown не угадывают сторону;
   - две стороны проверяются отдельно.
4. Подготовить repository-only replacement function/trigger prototype без migration-файла.
5. Доказать в PostgreSQL 17:
   - zero name/phone tasks;
   - bounded completeness tasks;
   - no duplicate open task;
   - completion/auto-close contract;
   - old quality tasks inventory без массового изменения;
   - rollback к exact production trigger snapshot.
6. Провести read-only production impact preview.
7. Не применять prototype к production без отдельного owner/deployment approval.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #406. Следующий slice — repository-only privacy-aligned quality completeness contract: убрать зависимость от запрещённых ФИО, сделать representation-aware bounded checks, PG17 lifecycle/rollback и read-only production impact preview. Не применяй migration, не создавай Supabase branch и не меняй production без explicit owner/deployment/cost approval.`
