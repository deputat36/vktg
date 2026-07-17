# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 17 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- Production `main`: `c79ecc080e49ad579ecdc9ae666164df597b2726` — squash merge PR #381.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.6.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Последняя общая production migration: `20260716133531_leader_calculation_revisions`; она не относится к Navigator.
- Consultation, corporate-document, bounded-task и legacy-review SQL остаются только в `supabase/prototypes`.
- Production consultation/corporate-document сущностей нет.
- Production bounded-task contract columns, mutation event table и governed RPC отсутствуют.
- Production Auth, Edge Functions, Navigator RLS/grants, status guards и назначения сотрудников после PR #349 не менялись.

Live counts могут меняться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Цель продукта

Navigator — единая заявка на подготовку и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`вопрос/потребность → короткий сбор фактов → маршрутизация → план документов и условий → решение профильной роли → выполнение → evidence → подтверждение готовности → задаток/сделка → закрытие`

Navigator не является CRM, файловым архивом, банковской CRM или автоматическим юристом.

Критерий пользы: меньше ручных действий и потерянных обязательств, чем бумажная карточка, устные консультации и разрозненная переписка вместе.

## Границы ролей

### СПН

- фиксирует факты и договорённости;
- создаёт короткий юридический запрос;
- собирает документы после подтверждения маршрута;
- выполняет задачи с владельцем, сроком, критерием и evidence;
- отвечает за корпоративные документы по представляемой стороне;
- не принимает юридическое или ипотечное решение самостоятельно.

### Юрист

- отвечает, запрашивает уточнение или рекомендует полную подготовку;
- принимает юридические решения;
- проверяет юридические документы;
- готовит договоры сделки;
- подтверждает юридические gates.

### Ипотечный брокер

- консультирует по ипотеке;
- подбирает ипотечную программу;
- помогает получить одобрение банка;
- обучает СПН ипотечным требованиям;
- принимает финансовое решение только в ипотечном контуре.

Маткапитал и сертификаты без ипотеки относятся к СПН и юристу. При сочетании с ипотекой брокер ведёт только ипотечную часть. Юридическая подготовка остаётся у СПН и юриста.

### Менеджер

- помогает новичкам;
- видит процессы своей команды;
- контролирует сроки, отсутствие владельца и зависшие исключения;
- подтверждает процессные исключения;
- не заменяет юриста или брокера.

### Owner/admin

- видит весь контур;
- принимает исключительные решения с аудитом;
- утверждает deployment, document-source policy и controlled pilot.

## Канонические документы

- `docs/NAV_V2_FULL_AUDIT_2026-07-15.md` — технический и compliance-аудит.
- `docs/NAV_V2_OFFICE_PROCESS_AUDIT_2026-07-16.md` — фактический процесс офиса.
- `docs/NAV_V2_MORTGAGE_BROKER_SCOPE_2026-07-16.md` — зона ответственности брокера.
- `docs/NAV_V2_WORK_ITEM_OUTCOME_CONTRACT_2026-07-16.md` — исходы документов и рисков.
- `docs/NAV_V2_CONSULTATION_POSTGRES_HARNESS_2026-07-16.md` — consultation PostgreSQL 17 regression.
- `docs/NAV_V2_CORPORATE_DOCUMENT_MUTATIONS_2026-07-16.md` — governed corporate mutations.
- `docs/NAV_V2_BOUNDED_TASK_CONTRACT_2026-07-16.md` — bounded taxonomy, SLA и evidence.
- `docs/NAV_V2_BOUNDED_TASK_MUTATIONS_2026-07-16.md` — governed bounded-task mutations.
- `docs/NAV_V2_LEGACY_TASK_REVIEW_PACK_2026-07-16.md` — controlled read-only legacy review.
- `docs/NAV_V2_TASK_RPC_CONSUMER_MATRIX_2026-07-16.md` — task consumer/deployment gate v4.
- `docs/NAV_V2_TASK_DUAL_PATH_CONTRACT_2026-07-16.md` — pure legacy/bounded router.
- `docs/NAV_V2_TASK_AUTHORITATIVE_HANDLER_REHEARSAL_2026-07-16.md` — capture-handler rehearsal.
- `docs/NAV_V2_TASK_ROLE_MATRIX_REHEARSAL_2026-07-17.md` — cost-free mocked role matrix.
- `docs/NAV_V2_AUTH_E2E_TARGET_RUNBOOK.md` — настоящий authenticated E2E после отдельного approval.

## Live production baseline

Последний read-only срез:

- 5 активных профилей: owner, lawyer, 3 СПН;
- активного manager и broker нет;
- 23 сделки;
- 98 production-задач;
- все 98 задач — legacy rows без `task_contract_version`;
- `task_contract_version` и остальные bounded columns отсутствуют;
- `nav_deal_task_mutation_events_v2` отсутствует;
- governed bounded-task RPC отсутствуют;
- production consultation и corporate-document сущностей нет.

Не использовать сырые показатели для оценки сотрудников: присутствуют тестовые, учебные и исторические записи.

## Завершённые волны

### PR #347–#354 — privacy, process, outcomes и readiness

- evidence-only duplicate handling;
- правильная зона ипотечного брокера;
- минимальные DTO;
- двухэтапные исходы документов и рисков;
- outcome-aware readiness;
- synthetic role/funding/readiness scenarios.

### PR #356–#365 — consultation flow

- privacy-safe intake;
- consultation entity/messages;
- idempotent create;
- role-scoped list/detail;
- `answer`, `need_info`, explicit conversion;
- transport-free adapter;
- PostgreSQL 17 ACL/lifecycle/no-backlog/rollback assertions.

### PR #361 и #366 — corporate documents

- отдельный lifecycle корпоративных документов;
- explicit selected initialization;
- idempotent governed mutations;
- evidence и двухэтапные исключения;
- audit events;
- PostgreSQL 17 assertions и rollback.

### PR #363, #368 и #369 — bounded task core

- 10 bounded task types;
- owner roles, default/max SLA, completion criterion, evidence kinds и gate scope;
- explicit batch 1–5;
- конкретный исполнитель и UUID предмета;
- catalog-generated title;
- idempotency, duplicate guard и audit events;
- evidence-confirmed completion;
- active `waiting_external/deferred`;
- terminal proposal → decision;
- PostgreSQL 17 regression;
- pure transport-free adapter.

### PR #371–#375 — legacy coexistence и dual-path

- controlled read-only review pack;
- точная inventory старых task RPC consumers;
- contract-aware lite DTO prototype;
- direct-link bounded UI preview;
- pure legacy/bounded router;
- Edge validation contract;
- synthetic no-network browser regression.

### PR #377 — authoritative handler rehearsal

Synthetic capture-phase rehearsal доказал:

- authoritative handler calls: 8;
- base listener calls: 0;
- competing guard calls: 0;
- network RPC calls: 0;
- bounded reopen отклоняется.

Merge: `36095c55d6e8294264ebe133f91766f1b8dd8588`.

### PR #378 — authoritative frontend integration

`task-action-guard-v2.js` стал рабочим authoritative capture-handler:

- использует dual-path router;
- владеет task click в capture phase;
- сохраняет legacy `nav_v2_update_task_status` payload;
- cold first click выполняется без повторного нажатия;
- bounded action распознаётся, но transport выключен;
- bounded completion проверяет evidence/client-request UUID;
- bounded reopen отключён;
- desktop/mobile regression зелёный.

Merge: `dbf8c7b83c701e48d3f78e69cda7b7a4aea56182`.

### PR #380 — single-source frontend cleanup

Из `deal-card-v2.js` физически удалены:

- base task `onclick` mutation listener;
- direct literal `nav_v2_update_task_status`;
- base task success/error mutation path.

Сохранены task rendering и legacy button attributes. `task-action-guard-v2.js` теперь единственный frontend source действий по задачам. Consumer matrix обновлён до v4.

Merge: `4afe6fff4d89be349a3a2c551a3e2eb3c9a4a2e1`.

### PR #381 — cost-free mocked role matrix

Без Supabase branch и реальных аккаунтов проверены desktop/mobile scenarios:

- owner;
- admin;
- manager;
- assigned SPN;
- assigned lawyer;
- assigned broker;
- viewer;
- unassigned SPN.

Проверены exact legacy payload, DTO permissions, manager/owner/admin terminal decision scope, bounded no-network и disabled reopen.

Это не доказывает реальный Auth, JWT, RLS, grants или Edge authorization.

Merge: `c79ecc080e49ad579ecdc9ae666164df597b2726`.

## Текущий task runtime

### Legacy rows

- frontend owner: `task-action-guard-v2.js`;
- route: `task-action-router-v2.js`;
- RPC: `nav_v2_update_task_status({ p_task_id, p_status })`;
- start/complete/reopen работают через старый production contract.

### Bounded rows

- DTO, router, adapter, SQL mutations и browser previews готовы только в repository prototypes;
- `BOUNDED_TRANSPORT_ENABLED = false`;
- governed RPC отсутствуют в production;
- bounded reopen запрещён;
- mass backfill 98 legacy rows запрещён.

## Cost gate: Issue #282

Решение владельца от 15 июля 2026 года:

- платную Supabase preview branch не создавать;
- generic-команда «продолжай» не является cost approval;
- разрешены static/source contracts, fixtures, mocked RPC и бесплатная CI-изоляция;
- skipped authenticated job не считать доказательством ролевой матрицы.

Настоящий authenticated cloud E2E остаётся заблокирован до нового явного подтверждения стоимости.

## Принцип дальнейшей работы

Каждый создаваемый системой пункт обязан иметь полный lifecycle:

`триггер → владелец → срок → действие → evidence → предложение исхода → подтверждение → влияние на gate`

Автоматический backlog нельзя расширять без completion contract.

## Следующий безопасный slice

P0/P1 — cost-free task action pipeline rehearsal без cloud deployment.

### Pipeline rehearsal должен

- связать frontend `taskActionRoutePreview()` с detached Edge `validateTaskEdgeAction()`;
- использовать один canonical action mapping legacy/bounded;
- проверять exact RPC name и args;
- отклонять legacy action для contract-v2 row;
- отклонять governed action для legacy row;
- отклонять unknown fields, invalid UUID, enum/date и replacement errors;
- доказывать один action → один validated RPC call preview;
- не вызывать сеть;
- не применять SQL к production;
- не импортировать Edge contract в deployed `index.ts`;
- не включать bounded transport;
- иметь Node/browser tests и CI evidence;
- явно не называться Auth/RLS/grants proof.

После pipeline rehearsal:

1. продолжать бесплатные isolated checks до нового решения Issue #282;
2. настоящий authenticated application E2E — только после explicit cost approval;
3. отдельный database deploy PR с объединёнными migrations и minimal grants;
4. Edge action integration/deployment после database deployment;
5. controlled bounded transport switch;
6. controlled pilot;
7. security hardening.

## Ручные ограничения

- Issue #273: duplicate cleanup запрещён без решения владельца.
- Не менять назначения сотрудников без evidence и подтверждения владельца.
- Не очищать исторические строки автоматически.
- Не применять repository-only prototypes к production.
- Не создавать платную Supabase branch без нового явного согласования Issue #282.
- Не считать mocked/skipped E2E доказательством Auth/RLS/grants.
- Не менять production grants, RLS, Auth или Edge Functions без отдельного deploy slice.
- Не хранить сканы, подписи, client identifiers или document URL.
- Не выдавать автоматическую маршрутизацию за юридическое заключение.
- Не использовать review/pilot metrics для оценки сотрудников.
- Не менять production status guards до authenticated tests.
- Не выполнять массовый task backfill.
- Не включать bounded transport до database/Edge deployment.

## Decision gates владельца

1. новый explicit cost approval для Supabase preview branch;
2. кто является manager controlled pilot;
3. какие 10–15 кейсов и сотрудники входят в pilot;
4. применяется ли отдельный ПОД/ФТ-контур и кто его владелец;
5. approved document source domains и retention rules;
6. обязательность и стадии корпоративных документов;
7. approved registry корпоративных шаблонов;
8. разрешение на выборочный review/recreate legacy tasks.

## Не повторять без новой причины

- общий технический аудит;
- аудит фактического процесса;
- broker scope correction;
- DTO/privacy masking;
- outcome/readiness prototypes;
- consultation lifecycle/adapter/harness;
- corporate document contract/mutations/harness;
- bounded task taxonomy/mutations/adapter/harness;
- legacy review pack;
- task consumer inventory;
- bounded lite DTO/UI/dual-path contract;
- authoritative handler rehearsal/integration;
- dormant source cleanup;
- mocked role matrix;
- production cleanup без решения владельца.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #381. Создай cost-free task action pipeline rehearsal: frontend router → detached Edge validator → exact RPC preview, без сети, cloud branch, production SQL, Edge deployment, Auth/RLS/grants изменений и bounded transport.`
