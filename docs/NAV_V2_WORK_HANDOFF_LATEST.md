# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-16.
- Репозиторий: `deputat36/vktg`.
- Production `main`: `9e8f08617bb3f7735acc4e56370f7fda5077d485` — squash merge PR #369.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.6.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Последняя общая production migration: `20260716133531_leader_calculation_revisions`; она не относится к Navigator.
- Consultation, corporate-document и bounded-task SQL находятся только в `supabase/prototypes`.
- Production consultation/corporate-document таблиц и RPC нет.
- Production bounded-task mutation table, contract columns и RPC отсутствуют.
- Production Auth, Edge Functions, Navigator RLS/grants, status guards и назначения сотрудников после PR #349 не менялись.

Live counts могут меняться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Цель продукта

Navigator — единая заявка на подготовку и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`вопрос/потребность → короткий сбор фактов → маршрутизация → план документов и условий → решение профильной роли → выполнение → подтверждение готовности → задаток/сделка → закрытие`

Navigator не является CRM, файловым архивом, банковской CRM или автоматическим юристом.

Критерий пользы: меньше ручных действий и меньше потерянных обязательств, чем бумажная карточка, устные консультации и разрозненная переписка вместе.

## Границы ролей

### СПН

- фиксирует факты и договорённости;
- создаёт короткий юридический запрос;
- собирает документы после подтверждения маршрута;
- выполняет конкретные задачи с владельцем, сроком, критерием и evidence;
- отвечает за корпоративные документы по представляемой стороне;
- не принимает юридическое или ипотечное решение самостоятельно.

### Юрист

- отвечает, запрашивает уточнение или рекомендует полную подготовку;
- принимает юридические решения;
- проверяет юридические документы;
- готовит договоры сделки;
- подтверждает юридические gates.

### Ипотечный брокер

- консультирует клиента и СПН по ипотеке;
- подбирает ипотечную программу;
- помогает получить одобрение банка;
- обучает СПН ипотечным требованиям;
- принимает финансовое решение только в ипотечном контуре.

Маткапитал и сертификаты без ипотеки относятся к СПН и юристу. При сочетании с ипотекой брокер ведёт только ипотечную часть. Юридическая подготовка и оформление ипотечной сделки остаются у СПН и юриста.

### Менеджер

- помогает новичкам;
- видит запросы и процессы своей команды;
- контролирует сроки, отсутствие владельца и зависшие исключения;
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
- `docs/NAV_V2_CONSULTATION_LIFECYCLE_PROTOTYPE_2026-07-16.md` — consultation lifecycle.
- `docs/NAV_V2_CONSULTATION_SERVER_ADAPTER_2026-07-16.md` — consultation consumer contract.
- `docs/NAV_V2_CONSULTATION_POSTGRES_HARNESS_2026-07-16.md` — executable consultation SQL regression.
- `docs/NAV_V2_CORPORATE_DOCUMENTS_CONTRACT_2026-07-16.md` — отдельный корпоративный цикл.
- `docs/NAV_V2_CORPORATE_DOCUMENT_MUTATIONS_2026-07-16.md` — governed corporate mutations.
- `docs/NAV_V2_BOUNDED_TASK_CONTRACT_2026-07-16.md` — bounded taxonomy, SLA и evidence.
- `docs/NAV_V2_BOUNDED_TASK_MUTATIONS_2026-07-16.md` — governed bounded-task mutations.
- `docs/NAV_V2_BOUNDED_TASK_SERVER_ADAPTER_2026-07-16.md` — transport-free task adapter.

## Live baseline 16 июля 2026 года

Read-only production-срез:

- 5 активных профилей: owner, lawyer, 3 СПН;
- активного manager и broker нет;
- 23 сделки;
- 98 production-задач;
- все 98 задач имеют `task_type = null` и `sla_days = null`;
- production task table содержит только старые поля и старый nullable type constraint;
- `task_contract_version` и остальные bounded columns отсутствуют;
- `nav_deal_task_mutation_events_v2` отсутствует;
- `nav_v2_create_bounded_tasks`, start и complete RPC отсутствуют;
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

### PR #356–#365 — consultation flow

- один экран минимальных фактов;
- privacy guard;
- структурированная передача юристу;
- lightweight consultation entity и messages;
- idempotent create через `client_request_id`;
- role-scoped list и detail;
- `answer`, `need_info`, explicit `convert_to_preparation`;
- обязательный `conversion_mode=deposit|deal`;
- transport-free frontend adapter;
- PostgreSQL 17 base → hardening execution;
- ACL, privacy, lifecycle, no-backlog и rollback assertions.

Последние ключевые commits:

- consultation PostgreSQL harness: `6ec3d053e16c69d696789115fcc68a742922c721`;
- consultation adapter hardening: `131be05b1fba1d1e0c734937d132e9f9930ad0b1`.

### PR #361 и #366 — corporate documents

Отдельный repository-only lifecycle:

- договор оказания услуг;
- акт осмотра;
- дополнительное соглашение;
- акт выполненных работ;
- paper/online signing;
- template code/version;
- signed-or-confirmed completion;
- отдельная corporate readiness;
- explicit selected initialization;
- idempotent governed mutations;
- СПН работает только со своей стороной;
- evidence для template/signing/external confirmation;
- двухэтапные исключения;
- audit event table;
- PostgreSQL 17 assertions и rollback.

Последний merge: `6f1202185b5d287c0933351479068c92562bbdcf`.

### PR #363, #368 и #369 — bounded tasks

Contract v2 определяет 10 типов:

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

PR #368 добавил repository-only governed mutations:

- explicit batch 1–5;
- конкретный `assigned_to`;
- UUID предмета задачи;
- catalog-generated title;
- idempotency и audit events;
- active duplicate guard;
- `open → in_progress`;
- evidence-confirmed completion;
- active `waiting_external/deferred` с review date;
- proposal → manager/owner/admin decision для terminal outcomes;
- replacement только другой активной bounded-задачей той же сделки;
- generic task creation guard;
- legacy status RPC не меняет contract-v2 rows;
- PostgreSQL 17 role/SLA/evidence/idempotency/separation assertions и rollback.

PR #369 добавил pure transport-free adapter:

- exact RPC-preview для create/start/complete/outcomes;
- catalog/SLA/evidence/subject validation;
- обязательные UUID;
- DTO minimization;
- `transport_enabled=false`;
- routes/menu и production transport не менялись.

Последние merges:

- bounded mutations: `9bb68e7fc52e17944900db755faae9fa9f422883`;
- bounded adapter: `9e8f08617bb3f7735acc4e56370f7fda5077d485`.

## Принцип дальнейшей работы

Каждый создаваемый системой пункт обязан иметь полный lifecycle:

`триггер → владелец → срок → действие → evidence → предложение исхода → подтверждение → влияние на gate`

Автоматический backlog нельзя расширять без completion contract.

## Следующий безопасный slice

P0/P1 — controlled legacy task review pack без mutations и без массового backfill.

### Review pack должен

- работать только с read-only метаданными существующих задач;
- использовать нейтральные `task_reference` и `deal_reference`;
- не возвращать title, description, адреса, ФИО клиентов, телефоны или URL;
- показывать source, status, assigned role, assignee, due date и age;
- предлагать bounded task type только при высокоуверенном source mapping;
- для неизвестных source требовать manual review;
- показывать catalog roles, default/max SLA, evidence kinds и gate scope;
- иметь решения `leave_legacy`, `candidate_for_recreate`, `manual_review`, `retire_after_evidence`;
- не обновлять существующую строку;
- не создавать новую задачу;
- не завершать или отменять задачу;
- не менять readiness, risk gates или deal status;
- не использовать результаты как оценку сотрудников.

### Проверки

- synthetic scenario matrix;
- role-scoped read contract для owner/admin/manager;
- СПН/lawyer/broker/viewer не получают массовый review-list;
- no client/free-form fields в DTO;
- source mapping не относит маткапитал или сертификаты к брокеру;
- exact count/no-write guarantees;
- production read-only query остаётся отдельной от repository prototype.

После review pack:

1. repository-only UI preview для выборочного решения;
2. controlled list из 10–15 задач только после решения владельца;
3. consumer matrix старых `nav_v2_add_task`/status вызовов;
4. authenticated application E2E после approval среды;
5. отдельный deploy PR с объединёнными migrations и минимальными grants;
6. только после deploy добавить официальные routes/menu;
7. controlled pilot;
8. security hardening.

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
- Не включать bounded-task transport до deployment.

## Decision gates владельца

Отложить до момента, когда они блокируют соответствующую волну:

1. кто является manager controlled pilot;
2. какие 10–15 кейсов и сотрудники входят в пилот;
3. применяется ли отдельный ПОД/ФТ-контур и кто его владелец;
4. утверждённые document source domains и retention rules;
5. approval стоимости Supabase preview branch для authenticated application E2E;
6. обязательность и стадии корпоративных документов;
7. утверждённый registry корпоративных шаблонов;
8. разрешение на выборочный review/recreate legacy tasks.

## Не повторять без новой причины

- общий технический аудит;
- аудит фактического процесса;
- broker scope correction;
- DTO/privacy masking;
- outcome/readiness prototypes;
- fast consultation preview;
- consultation lifecycle base/hardening/adapter/harness;
- corporate document contract/mutations/harness;
- bounded task taxonomy/mutations/adapter/harness;
- production cleanup без решения владельца.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #369. Создай repository-only controlled legacy task review pack без mutations и массового backfill. Не применяй prototypes к production, не создавай платную Supabase branch, не меняй production grants/RLS/Auth и не используй review results для оценки сотрудников.`
