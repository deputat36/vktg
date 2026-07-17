# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 17 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- Production `main`: `8070f911a751855bf68e78c603e1d75c513f1817` — squash merge PR #398.
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
- `docs/NAV_V2_SPN_INTAKE_AUDIT_2026-07-17.md` — ролевой аудит текущего добавления сделки и карта `вопрос → проблема → новое решение → влияние на юриста`.
- `docs/NAV_V2_SPN_INTAKE_DESIGN_2026-07-17.md` — трёхэтапный путь, legal passport v1, gates, side-aware documents/tasks и backward compatibility.
- `config/nav-v2-intake-contract-v1.json` — versioned source contract вопросов, триггеров, рисков, документов, владельцев и ожидаемых решений.

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

Дополнительный read-only срез новой анкеты 17 июля 2026 года:

- 24 участника, 198 документов, 53 риска, 98 задач, 122 события и 3 review;
- у 22 из 23 сделок нет структурированного `clientNextStep`;
- у 23 из 23 нет нового финального комментария СПН;
- у 17 сделок с `lawyer_needed=true` нет структурированного вопроса/контекста риска;
- в buyer-only карточке обнаружены 9 seller-side документов, что подтверждает необходимость side-aware плана;
- production server broker scope уже ограничен ипотекой; frontend repository-only contract закрепляет то же правило.

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

### PR #394 — безопасное восстановление результата сохранения

После неопределённого save мастер больше не ищет созданную сделку только по типу объекта. Recovery требует серверного признака текущего автора и точного контекста; для legacy DTO используется ещё более строгий fallback. Duplicate/idempotency guards сохранены.

Merge: `22c9e342`.

### PR #395 — аудит и intake contract v1

- ролевой аудит и карта текущих вопросов;
- ровно три верхнеуровневых этапа;
- четыре состояния факта и отдельный evidence source;
- versioned каталог юридических триггеров;
- legal passport v1 и gates `save_draft / form_card / handoff_lawyer`;
- 22 semantic business fixtures;
- mortgage-only broker scope.

Merge: `a73f924`.

### PR #396 — detached трёхэтапный prototype

- отдельный zero-mutation presentation layer;
- одна primary action, local autosave/reload recovery;
- preview паспорта, документов, рисков и handoff;
- desktop/mobile Playwright;
- страница: https://deputat36.github.io/vktg/spn-intake-prototype-v2.html

Merge: `09a8c395`.

### PR #397 — lawyer-first legal passport

Для роли lawyer legal passport v1 показан перед legacy-профилем: запрос, решение, срок, факты по evidence, неизвестное, риски, документы, расчёты, следующий шаг и СПН по сторонам. Старые сделки получают честный read-only fallback; решения переиспользуют существующий legal lifecycle.

Merge: `773d66a3`.

### PR #398 — side-aware documents и конкретные tasks

- документы строятся только из matched rules и для сопровождаемой стороны;
- partner side не угадывается, неуместные документы остаются в `skipped_documents`;
- object/deal документы допустимы только по explicit rule;
- task candidate содержит owner, action, deadline rule, evidence, expected result и gate impact;
- без owner id задача не попадает в `ready_tasks`;
- ипотека+маткапитал разделяются между broker и lawyer;
- 7 work-plan fixtures и desktop/mobile browser regression.

Merge: `8070f911`.

Production Supabase, migrations, schema, RLS, grants, Auth, Edge Functions и рабочие строки в PR #394–#398 не менялись. Новые mutation routes отсутствуют.

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

Repository-only прототип этапа 3 завершён. Следующий допустимый шаг — не прямой production deploy, а отдельный SQL integration prototype с PostgreSQL 17 harness.

Без production approval можно:

1. подготовить repository-only adapter входа `wizard_snapshot.deal.legal_passport` и `work_plan` к существующему save contract;
2. доказать в PG17, что frontend/server используют одну версию каталога и одинаковый broker scope;
3. проверить side-aware document rows и task completion contract без записи в production;
4. сохранить legacy payload, idempotency/request ID и exact recovery;
5. подготовить migration/rollback plan без файла в `supabase/migrations`;
6. продолжать read-only production preflight и обычные legacy bugfixes.

Запрещено автоматически:

- подключать detached prototype к production save RPC;
- добавлять migration в production chain;
- применять SQL, RLS, grants или массовый backfill;
- создавать Supabase branch или technical Auth users;
- импортировать новый bounded transport или deploy Edge Function;
- превращать task candidates без owner id в реальные задачи;
- создавать документы несопровождаемой стороны;
- считать маршрутизацию юридическим заключением.

После отдельного deployment approval последовательность должна быть такой:

1. утвердить exact JSON/server contract и catalog version;
2. прогнать PG17 apply/smoke/rollback и legacy fixtures;
3. проверить authenticated role matrix только в разрешённой изоляции;
4. выпустить feature-flagged integration PR;
5. пилотировать на новых synthetic/approved кейсах без backfill;
6. подтвердить idempotency, side-aware rows, lawyer passport и audit evidence;
7. отдельно принять решение о production rollout.

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
- ролевой intake-аудит и трёхэтапный UX;
- intake contract v1, 22 business fixtures и mortgage-only broker scope;
- detached intake prototype, reload recovery и zero-mutation browser suite;
- lawyer-first passport v1 и честный legacy fallback;
- side-aware document/task work plan и owner gate;
- production cleanup без owner decision.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #398. Следующий slice — repository-only save/SQL adapter и PostgreSQL 17 harness для intake contract v1. Не подключай prototype к production, не создавай Supabase branch и не применяй SQL без explicit deployment/cost/owner approval.`
