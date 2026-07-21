# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 21 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- `main`: `507065a56eba5cf3aee8dfce1e62ea8b45b0ec9d` — squash merge PR #427.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Organization: `Lider`, plan `free`.
- Project status: `ACTIVE_HEALTHY`.
- PostgreSQL: 17.6.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Production Supabase, Auth, Edge Functions, RLS, grants и рабочие строки в PR #394–#427 не менялись.

Live counts могут меняться от реальной работы пользователей. Не откатывать production data только из-за изменения counts.

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

Каждый создаваемый пункт обязан иметь:

`trigger → owner → deadline → action → evidence → outcome → confirmation → gate impact`

Автоматический backlog нельзя расширять без completion contract.

## Текущий production baseline

Read-only проверка после PR #427:

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

В `public.nav_deal_tasks_v2` присутствуют:

- `assigned_to`;
- `assigned_role`;
- `source`;
- `task_type`.

В production отсутствуют:

- `task_contract_version`;
- actor-aware bounded task RPC overloads;
- bounded task lifecycle RPC;
- final 25-rule mapper;
- governed intake ledger;
- privacy-aligned quality helper;
- legacy cleanup planner;
- bounded frontend transport;
- candidate Edge deployment.

Production Edge Function:

- slug: `nav-v2-deal-api`;
- version: 4;
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

Production task actions по-прежнему используют:

- authoritative frontend handler `assets/js/nav-v2/task-action-guard-v2.js`;
- legacy RPC `public.nav_v2_update_task_status(uuid, nav_v2_task_status)`;
- deployed Edge facade v4.

Новый intake, bounded task contract и actor-aware маршруты остаются repository-only.

## Завершённая repository-only цепочка

### PR #394–#419 — intake, trust boundary и полный catalog

Подготовлены:

- три верхнеуровневых этапа intake;
- versioned facts/evidence/rules/documents/decisions;
- legal passport и side-aware work plan;
- server recomputation и privacy allowlist;
- verified actor + trusted owner context;
- private request ledger, replay и atomic rollback;
- production-like mapping;
- legal semantics wave1, wave2 и special;
- effective repository coverage 25 supported / 0 unsupported.

PostgreSQL 17 доказал governed lifecycle, exact-schema fixtures, fail-closed tamper cases и layered rollback.

25/0 означает structural repository coverage, но не deployment readiness.

### PR #408–#410 — privacy quality и cleanup decision

- ФИО и телефоны исключены из нового quality contract.
- 46 legacy tasks классифицированы.
- Deterministic zero-write planner доказан.
- `selected_cleanup_option=null`.
- Production cleanup не выполнялся.

### PR #421 — deployment decision package

Merge: `6fd19cf766f5b60e2bdafae6e68cef5898da1ecf`.

Зафиксированы owner options, ordered rollout, отдельный authenticated E2E и отдельное production decision после E2E.

Текущее состояние:

- `selected_deployment_option=null`;
- `selected_cleanup_option=null`;
- `production_ready=false`;
- `production_applied=false`;
- `branch_creation_allowed=false`.

### PR #422 — current branch cost snapshot

Merge: `dd33b2ab1de6523604386ddbf3aad8d15fd2cdb3`.

Read-only cost lookup от 21 июля 2026 года:

- branch cost — `0.01344` в час;
- six-hour ceiling — `0.08064`;
- connector не вернул валюту;
- `explicit_owner_cost_approval=false`;
- `cost_confirmation_id=null`;
- перед будущим `confirm_cost` стоимость проверяется повторно.

Issue #282 остаётся binding cost gate.

### PR #423 — preview deployment source manifest

Merge: `36696d373ab869e3dd7a78b989627eea873402c0`.

Собран ordered source inventory:

0. read-only preflight;
1. privacy-aligned quality;
2. bounded tasks + actor identity;
3. governed intake + full 25-rule mapper;
4. Edge identity/action routes;
5. frontend flagged transport;
6. authenticated preview E2E;
7. optional cleanup.

`repository_source_inventory_complete=true`, но `deployment_bundle_ready=false`.

### PR #425 — CI-only preview bundle assembler

Merge: `6449e8c4d91a014b24f715bf8fc84eba46ddce20`.

Assembler формирует во временном каталоге rehearsal forward/rollback artifacts для:

- privacy-aligned quality;
- bounded core;
- bounded DTO;
- governed intake;
- bundle index.

Доказано:

- побайтно детерминированная сборка;
- exact source order и SHA-256;
- apply/assert/rollback всех сегментов на PostgreSQL 17;
- final 25-rule lifecycle;
- отсутствие generated output в migrations;
- diagnostic logs и обязательный rollback.

Границы:

- artifacts rehearsal-only;
- `deployment_bundle_ready=false`;
- `production_rollback_bundle_ready=false`;
- Supabase cloud API не вызывается.

### PR #427 — Edge verified actor candidate behind disabled flag

Merge: `507065a56eba5cf3aee8dfce1e62ea8b45b0ec9d`.

Candidate entrypoint:

- `supabase/functions/nav-v2-deal-api/index.ts`;
- bounded actions source-integrated;
- `BOUNDED_TASK_EDGE_IDENTITY_ENABLED=false`;
- Edge не деплоился.

Source-integrated identity chain:

`Authorization user JWT → /auth/v1/user → verified actor id → active Navigator profile → contract-v2 task context → role/assignment preflight → actor-aware RPC p_actor_id`

Проверены:

- owner/admin/manager supervisor policy;
- assigned SPN и lawyer;
- broker только для mortgage/military mortgage;
- inactive profile;
- viewer rejection;
- role mismatch;
- assignment mismatch;
- client-supplied actor fields;
- contract-v1 rejection;
- cross-actor RPC rejection;
- exact Edge-to-SQL argument parity;
- desktop/mobile no-network pipeline rehearsal.

Release boundary:

- `supabase/functions/nav-v2-deal-api/index.production-v4.ts` — exact immutable snapshot фактически развёрнутой v4;
- `config/nav-v2-release-baseline.json` сравнивает live v4 с этим snapshot;
- candidate `index.ts` не выдаётся за production source.

Consumer matrix v5 разделяет:

1. authoritative frontend runtime;
2. deployed legacy Edge v4 snapshot;
3. repository candidate Edge entrypoint.

Закрыт только source blocker `edge_actions_not_integrated`.

## Обязательные gates

### Preview branch gate

Создание preview branch запрещено без:

- явного выбора `authenticated_e2e_only`;
- execution-time cost recheck;
- explicit cost approval;
- `cost_confirmation_id`;
- six-hour lifetime ceiling;
- automatic delete plan;
- synthetic-only data policy.

Generic команда `продолжай` не является cost approval.

### Preview deployment package gate

Даже после cost approval применять что-либо в branch запрещено, пока отсутствуют:

- reviewable preview migration candidates;
- exact preview rollback package;
- package index с source hashes и order;
- approved minimal grants;
- cleanup verification plan;
- technical account lifecycle;
- explicit preview execution runbook.

CI rehearsal artifacts сами по себе не являются migration candidates.

### Production gate

Production deployment запрещён без:

- successful authenticated role/mutation E2E;
- отдельного owner/deployment approval;
- approved forward migration;
- approved rollback package;
- database-first rollout;
- Edge deploy с feature flag disabled;
- controlled frontend switch;
- controlled pilot scope;
- monitoring и rollback triggers.

### Cleanup gate

Закрытие legacy quality rows запрещено без:

- live privacy-aligned replacement;
- выбранного cleanup option;
- owner cleanup approval;
- reconciliation attestation.

## Binding ограничения

Generic команда `продолжай` не является:

- согласием на платную Supabase branch;
- согласием на technical accounts;
- согласием на production migration;
- согласием на Edge deployment;
- согласием на изменение RLS/grants/Auth;
- согласием на backfill или cleanup;
- выбором deployment или cleanup option.

Не изменять production `leader_*`. Navigator использует только `nav_*` / `nav_v2_*` и общий Auth.

## Канонические артефакты

- `config/nav-v2-intake-contract-v1.json`
- `config/nav-v2-deployment-decision-package-v1.json`
- `config/nav-v2-preview-deployment-bundle-manifest-v1.json`
- `config/nav-v2-preview-bundle-assembler-v1.json`
- `config/nav-v2-task-edge-runtime-integration-v1.json`
- `config/nav-v2-task-rpc-consumer-matrix.json`
- `config/nav-v2-auth-e2e-readiness.json`
- `config/nav-v2-legacy-quality-cleanup-decision-v1.json`
- `supabase/functions/nav-v2-deal-api/index.ts`
- `supabase/functions/nav-v2-deal-api/index.production-v4.ts`
- `supabase/functions/nav-v2-deal-api/task-action-edge-runtime-v2.js`
- `scripts/assemble-nav-v2-preview-bundle-v1.mjs`
- `scripts/run-nav-v2-preview-bundle-segment-v1.sh`
- `docs/NAV_V2_TASK_EDGE_RUNTIME_INTEGRATION_V1_2026-07-21.md`
- `docs/NAV_V2_TASK_RPC_CONSUMER_MATRIX_2026-07-16.md`

## Следующий безопасный slice

Без Supabase branch, без deploy и без production writes разрешена repository-only подготовка reviewable preview deployment candidate package:

1. Не коммитить generated SQL как production migrations.
2. Создать package manifest, который ссылается на deterministic assembler output и exact source hashes.
3. Разделить preview forward и preview rollback по сегментам.
4. Добавить preflight, post-apply и post-rollback assertions.
5. Зафиксировать minimal grants как отдельный review-only candidate.
6. Зафиксировать Edge candidate file set и entrypoint без deploy.
7. Добавить fail-closed package validator.
8. Сохранить:
   - `preview_branch_created=false`;
   - `production_applied=false`;
   - `edge_deployed=false`;
   - `deployment_bundle_ready=false`;
   - `production_rollback_bundle_ready=false`.
9. Не создавать technical users, secrets или cloud resources.
10. Не менять `leader_*`, Auth, RLS, grants или production rows.

## Команда следующего запуска

`@GitHub @Supabase продолжай Navigator v2 с docs/NAV_V2_WORK_HANDOFF_LATEST.md после PR #427. Следующий slice — repository-only reviewable preview deployment candidate package: exact manifest, forward/rollback segment inventory, pre/post assertions, minimal-grants candidate and Edge file set; no branch, no deploy, no production migration, no Auth/RLS/grants changes, no production writes or cleanup.`
