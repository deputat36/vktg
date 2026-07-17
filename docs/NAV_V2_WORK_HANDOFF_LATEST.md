# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 17 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- Production `main`: `fe39a29f9190e9fb9738f2b1aea0934c4b025898` — squash merge PR #384.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.6.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Последняя общая production migration: `20260716133531_leader_calculation_revisions`; она не относится к Navigator.
- Consultation, corporate-document, bounded-task и legacy-review SQL остаются только в `supabase/prototypes`.
- Production consultation/corporate-document сущностей нет.
- Production bounded-task columns, mutation event table и governed RPC отсутствуют.
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

## Канонические документы

- `docs/NAV_V2_FULL_AUDIT_2026-07-15.md` — технический и compliance-аудит.
- `docs/NAV_V2_OFFICE_PROCESS_AUDIT_2026-07-16.md` — фактический процесс офиса.
- `docs/NAV_V2_MORTGAGE_BROKER_SCOPE_2026-07-16.md` — зона ответственности брокера.
- `docs/NAV_V2_CONSULTATION_POSTGRES_HARNESS_2026-07-16.md` — consultation PG17 regression.
- `docs/NAV_V2_CORPORATE_DOCUMENT_MUTATIONS_2026-07-16.md` — governed corporate mutations.
- `docs/NAV_V2_BOUNDED_TASK_CONTRACT_2026-07-16.md` — bounded taxonomy, SLA и evidence.
- `docs/NAV_V2_BOUNDED_TASK_MUTATIONS_2026-07-16.md` — governed bounded-task mutations.
- `docs/NAV_V2_TASK_RPC_CONSUMER_MATRIX_2026-07-16.md` — consumer/deployment gate v4.
- `docs/NAV_V2_TASK_DUAL_PATH_CONTRACT_2026-07-16.md` — frontend router integrated, Edge detached.
- `docs/NAV_V2_TASK_ROLE_MATRIX_REHEARSAL_2026-07-17.md` — cost-free mocked role matrix.
- `docs/NAV_V2_TASK_ACTION_PIPELINE_REHEARSAL_2026-07-17.md` — frontend/Edge exact RPC parity.
- `docs/NAV_V2_BOUNDED_TASK_DEPLOYMENT_READINESS_2026-07-17.md` — apply/grants/rollback PG17 dry-run.
- `docs/NAV_V2_AUTH_E2E_TARGET_RUNBOOK.md` — настоящий authenticated E2E после approval.

## Live production baseline

Последний read-only срез:

- 5 активных профилей: owner, lawyer, 3 СПН;
- активного manager и broker нет;
- 23 сделки;
- 98 production-задач;
- все 98 задач — legacy rows без `task_contract_version`;
- bounded columns/event table/governed RPC отсутствуют;
- production consultation и corporate-document сущностей нет.

Не использовать сырые показатели для оценки сотрудников: присутствуют тестовые, учебные и исторические записи.

## Завершённые волны

### PR #347–#366 — process, outcomes, consultation и corporate docs

- privacy и DTO masking;
- broker scope correction;
- outcomes/readiness;
- consultation intake/entity/adapter/PG17 lifecycle;
- corporate document lifecycle, governed mutations и rollback.

### PR #363, #368 и #369 — bounded task core

- 10 bounded types с owner/SLA/completion/evidence/gate;
- explicit batch 1–5;
- assigned person и subject UUID;
- idempotency, duplicate guard, audit events;
- evidence-confirmed completion;
- waiting/deferred;
- terminal proposal → decision;
- PG17 role/lifecycle/rollback;
- transport-free adapter.

### PR #371–#381 — legacy coexistence и single-source frontend

- controlled legacy review pack;
- task RPC inventory;
- contract-aware lite DTO prototype;
- bounded UI preview;
- pure dual-path router;
- authoritative capture handler;
- dormant base mutation физически удалена;
- legacy payload сохранён;
- bounded transport выключен;
- desktop/mobile role matrix без real Auth/RLS claim.

Ключевые merges:

- authoritative integration: `dbf8c7b83c701e48d3f78e69cda7b7a4aea56182`;
- source cleanup: `4afe6fff4d89be349a3a2c551a3e2eb3c9a4a2e1`;
- role matrix: `c79ecc080e49ad579ecdc9ae666164df597b2726`.

### PR #383 — task action pipeline

Repository-only цепочка:

`frontend router → canonical Edge payload → detached Edge validator → database p_* args → exact RPC parity`

Проверено:

- 10 valid routes;
- 9 rejected/tampered routes;
- contract-v2 guard;
- reason/date/replacement validation;
- desktop/mobile one-click-one-preview;
- zero network calls.

Pipeline и Edge validator не импортированы в deployed `index.ts`.

Merge: `73c1112f654973f7a3f04ba463c77ae157c56166`.

### PR #384 — bounded deployment-readiness dry-run

Обязательный apply order:

1. bounded base contract;
2. governed mutation overlay;
3. explicit lite DTO v1;
4. bounded lite DTO v2 overlay.

Два независимых PostgreSQL 17 jobs доказали:

- mutation lifecycle и role/evidence/idempotency assertions;
- DTO role/privacy/no-mutation lifecycle;
- governed RPC service-role-only;
- legacy rows не backfill-ятся;
- deal/doc/risk rows и task triggers не меняются;
- bounded constraints `NOT VALID`;
- DTO v2 privacy/contract fields;
- staged rollback DTO → mutation → base;
- возврат legacy schema, DTO v1, RPC, grants и task rows.

Это dry-run, а не migration/deployment approval.

Merge: `fe39a29f9190e9fb9738f2b1aea0934c4b025898`.

## Текущий task runtime

### Legacy rows

- frontend owner: `task-action-guard-v2.js`;
- route: `task-action-router-v2.js`;
- RPC: `nav_v2_update_task_status({ p_task_id, p_status })`;
- start/complete/reopen работают через production legacy contract.

### Bounded rows

- schema/catalog/audit/RPC/DTO v2/rollback готовы только в prototypes/harness;
- `BOUNDED_TRANSPORT_ENABLED = false`;
- Edge validator/pipeline detached;
- governed RPC отсутствуют в production;
- bounded reopen запрещён;
- mass backfill 98 legacy rows запрещён.

## Cost gate: Issue #282

- платную Supabase preview branch не создавать;
- generic-команда «продолжай» не является cost approval;
- разрешены static/source contracts, fixtures, mocked RPC и бесплатная CI-изоляция;
- skipped/mocked job не считать Auth/RLS/grants proof.

Настоящий authenticated cloud E2E остаётся заблокирован до нового explicit approval стоимости.

## Принцип дальнейшей работы

Каждый пункт обязан иметь lifecycle:

`триггер → владелец → срок → действие → evidence → исход → подтверждение → gate impact`

Автоматический backlog нельзя расширять без completion contract.

## Следующий безопасный slice

P0/P1 — repository-only bounded migration storyboard/diff, без production migration file.

Storyboard должен:

- описать будущий migration boundary, но не создавать файл в `supabase/migrations`;
- перечислить prerequisites/version checks;
- разделить additive schema, mutation RPC, DTO overlay и grant phases;
- зафиксировать service-role-only governed grants;
- описать legacy add/status transition policy;
- включить read-only production preflight;
- включить post-apply verification/advisor checklist;
- включить staged rollback из PR #384;
- указать exact stop/go decisions;
- не создавать Supabase branch;
- не применять SQL;
- не деплоить Edge;
- не включать bounded transport;
- не утверждать deployment readiness без Auth E2E и owner approval;
- иметь source checker/CI, запрещающие accidental `supabase/migrations` artifact.

После storyboard:

1. продолжать бесплатные repository checks;
2. authenticated E2E — только после explicit cost approval;
3. production migration PR — только после owner decision;
4. minimal grants и advisor review;
5. Edge integration/deployment;
6. controlled transport switch;
7. controlled pilot;
8. security hardening.

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

## Decision gates владельца

1. explicit cost approval для preview branch;
2. разрешение создать production migration PR;
3. final grant policy;
4. manager controlled pilot;
5. pilot cases/employees;
6. ПОД/ФТ owner;
7. document source domains/retention;
8. corporate document stages/templates;
9. legacy review/recreate permission.

## Не повторять без новой причины

- общий аудит и broker scope;
- DTO/privacy/outcomes/readiness;
- consultation/corporate harness;
- bounded taxonomy/mutations/adapter;
- legacy review/inventory;
- lite DTO/UI/dual-path;
- authoritative handler/source cleanup;
- mocked role matrix;
- pipeline parity;
- deployment-readiness dry-run;
- production cleanup без owner decision.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #384. Создай repository-only bounded migration storyboard/diff без файла в supabase/migrations, без Supabase branch, production SQL, Auth/RLS/grants изменений, Edge deployment и bounded transport. Зафиксируй preflight, phases, grants, verification, stop/go decisions и staged rollback.`
