# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 17 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- Production `main`: `bd7b0ca3365dbd2ec4b7cf04e409ec4ab1075556` — squash merge PR #392.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.6.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Последняя общая production migration: `20260716133531_leader_calculation_revisions`; она не относится к Navigator.
- Consultation, corporate-document, bounded-task, actor-aware и legacy-review SQL остаются только в `supabase/prototypes`.
- Production consultation/corporate-document сущностей нет.
- Production bounded-task columns, mutation event table, canonical governed RPC и actor-aware overloads отсутствуют.
- Production Auth, Edge Functions, Navigator RLS/grants, status guards и назначения сотрудников после PR #349 не менялись.

Live counts могут меняться от реальной работы пользователей. Не откатывать данные только из-за изменения counts.

## Цель и границы

Navigator — единая заявка на подготовку и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`потребность → короткий сбор фактов → маршрутизация → план документов и условий → решение профильной роли → выполнение → evidence → подтверждение готовности → задаток/сделка → закрытие`

Navigator не является CRM, файловым архивом, банковской CRM или автоматическим юристом.

- СПН фиксирует факты, собирает документы, выполняет задачи и отвечает за corporate docs своей стороны.
- Юрист принимает юридические решения, проверяет документы и подтверждает юридические gates.
- Брокер ведёт только ипотечную консультацию, программу и одобрение. Маткапитал/сертификаты без ипотеки — СПН + юрист.
- Менеджер контролирует команду, сроки и исключения, но не заменяет юриста/брокера.
- Owner/admin утверждает deployment, pilot и исключительные решения.

Каждый пункт обязан иметь lifecycle:

`trigger → owner → deadline → action → evidence → outcome → confirmation → gate impact`

Автоматический backlog нельзя расширять без completion contract.

## Канонические документы

- `docs/NAV_V2_FULL_AUDIT_2026-07-15.md` — технический и compliance-аудит.
- `docs/NAV_V2_OFFICE_PROCESS_AUDIT_2026-07-16.md` — фактический процесс офиса.
- `docs/NAV_V2_MORTGAGE_BROKER_SCOPE_2026-07-16.md` — зона ответственности брокера.
- `docs/NAV_V2_BOUNDED_TASK_CONTRACT_2026-07-16.md` — bounded taxonomy, SLA и evidence.
- `docs/NAV_V2_BOUNDED_TASK_MUTATIONS_2026-07-16.md` — canonical governed mutations.
- `docs/NAV_V2_TASK_RPC_CONSUMER_MATRIX_2026-07-16.md` — single-source task runtime gate.
- `docs/NAV_V2_TASK_ACTION_PIPELINE_REHEARSAL_2026-07-17.md` — frontend/Edge payload parity.
- `docs/NAV_V2_BOUNDED_TASK_DEPLOYMENT_READINESS_2026-07-17.md` — PG17 apply/grants/rollback dry-run.
- `docs/NAV_V2_BOUNDED_TASK_MIGRATION_STORYBOARD_2026-07-17.md` — future migration phases/STOP/rollback.
- `docs/NAV_V2_TASK_EDGE_IDENTITY_GATE_2026-07-17.md` — verified actor и Edge↔SQL parity.
- `docs/NAV_V2_BOUNDED_TASK_ACTOR_AWARE_SQL_2026-07-17.md` — actor-aware SQL lifecycle.
- `docs/NAV_V2_BOUNDED_TASK_IDENTITY_STORYBOARD_ADDENDUM_2026-07-17.md` — identity phase migration addendum.
- `docs/NAV_V2_TASK_ROLE_MATRIX_REHEARSAL_2026-07-17.md` — cost-free mocked role matrix.
- `docs/NAV_V2_AUTH_E2E_READINESS_2026-07-17.md` — authenticated E2E roles/environment/evidence package.
- `docs/NAV_V2_AUTH_E2E_TARGET_RUNBOOK.md` — реальный cloud run только после approval.

## Live production baseline

Последний read-only срез 17 июля 2026 года:

- 5 активных профилей: owner — 1, lawyer — 1, СПН — 3;
- активного manager и broker нет;
- 23 сделки;
- 98 production-задач;
- все 98 задач — legacy rows без `task_contract_version`;
- bounded columns отсутствуют;
- mutation event table отсутствует;
- canonical governed RPC отсутствуют;
- actor-aware overloads/helpers отсутствуют;
- production consultation и corporate-document сущностей нет.

Не использовать сырые показатели для оценки сотрудников: присутствуют тестовые, учебные и исторические записи.

## Завершённые волны

### PR #347–#381 — процесс, bounded core и single-source frontend

- privacy/DTO masking и broker scope;
- outcomes/readiness;
- consultation и corporate-document lifecycles;
- 10 bounded types, SLA, evidence, owner, subject UUID;
- idempotency, duplicate guard и audit;
- waiting/deferred и terminal proposal → decision;
- legacy review/inventory и lite DTO;
- authoritative capture handler;
- dormant base task mutation удалена;
- legacy payload сохранён;
- bounded transport выключен;
- cost-free desktop/mobile role matrix.

### PR #383 — task action pipeline

Repository-only цепочка:

`frontend router → canonical Edge payload → detached validator → database p_* args → exact RPC preview`

Проверены valid/tampered routes, contract-v2, reason/date/replacement и zero network.

Merge: `73c1112f654973f7a3f04ba463c77ae157c56166`.

### PR #384 — bounded deployment-readiness dry-run

Два независимых PostgreSQL 17 jobs доказали:

- canonical mutation lifecycle, role/evidence/idempotency;
- DTO role/privacy/no-mutation lifecycle;
- service-role-only governed grants;
- no legacy backfill;
- no deal/document/risk/task-trigger mutation;
- NOT VALID constraints;
- staged rollback и возврат legacy schema/DTO v1/RPC/grants.

Merge: `fe39a29f9190e9fb9738f2b1aea0934c4b025898`.

### PR #386 — migration storyboard v1

- read-only production attestation;
- future object diff без migration-файла;
- phases, STOP/GO, grants и staged rollback;
- CI запрещает изменения в `supabase/migrations`;
- PostgreSQL 17 snapshot before/after идентичен.

Merge: `0c495d161db468a0d7fbf8a6cdc1e0d3adc67bed`.

### PR #387 — identity propagation gate

Доказан canonical конфликт:

- authenticated имеет user identity, но не governed EXECUTE;
- service role имеет EXECUTE, но user `sub` не гарантирован.

Зафиксирован candidate:

`bearer user → verified actor → p_actor_id → service-role actor-aware RPC`

Client actor fields запрещены.

Merge: `886f64317fd43da4a3f6dbf42a4b2af9773fb216`.

### PR #388 — identity STOP gate в storyboard

Future migration запрещена без утверждённой actor architecture и actor-aware PG17 regression.

Merge: `cf829eb1a09f653ea13a21264dfc137a5fffef17`.

### PR #389 — actor-aware SQL prototype

Добавлены repository-only overloads всех шести governed RPC с `p_actor_id`:

- active profile check;
- canonical role/deal/task authorization reuse;
- same-actor replay;
- cross-actor replay rejection;
- claim restore при success/error;
- actor в task fields/audit;
- canonical regression и overlay rollback.

Merge: `5d63d490ad8f210e10cea59e0f9f14863e72b0de`.

### PR #390 — migration storyboard v2

Future apply order теперь включает actor-aware overlay. Object diff содержит шесть overloads и три helpers. Rollback:

1. DTO v1;
2. actor-aware overlay;
3. canonical mutation overlay;
4. bounded base.

Production read-only preflight проверяет отсутствие partial canonical/actor deployment.

Merge: `f262fb86ba1ebf9c2ded7d109a5746d08a632a5d`.

### PR #391 — detached Edge↔SQL parity

- repository SQL signatures отмечены готовыми;
- production deployed остаётся false;
- exact SQL parameter order проверен для пяти task actions;
- create overload инвентаризирован отдельно;
- spoof cases дают zero RPC/network;
- handler не импортирован в deployed `index.ts`.

Merge: `607918f748367c933706cc0975adad865f0dd25f`.

### PR #392 — authenticated E2E readiness package

Подготовлены без cloud execution:

- шесть обязательных technical roles;
- GitHub Environment variable/secret names без значений;
- запрет privileged/browser secrets;
- allowed/forbidden synthetic deals;
- девять positive/negative role scenarios;
- mortgage-only broker boundary;
- bearer → verified actor → p_actor_id → task/audit evidence;
- cleanup acceptance и P0 при cleanup failure;
- historical cost помечена stale.

Это readiness package, а не authenticated E2E.

Merge: `bd7b0ca3365dbd2ec4b7cf04e409ec4ab1075556`.

## Текущий task runtime

### Legacy rows

- frontend owner: `task-action-guard-v2.js`;
- route: `task-action-router-v2.js`;
- RPC: `nav_v2_update_task_status({ p_task_id, p_status })`;
- start/complete/reopen работают через production legacy contract.

### Bounded rows

- schema/catalog/audit/canonical RPC/actor overloads/DTO v2 готовы только в prototypes/harness;
- `BOUNDED_TRANSPORT_ENABLED = false`;
- Edge validator, identity handler и pipeline detached;
- governed RPC отсутствуют в production;
- actor-aware SQL отсутствует в production;
- bounded reopen запрещён;
- mass backfill 98 legacy rows запрещён.

## Cost gate: Issue #282

- платную Supabase preview branch не создавать;
- generic-команда «продолжай» не является cost approval;
- историческая стоимость от 14 июля помечена stale;
- перед branch creation стоимость нужно проверить заново;
- разрешены static/source contracts, fixtures, mocked RPC и бесплатная CI-изоляция;
- skipped/mocked job не считать Auth/RLS/grants proof.

Настоящий authenticated cloud E2E остаётся заблокирован до нового explicit approval стоимости.

## Следующий безопасный slice

Техническая repository preparation для authenticated E2E завершена.

Без owner/cost approval разрешены только:

1. поддержка contracts/checkers при изменении кода;
2. read-only production structural preflight;
3. исправление обычных legacy runtime bugs, не связанных с bounded deployment;
4. обновление документации/handoff;
5. security review repository artifacts без production changes.

Запрещено автоматически:

- создавать Supabase branch;
- создавать technical Auth users;
- применять bounded/actor-aware SQL;
- создавать production migration PR;
- менять production grants/RLS/Auth;
- импортировать identity handler в deployed Edge runtime;
- deploy Edge Function;
- включать bounded frontend transport;
- запускать controlled pilot.

Следующая последовательность после отдельного approval:

1. получить свежую стоимость и explicit cost confirmation;
2. создать disposable non-production branch не более чем на 6 часов;
3. применить approved migration package;
4. создать только synthetic accounts/data;
5. deploy approved Edge candidate;
6. выполнить authenticated role/identity matrix;
7. сохранить evidence;
8. немедленно удалить branch/accounts;
9. подтвердить cleanup;
10. отдельно решить production migration, Edge deploy и pilot.

## Ручные ограничения

- Issue #273: duplicate cleanup запрещён без решения владельца.
- Не менять назначения сотрудников без evidence и owner confirmation.
- Не очищать historical rows автоматически.
- Не применять prototypes к production.
- Не создавать платную Supabase branch без Issue #282 approval.
- Не считать mocked/skipped E2E доказательством Auth/RLS/grants.
- Не менять production grants/RLS/Auth/Edge без deploy slice.
- Не хранить scans/signatures/client identifiers/document URLs.
- Не выдавать маршрутизацию за юридическое заключение.
- Не использовать metrics для оценки сотрудников.
- Не менять status guards до authenticated tests.
- Не выполнять mass task backfill.
- Не включать bounded transport до database/Edge deployment.
- Не передавать service-role key или database credentials browser workflow.

## Decision gates владельца

1. explicit cost approval для disposable preview branch;
2. owner approval final actor propagation architecture;
3. разрешение создать production migration PR;
4. final legacy/governed grant policy;
5. rollback owner и maintenance window;
6. controlled pilot manager/cases/employees;
7. ПОД/ФТ owner;
8. document source domains/retention;
9. corporate document stages/templates;
10. legacy review/recreate permission.

## Не повторять без новой причины

- общий аудит и broker scope;
- DTO/privacy/outcomes/readiness;
- consultation/corporate harness;
- bounded taxonomy/canonical mutations/adapter;
- legacy review/inventory;
- authoritative handler/source cleanup;
- mocked role matrix;
- pipeline parity;
- deployment-readiness dry-run;
- migration storyboard v1/v2;
- identity conflict proof;
- actor-aware SQL lifecycle;
- Edge↔SQL parameter parity;
- authenticated E2E readiness package;
- production cleanup без owner decision.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #392. Не создавай Supabase branch и не применяй SQL без explicit cost/owner approval. Если approval отсутствует, работай только над безопасными legacy bugs, repository security/QA, read-only production preflight и актуализацией contracts/handoff.`
