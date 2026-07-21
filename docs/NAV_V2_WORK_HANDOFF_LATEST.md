# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 21 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- `main`: `abf83a36111cd8909ae60b2c250bed2898df3610` — squash merge PR #436.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Organization: `Lider`, plan `free`.
- Project status: `ACTIVE_HEALTHY`.
- Region: `eu-west-1`.
- PostgreSQL production: `17.6.1.121`.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Последняя общая remote migration: `20260721122333_revoke_anon_execute_leader_internal_rpcs`.
- Production Supabase, Auth, Edge Functions, RLS, grants и рабочие строки в PR #394–#436 не менялись.

Последняя общая migration относится к `leader_*`. Navigator не должен изменять, переименовывать или нормализовать migration history другого модуля.

Live counts могут меняться от реальной работы пользователей. Не откатывать production data только из-за изменения counts и не трактовать counts как оценку сотрудников.

## Цель и продуктовая граница

Navigator — единая заявка на подготовку сделки и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`потребность → короткий сбор фактов → маршрутизация → план документов и условий → решение профильной роли → выполнение → evidence → подтверждение готовности → задаток/сделка → закрытие`

Navigator не является CRM, файловым архивом, банковской CRM или автоматическим юристом.

- СПН фиксирует известные факты и выполняет свои действия.
- Юрист принимает юридические решения и подтверждает юридические gates.
- Брокер отвечает только за ипотечную консультацию, программу и одобрение.
- Маткапитал, сертификаты, субсидии, дети и опека без ипотеки относятся к СПН и юристу.
- Менеджер контролирует владельцев, сроки и исключения, но не заменяет профильную роль.
- Файлы остаются во внешнем утверждённом хранилище.
- Navigator минимизирует прямые идентификаторы клиентов и не должен дублировать CRM.

Каждый автоматически создаваемый пункт обязан иметь:

`trigger → owner → deadline → action → evidence → outcome → confirmation → gate impact`

Автоматический backlog нельзя расширять без completion contract.

## Production baseline

Read-only snapshot от `2026-07-21T13:19:29.070311+00:00`:

- 23 сделки;
- 24 участника;
- 198 документов;
- 53 риска;
- 98 задач;
- 122 события;
- 88 задач `open`;
- 10 задач `cancelled`;
- 0 задач `in_progress`;
- 0 задач `done`.

В production отсутствуют:

- `task_contract_version` и остальные bounded columns;
- `nav_deal_task_mutation_events_v2`;
- actor-aware bounded task RPC overloads;
- governed bounded task lifecycle RPC;
- final 25-rule mapper;
- governed intake ledger и mapper;
- privacy-aligned quality replacement;
- bounded frontend transport;
- candidate Edge deployment;
- technical `nav-e2e` Auth users и profiles;
- Supabase preview branches.

Production Edge Function:

- slug: `nav-v2-deal-api`;
- version: `4`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- bundle SHA-256: `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.

## Действующий runtime

Production создание сделки по-прежнему использует:

- `spn-v2.html`;
- `assets/js/nav-v2/spn-smart-v4.js`;
- legacy RPC `public.nav_v2_save_wizard_result(jsonb)`;
- сохранённый legacy server implementation;
- текущие duplicate/idempotency/recovery guards;
- действующую legacy quality-функцию.

Production task actions используют:

- authoritative frontend handler `assets/js/nav-v2/task-action-guard-v2.js`;
- legacy RPC `public.nav_v2_update_task_status(uuid, nav_v2_task_status)`;
- deployed Edge facade v4.

Новый intake, bounded task contract, actor-aware routes и preview packages остаются repository-only.

## Завершённая repository-only цепочка

### PR #394–#419 — intake, trust boundary и полный catalog

Подготовлены:

- трёхэтапный intake;
- versioned facts/evidence/rules/documents/decisions;
- legal passport и side-aware work plan;
- server recomputation и privacy allowlist;
- verified actor + trusted owner context;
- private request ledger, replay и atomic rollback;
- production-like mapping;
- legal semantics wave1, wave2 и special;
- effective repository coverage `25 supported / 0 unsupported`.

`25/0` означает structural repository coverage, но не production readiness.

### PR #408–#410 — privacy quality и cleanup decision

- ФИО и телефоны исключены из нового quality contract.
- 46 legacy quality rows классифицированы.
- Deterministic zero-write cleanup planner доказан.
- `selected_cleanup_option=null`.
- Production cleanup не выполнялся.

### PR #421–#423 — deployment decision, cost и source manifest

Зафиксированы owner deployment options, отдельный authenticated E2E, отдельное production decision и ordered source inventory.

Исторический branch cost snapshot:

- `0.01344` в час;
- six-hour ceiling `0.08064`;
- стоимость обязательно проверяется повторно перед созданием branch.

Текущее состояние:

- `selected_deployment_option=null`;
- `explicit_owner_cost_approval=false`;
- `cost_confirmation_id=null`;
- `branch_creation_allowed=false`.

Issue #282 остаётся binding cost gate.

### PR #425 — deterministic preview bundle assembler

Во временном каталоге доказаны byte-identical assembly, exact source order/SHA-256 и независимые PostgreSQL 17 apply/assert/rollback для quality, bounded и governed intake. Generated SQL не попадает в `supabase/migrations`.

### PR #427 — Edge actor identity candidate

Candidate `supabase/functions/nav-v2-deal-api/index.ts` содержит source-integrated bounded route за:

`const BOUNDED_TASK_EDGE_IDENTITY_ENABLED = false;`

Проверены JWT user verification, active profile, contract-v2 context, role/assignment preflight, broker mortgage-only scope, client actor-field rejection, cross-actor replay rejection и Edge-to-SQL parity.

Edge не деплоился. Deployed v4 закреплена immutable snapshot:

`supabase/functions/nav-v2-deal-api/index.production-v4.ts`

### PR #429–#430 — preview package v1 и consolidated bounded candidate

Package v1 обнаружил повторное применение bounded base sources. PR #430 собрал единый bounded forward/rollback и доказал PostgreSQL 17 lifecycle, actor identity, DTO permissions, отсутствие побочных documents/risks и ALWAYS ROLLBACK.

### PR #432 — preview candidate package v2 и read-only attestation

Добавлены:

- aggregate-only production preflight внутри read-only transaction;
- captured production attestation;
- deterministic temporary package index;
- exact links на quality, consolidated bounded, intake и Edge candidates.

Package v2 остаётся fail-closed и не разрешает branch, apply или deploy.

### PR #433 — combined quality → bounded → intake lifecycle

Merge: `00125d63601b2064164bf01828d7244acf6ca773`.

Доказан единый PostgreSQL 17 lifecycle:

`privacy quality → consolidated bounded → governed intake 25-rule mapper`

Устранены реальные integration gaps:

- independent harness schema collisions;
- intake marker-table expectations;
- standalone intake rollback, который удалял общие schemas и roles;
- false-positive parser для `CREATE INDEX IF NOT EXISTS`.

Созданы shared synthetic schema, OID-preserving marker facade, combined-safe intake rollback, exact conflict inventory и cross-component assertions.

Подтверждены полный 25-rule chain, actor-aware bounded lifecycle, отсутствие side effects, reverse rollback, exact quality restoration и сохранность legacy task.

### PR #434 — preview execution package v3

Merge: `fb0a5ad9161efc35732049c3a38a96ebc6f0de12`.

Package v3 связывает:

- package v2 и live attestation;
- combined lifecycle proof;
- exact combined-safe rollback inventory;
- minimal-grants candidate;
- preview execution runbook;
- synthetic technical-account lifecycle;
- authenticated E2E readiness.

Закрыты как repository evidence:

- bounded candidate not consolidated;
- cross-component sequential apply not proven;
- exact preview rollback inventory missing;
- preview execution runbook missing;
- technical account lifecycle plan missing.

Future gated execution order:

0. fresh read-only preflight и cost lookup;
1. owner/cost-gated preview branch;
2. database-first apply;
3. Edge deploy с feature flag `false`;
4. preview-only synthetic accounts;
5. authenticated role/mutation E2E;
6. обязательный cleanup и branch deletion не позднее шести часов.

Package v3 остаётся:

- `execution_authorized=false`;
- `preview_branch_created=false`;
- `cost_confirmation_performed=false`;
- `technical_accounts_created=false`;
- `preview_apply_allowed=false`;
- `production_ready=false`;
- `deployment_bundle_ready=false`;
- `production_rollback_bundle_ready=false`.

### PR #436 — Advisor whitelist и production drift attestation v2

Merge: `abf83a36111cd8909ae60b2c250bed2898df3610`.

Fresh read-only evidence подтвердил:

- 50 curated external RPC;
- 48 ожидаемых callable `SECURITY DEFINER` warnings;
- observed `48/48`;
- missing `0`;
- unexpected `0`;
- две `SECURITY INVOKER` exceptions;
- Navigator migration boundary не изменилась;
- latest overall remote migration `20260721122333` относится к `leader_*`;
- Edge v4/JWT/hash не изменились;
- preview branches, candidate objects и technical identities отсутствуют.

Добавлен воспроизводимый источник:

`tests/sql/nav_v2_advisor_readonly_preflight_v1.sql`

Он выполняет aggregate-only чтение внутри `begin transaction read only`, не возвращает PII и заканчивается `rollback`.

CI формирует deterministic evidence artifact и блокирует drift registry, Advisor list, migration boundary, Edge baseline, candidate objects, technical identities и safety flags.

Issue #161 остаётся открытой только из-за leaked-password/Auth E2E prerequisites.

## Обязательные gates

### Repository preparation gate

Закрыты:

- reviewable package inventory;
- exact source hashes/order;
- consolidated bounded forward/rollback;
- combined quality/bounded/intake lifecycle;
- exact preview rollback inventory;
- minimal-grants review candidate;
- Edge disabled candidate file set;
- preview execution runbook;
- technical-account lifecycle plan;
- read-only production and Advisor attestation contracts.

Это repository evidence, а не разрешение на cloud execution.

### Preview branch and Auth E2E gate

Следующий шаг запрещён без отдельного явного решения владельца, включающего все пункты:

- выбор `authenticated_e2e_only`;
- execution-time branch cost recheck;
- explicit owner cost approval;
- `cost_confirmation_id`;
- разрешение создать disposable Supabase preview branch;
- six-hour branch lifetime ceiling;
- automatic delete deadline;
- synthetic-only data policy;
- разрешение создать только technical `nav-e2e` accounts в preview;
- запрет реальных сотрудников и production data.

Generic команды `продолжай` или `работай по плану` не являются таким approval.

### Leaked-password Auth gate

`auth_leaked_password_protection` остаётся выключенной до выполнения:

- issue #16 — invite/recovery/password flow на disposable accounts;
- issue #159 — authenticated role matrix;
- issue #282 — explicit cost/branch/Auth approval;
- повторный login/recovery QA после включения.

Production Auth автоматически не меняется.

### Production gate

Production deployment запрещён без successful authenticated E2E, cleanup attestation, удалённой preview branch, отдельного owner approval, approved forward/rollback, database-first rollout, Edge disabled deploy, controlled frontend switch, pilot scope, monitoring и rollback triggers.

### Cleanup gate

Закрытие legacy quality rows запрещено без live privacy-aligned replacement, выбранного cleanup option, owner cleanup approval и reconciliation attestation.

## Binding ограничения

Generic команда `продолжай` не является:

- согласием на платную Supabase branch;
- согласием на cost confirmation;
- согласием на technical accounts;
- согласием на production migration;
- согласием на Edge deployment;
- согласием на изменение RLS/grants/Auth;
- согласием на backfill или cleanup;
- выбором deployment или cleanup option.

Не изменять production `leader_*`. Navigator использует только `nav_*` / `nav_v2_*` и общий Auth.

## Канонические артефакты

- `config/nav-v2-preview-candidate-package-v3.json`
- `config/nav-v2-preview-execution-runbook-v1.json`
- `config/nav-v2-preview-technical-account-lifecycle-v1.json`
- `config/nav-v2-combined-preview-lifecycle-v1.json`
- `config/nav-v2-combined-preview-intake-rollback-v1.json`
- `config/nav-v2-preview-candidate-package-v2.json`
- `config/nav-v2-preview-readonly-attestation-v1.json`
- `config/nav-v2-advisor-live-attestation.json`
- `config/nav-v2-advisor-scope.json`
- `config/nav-v2-rpc-surface.json`
- `config/nav-v2-preview-minimal-grants-candidate-v1.json`
- `config/nav-v2-bounded-consolidated-candidate-v1.json`
- `config/nav-v2-preview-bundle-assembler-v1.json`
- `config/nav-v2-task-edge-runtime-integration-v1.json`
- `config/nav-v2-auth-e2e-readiness.json`
- `tests/sql/nav_v2_advisor_readonly_preflight_v1.sql`
- `tests/sql/nav_v2_preview_readonly_preflight_v1.sql`
- `supabase/functions/nav-v2-deal-api/index.ts`
- `supabase/functions/nav-v2-deal-api/index.production-v4.ts`
- `scripts/run-nav-v2-combined-preview-lifecycle-v1.sh`
- `scripts/check_nav_v2_preview_execution_package_v3.py`
- `scripts/check_nav_v2_advisor_live_attestation.py`
- `docs/NAV_V2_PREVIEW_EXECUTION_PACKAGE_V3_2026-07-21.md`
- `docs/NAV_V2_COMBINED_PREVIEW_LIFECYCLE_V1_2026-07-21.md`
- `docs/NAV_V2_ADVISOR_TRIAGE.md`

## Следующий безопасный slice без нового approval

Разрешены только бесплатные read-only/repository actions:

1. поддерживать package v3, handoff и live attestations в актуальном состоянии;
2. проверять GitHub CI/review drift;
3. выполнять aggregate-only production preflight без PII;
4. фиксировать изменение Navigator migration, Advisor whitelist или Edge baseline;
5. классифицировать Performance Advisor только как repository evidence, без автоматического удаления индексов или изменения RLS;
6. не reconciliate `leader_*` migrations в рамках Navigator;
7. не выполнять execution-time cost confirmation заранее;
8. не создавать branch, accounts, secrets или cloud resources.

Новый функциональный deployment slice отсутствует: все оставшиеся cloud шаги требуют explicit owner/cost/Auth approval.

## Команда для отдельного gated решения

Для перехода к authenticated preview E2E владелец должен явно разрешить одновременно:

`authenticated_e2e_only`, свежую стоимость branch, cost confirmation, disposable preview branch максимум на 6 часов, synthetic technical accounts и automatic cleanup.

Без такой формулировки cloud execution запрещено.
