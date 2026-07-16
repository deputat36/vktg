# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 2026-07-16.
- Репозиторий: `deputat36/vktg`.
- Production `main`: `1a0fcc008b7e52a16cbd201a9139a35b7223c33c` — squash merge PR #375.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.6.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Последняя общая production migration: `20260716133531_leader_calculation_revisions`; она не относится к Navigator.
- Consultation, corporate-document, bounded-task и legacy-review SQL находятся только в `supabase/prototypes`.
- Production consultation/corporate-document сущностей нет.
- Production bounded-task contract columns, mutation events и governed RPC отсутствуют.
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
- `docs/NAV_V2_OFFICE_PROCESS_AUDIT_2026-07-16.md` — фактический процесс офиса.
- `docs/NAV_V2_MORTGAGE_BROKER_SCOPE_2026-07-16.md` — зона ответственности брокера.
- `docs/NAV_V2_WORK_ITEM_OUTCOME_CONTRACT_2026-07-16.md` — исходы документов и рисков.
- `docs/NAV_V2_CONSULTATION_LIFECYCLE_PROTOTYPE_2026-07-16.md` — consultation lifecycle.
- `docs/NAV_V2_CONSULTATION_POSTGRES_HARNESS_2026-07-16.md` — executable consultation SQL regression.
- `docs/NAV_V2_CORPORATE_DOCUMENTS_CONTRACT_2026-07-16.md` — отдельный корпоративный цикл.
- `docs/NAV_V2_CORPORATE_DOCUMENT_MUTATIONS_2026-07-16.md` — governed corporate mutations.
- `docs/NAV_V2_BOUNDED_TASK_CONTRACT_2026-07-16.md` — bounded taxonomy, SLA и evidence.
- `docs/NAV_V2_BOUNDED_TASK_MUTATIONS_2026-07-16.md` — governed bounded-task mutations.
- `docs/NAV_V2_BOUNDED_TASK_SERVER_ADAPTER_2026-07-16.md` — transport-free task adapter.
- `docs/NAV_V2_LEGACY_TASK_REVIEW_PACK_2026-07-16.md` — controlled read-only review legacy tasks.
- `docs/NAV_V2_TASK_RPC_CONSUMER_MATRIX_2026-07-16.md` — runtime consumer/deployment gate.
- `docs/NAV_V2_DEAL_CARD_LITE_BOUNDED_DTO_2026-07-16.md` — contract-aware lite DTO.
- `docs/NAV_V2_BOUNDED_TASK_UI_PREVIEW_2026-07-16.md` — direct-link synthetic UI.
- `docs/NAV_V2_TASK_DUAL_PATH_CONTRACT_2026-07-16.md` — pure legacy/bounded action router.

## Live baseline 16 июля 2026 года

Read-only production-срез:

- 5 активных профилей: owner, lawyer, 3 СПН;
- активного manager и broker нет;
- 23 сделки;
- 98 production-задач;
- все 98 задач имеют `task_type = null` и `sla_days = null`;
- `task_contract_version` и остальные bounded columns отсутствуют;
- `nav_deal_task_mutation_events_v2` отсутствует;
- governed bounded-task RPC отсутствуют;
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

- быстрый privacy-safe intake;
- lightweight consultation entity/messages;
- idempotent create;
- role-scoped list/detail;
- `answer`, `need_info`, explicit `convert_to_preparation`;
- transport-free adapter;
- PostgreSQL 17 base → hardening, ACL, lifecycle, no-backlog и rollback assertions.

Ключевые merges:

- consultation harness: `6ec3d053e16c69d696789115fcc68a742922c721`;
- adapter hardening: `131be05b1fba1d1e0c734937d132e9f9930ad0b1`.

### PR #361 и #366 — corporate documents

- отдельный корпоративный документный lifecycle;
- договор оказания услуг, акт осмотра, дополнительное соглашение, акт выполненных работ;
- paper/online signing и template version;
- explicit selected initialization;
- governed idempotent mutations;
- evidence и двухэтапные исключения;
- audit event table;
- PostgreSQL 17 assertions и rollback.

Последний merge: `6f1202185b5d287c0933351479068c92562bbdcf`.

### PR #363, #368 и #369 — bounded task core

Contract v2 содержит 10 конкретных task types с owner roles, default/max SLA, completion criterion, evidence kinds и gate scope.

PR #368 добавил:

- explicit batch 1–5;
- конкретного исполнителя и UUID предмета;
- catalog-generated title;
- idempotency, duplicate guard и audit events;
- evidence-confirmed completion;
- active `waiting_external/deferred`;
- proposal → decision для terminal outcomes;
- legacy guards;
- PostgreSQL 17 assertions и rollback.

PR #369 добавил pure transport-free adapter и exact RPC previews.

Ключевые merges:

- bounded mutations: `9bb68e7fc52e17944900db755faae9fa9f422883`;
- bounded adapter: `9e8f08617bb3f7735acc4e56370f7fda5077d485`.

### PR #371 — controlled legacy task review pack

- read-only metadata и нейтральные task/deal references;
- high-confidence source mapping;
- `leave_legacy`, `candidate_for_recreate`, `manual_review`, `retire_after_evidence`;
- owner/admin/manager scope;
- маткапитал и сертификаты не маршрутизируются к брокеру;
- no-write/no-backfill PostgreSQL regression.

Merge: `fe05f5b6cccfe4a5fb134ea1103bc5d66fcdd8fb`.

### PR #372 — legacy RPC consumer matrix

- зафиксированы три runtime consumer path старого status RPC;
- подтверждено отсутствие runtime consumer старого add-task RPC;
- deployment blockers закреплены CI.

Merge: `1a48d67408cd9dde7ce54b5d9c9010325830fdff`.

### PR #373 — deal-card-lite bounded DTO

- DTO v2 возвращает bounded contract/outcome fields;
- separate permissions start/complete/active outcome/proposal/decision;
- legacy coexistence без mass backfill;
- PostgreSQL 17 privacy/role/no-write regression.

Merge: `054c6855d91245ee6c99062ec98b18c931644e52`.

### PR #374 — bounded task UI preview

- direct-link synthetic coexistence UI;
- evidence UUID, waiting/deferred и terminal outcomes;
- exact transport-free RPC previews;
- не входит в role menu и не обращается к Supabase.

Merge: `1ec650be29b10be01ace0be63b4e545504edd349`.

### PR #375 — task dual-path action contract

- pure authoritative router candidate;
- legacy row → старый status RPC preview;
- contract-v2 row → governed RPC preview;
- bounded completion требует evidence;
- bounded reopen запрещён и заменён новой audited-задачей;
- transport-free Edge action validation contract;
- 10 semantic routes и synthetic Playwright regression;
- один клик → один route preview, сетевых RPC вызовов нет.

Merge: `1a0fcc008b7e52a16cbd201a9139a35b7223c33c`.

## Принцип дальнейшей работы

Каждый создаваемый системой пункт обязан иметь полный lifecycle:

`триггер → владелец → срок → действие → evidence → предложение исхода → подтверждение → влияние на gate`

Автоматический backlog нельзя расширять без completion contract.

## Следующий безопасный slice

P0/P1 — repository-only authoritative handler integration rehearsal.

### Rehearsal должен

- работать только на synthetic fixture;
- использовать `task-action-router-v2.js` как единственный handler;
- доказать отсутствие competing base listener;
- проверить DTO → router → Edge payload contract;
- покрыть legacy start/complete/reopen;
- покрыть bounded start/complete/wait/defer/proposal/decision;
- отклонять bounded reopen;
- не импортироваться в production `deal-card-v2.js`, `task-action-guard-v2.js` или Edge `index.ts`;
- не вызывать сеть;
- не менять Supabase, routes или role menu.

После rehearsal:

1. реальная frontend integration с transport disabled;
2. удаление конкурирующего base listener;
3. authenticated application E2E после approval среды;
4. отдельный database deploy PR с объединёнными migrations и minimal grants;
5. Edge action integration/deployment;
6. controlled transport switch;
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
- Не использовать review/pilot metrics для оценки сотрудников.
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
- consultation lifecycle base/hardening/adapter/harness;
- corporate document contract/mutations/harness;
- bounded task taxonomy/mutations/adapter/harness;
- legacy task review pack;
- task consumer inventory;
- bounded lite DTO/UI/dual-path contract;
- production cleanup без решения владельца.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #375. Создай repository-only authoritative handler integration rehearsal на synthetic fixture. Не интегрируй его в production runtime, не вызывай сеть, не применяй prototypes к production, не создавай платную Supabase branch и не меняй production grants/RLS/Auth.`
