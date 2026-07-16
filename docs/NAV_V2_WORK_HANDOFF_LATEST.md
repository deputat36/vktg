# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-16.
- Репозиторий: `deputat36/vktg`.
- Production `main`: `6f1202185b5d287c0933351479068c92562bbdcf` — squash merge PR #366.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.6.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Последняя общая production migration: `20260716133531_leader_calculation_revisions`; она не относится к Navigator.
- Consultation, corporate-document и bounded-task SQL находятся только в `supabase/prototypes`.
- Production consultation/corporate-document таблиц и RPC нет.
- Production Auth, Edge Functions, Navigator RLS/grants, status guards и назначения сотрудников после PR #349 не менялись.

Live counts могут меняться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Цель продукта

Navigator — единая заявка на подготовку и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`вопрос/потребность → короткий сбор фактов → маршрутизация → план документов и условий → решение профильной роли → выполнение → подтверждение готовности → задаток/сделка → закрытие`

Navigator не является CRM, файловым архивом или автоматическим юристом.

Критерий пользы: меньше ручных действий, чем бумажная карточка, устные консультации и разрозненная переписка вместе.

## Границы ролей

### СПН

- фиксирует факты и договорённости;
- создаёт короткий юридический запрос;
- собирает документы после подтверждения маршрута;
- выполняет конкретные задачи с owner, сроком, критерием и evidence;
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
- подбирает программу;
- помогает получить одобрение банка;
- принимает только финансовое решение в ипотечном контуре.

Маткапитал и сертификаты без ипотеки относятся к СПН и юристу. При сочетании с ипотекой брокер ведёт только ипотечную часть.

### Менеджер

- помогает новичкам;
- видит запросы и процессы своей команды;
- контролирует сроки и отсутствие владельца;
- подтверждает процессные исключения;
- не заменяет юриста или брокера.

### Owner/admin

- видит весь контур;
- принимает исключительные решения с аудитом;
- утверждает deployment, document-source policy и controlled pilot.

## Канонические документы

- `docs/NAV_V2_FULL_AUDIT_2026-07-15.md` — технический и compliance-аудит.
- `docs/NAV_V2_AUTONOMOUS_EXECUTION_PLAN_2026-07-15.md` — автономные волны и gates.
- `docs/NAV_V2_OFFICE_PROCESS_AUDIT_2026-07-16.md` — фактический процесс офиса.
- `docs/NAV_V2_MORTGAGE_BROKER_SCOPE_2026-07-16.md` — зона ответственности брокера.
- `docs/NAV_V2_WORK_ITEM_OUTCOME_CONTRACT_2026-07-16.md` — исходы документов и рисков.
- `docs/NAV_V2_OUTCOME_READINESS_PROTOTYPE_2026-07-16.md` — outcome-aware readiness.
- `docs/NAV_V2_FAST_CONSULTATION_INTAKE_2026-07-16.md` — быстрый frontend preview.
- `docs/NAV_V2_CONSULTATION_LIFECYCLE_PROTOTYPE_2026-07-16.md` — lightweight consultation lifecycle.
- `docs/NAV_V2_CONSULTATION_SERVER_ADAPTER_2026-07-16.md` — frontend/server consumer contract.
- `docs/NAV_V2_CONSULTATION_POSTGRES_HARNESS_2026-07-16.md` — executable consultation SQL regression.
- `docs/NAV_V2_CORPORATE_DOCUMENTS_CONTRACT_2026-07-16.md` — отдельный корпоративный цикл.
- `docs/NAV_V2_CORPORATE_DOCUMENT_MUTATIONS_2026-07-16.md` — governed corporate mutations.
- `docs/NAV_V2_BOUNDED_TASK_CONTRACT_2026-07-16.md` — bounded taxonomy, SLA и evidence.

## Live baseline 16 июля 2026 года

Read-only срез:

- 5 активных профилей: owner, lawyer, 3 СПН;
- активного manager и broker нет;
- 23 сделки;
- 98 production-задач;
- все 98 задач имеют `task_type = null` и `sla_days = null`;
- production task table пока содержит только старые поля и старый nullable type constraint;
- bounded task contract columns существуют только в repository prototype;
- 198 документов: 182 `needed`, 12 `received`, 4 `checked`;
- 53 риска: после PR #349 — 49 открыты и 4 закрыты;
- production consultation и corporate-document сущностей нет.

Не использовать сырые показатели для оценки сотрудников: присутствуют тестовые, учебные и исторические записи.

## Завершённые волны

### PR #347–#354 — privacy, process, outcomes и readiness

- evidence-only duplicate handling;
- аудит фактического процесса офиса;
- правильная зона ипотечного брокера;
- минимальные DTO;
- двухэтапные исходы документов и рисков;
- outcome-aware readiness;
- synthetic role/funding/readiness scenarios.

### PR #356 — fast consultation preview

- один экран минимальных фактов;
- структурированная передача юристу;
- privacy guard;
- безопасный локальный draft полного мастера;
- официальный role menu не менялся.

### PR #358 и hardening commit `8c9e6d1…`

Repository-only consultation lifecycle:

- `nav_consultations_v2` и messages;
- create/list/detail/decision/clarification/close RPC;
- idempotent create через `client_request_id`;
- explicit payload allowlist;
- role-scoped list;
- ограничение неназначенного юриста;
- обязательный `conversion_mode=deposit|deal`;
- расширенный privacy guard;
- effective ACL только для isolated service-role harness.

### PR #359 и PR #365 — consultation adapter

- frontend-коды приведены к server contract;
- URL исключён из будущего payload;
- queue/detail DTO используют allowlist;
- stable UUID хранится только в `sessionStorage`;
- create и four-argument decide имеют точные transport-free previews;
- unsafe conversion draft отклоняется;
- undeployed RPC не вызываются.

Последний merge: `131be05b1fba1d1e0c734937d132e9f9930ad0b1`.

### PR #362 — consultation PostgreSQL 17 harness

- synthetic Auth, роли и профили;
- base → hardening execution;
- реальные ACL, privacy, idempotency и lifecycle assertions;
- `need_info → clarification → new`;
- explicit `deposit/deal` conversion;
- no-backlog proof;
- rollback rehearsal.

Squash merge: `6ec3d053e16c69d696789115fcc68a742922c721`.

### PR #361 — корпоративные документы

Отдельный repository-only lifecycle:

- договор оказания услуг;
- акт осмотра;
- дополнительное соглашение;
- акт выполненных работ;
- paper/online signing;
- template code/version;
- signed-or-confirmed completion;
- отдельная corporate readiness;
- никакого изменения legal readiness, risk gates или deal status.

Squash merge: `62a8c99764257b8f039f64c0dafa954cd18e08ba`.

### PR #366 — governed corporate document mutations

- явная инициализация только выбранных строк;
- обязательный `client_request_id` и stored-result replay;
- явная ошибка при повторном использовании UUID другой операцией;
- СПН работает только со своей стороной;
- сторонний СПН не может быть назначен;
- bounded transitions `planned/prepared/sent/signed/problem`;
- evidence для шаблона, способа подписания и внешнего подтверждения;
- прямой `cancelled` запрещён;
- `not_applicable/replaced/cancelled` проходят proposal → manager/owner/admin decision;
- audit event table;
- service-role-only repository ACL;
- PostgreSQL 17 assertions и rollback прошли.

Squash merge: `6f1202185b5d287c0933351479068c92562bbdcf`.

### PR #363 — bounded task contract v2

10 конкретных типов:

- `document_request`;
- `document_check`;
- `term_approval`;
- `legal_decision`;
- `financial_decision`;
- `corporate_document_signing`;
- `card_correction`;
- `contract_preparation`;
- `appointment_scheduling`;
- `post_deal_action`.

Каждый тип имеет owner roles, default/max SLA, completion criterion, evidence kinds и gate scope.

`waiting_external` и `deferred` остаются активными и требуют review date. Терминальное исключение требует подтверждения. Existing 98 tasks не backfill-ятся.

Squash merge: `cff78e5ff17224dc6dbde4a560effa175e93a35b`.

## Принцип дальнейшей работы

Каждый создаваемый системой пункт обязан иметь полный lifecycle:

`триггер → владелец → срок → действие → evidence → предложение исхода → подтверждение → влияние на gate`

Автоматический backlog нельзя расширять без completion contract.

## Следующий безопасный slice

P0/P1 — governed bounded-task mutations + executable PostgreSQL 17 harness.

### Mutation contract должен

- создавать только одну явно подтверждённую задачу или небольшой выбранный batch;
- запрещать массовый backfill существующих 98 задач;
- требовать `client_request_id`;
- брать criterion, evidence kinds, owner roles и default/max SLA из catalog;
- проверять назначенного сотрудника и доступ к сделке;
- поддерживать `open → in_progress`;
- завершать `done` только с confirmed evidence и outcome `completed`;
- оставлять `waiting_external/deferred` активными и требовать review date;
- проводить `not_applicable/replaced/cancelled` через proposal → confirmation;
- требовать replacement task той же сделки;
- вести audit events;
- не менять readiness, risk gates или deal status автоматически;
- не создавать документы, риски и дополнительные задачи;
- не выдавать authenticated grants до отдельного deploy PR.

### PostgreSQL harness должен

- воспроизвести реальные task enums и базовые columns;
- применить bounded task contract;
- применить mutation overlay;
- проверить СПН/manager/lawyer/broker/owner/admin/viewer;
- проверить owner role per task catalog;
- проверить default/max SLA;
- проверить idempotency и unknown-key rejection;
- проверить evidence и terminal outcomes;
- проверить no-backfill и no-cross-surface mutations;
- выполнить rollback rehearsal.

После task mutation harness:

1. repository-only frontend mutation previews;
2. controlled review selected legacy tasks без массового backfill;
3. authenticated application E2E после approval среды;
4. отдельный deploy PR с объединёнными migrations и минимальными grants;
5. только после deploy добавить официальные menu/routes;
6. controlled pilot;
7. security hardening.

## Ручные ограничения

- Issue #273: duplicate cleanup запрещён без решения владельца.
- Не менять назначения сотрудников без evidence и подтверждения владельца.
- Не очищать исторические строки автоматически.
- Не применять repository-only prototypes к production.
- Не создавать платную Supabase branch без согласования стоимости issue #282.
- Не считать skipped authenticated job доказательством ролей.
- Не менять production grants, RLS, Auth или Edge Functions без отдельного deploy slice.
- Не хранить сканы, подписи, client identifiers или document URL.
- Не выдавать автоматическую маршрутизацию за юридическое заключение.
- Не использовать сырые pilot metrics для оценки сотрудников.
- Не менять production status guards до authenticated tests.
- Не выполнять массовый task backfill.

## Decision gates владельца

Отложить до момента, когда они блокируют соответствующую волну:

1. кто является manager controlled pilot;
2. какие 10–15 кейсов и сотрудники входят в пилот;
3. применяется ли отдельный ПОД/ФТ-контур и кто его владелец;
4. утверждённые document source domains и retention rules;
5. approval стоимости Supabase preview branch для authenticated application E2E;
6. обязательность и стадии корпоративных документов;
7. утверждённый registry корпоративных шаблонов.

## Не повторять без новой причины

- общий технический аудит;
- аудит фактического процесса;
- broker scope correction;
- DTO/privacy masking;
- outcome/readiness prototypes;
- fast consultation preview;
- consultation lifecycle base/hardening/adapter/harness;
- corporate document contract/mutations/harness;
- bounded task taxonomy contract;
- production cleanup без решения владельца.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #366. Создай repository-only governed mutation contract и executable PostgreSQL 17 harness для bounded tasks. Не выполняй массовый backfill, не применяй prototypes к production, не создавай платную Supabase branch и не меняй production grants/RLS/Auth.`
