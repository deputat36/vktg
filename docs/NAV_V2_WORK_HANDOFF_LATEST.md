# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 21 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- `main`: `3db0b07988805e7c80ae0fecd537ab7a4a02ecc9` — squash merge PR #440.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Organization: `Lider`, plan `free`.
- Project status: `ACTIVE_HEALTHY`.
- Region: `eu-west-1`.
- PostgreSQL production: `17.6.1.121`.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Последняя общая remote migration: `20260721122333_revoke_anon_execute_leader_internal_rpcs`.
- Production Supabase, Auth, Edge Functions, RLS, grants, indexes и рабочие строки в PR #394–#440 не менялись.

Последняя общая migration относится к `leader_*`. Navigator не должен изменять, переименовывать или нормализовать migration history другого модуля.

Live counts и `idx_scan` могут меняться от реальной работы, рестарта или сброса статистики. Не откатывать production data, не оценивать сотрудников и не удалять индексы только из-за изменения счётчиков.

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
- Navigator минимизирует прямые идентификаторы клиентов и не дублирует CRM.

Каждый автоматически создаваемый пункт обязан иметь:

`trigger → owner → deadline → action → evidence → outcome → confirmation → gate impact`

Автоматический backlog нельзя расширять без completion contract.

## Production baseline

Read-only snapshot от 21 июля 2026 года:

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

- bounded task columns и mutation event table;
- actor-aware bounded task RPC;
- governed bounded lifecycle RPC;
- final 25-rule mapper;
- governed intake ledger и mapper;
- privacy-aligned quality replacement;
- bounded frontend transport;
- candidate Edge deployment;
- technical `nav-e2e` Auth users/profiles;
- Supabase preview branches.

Production Edge Function:

- slug: `nav-v2-deal-api`;
- version: `4`;
- status: `ACTIVE`;
- `verify_jwt=true`;
- SHA-256: `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.

## Действующий runtime

Production создание сделки использует:

- `spn-v2.html`;
- `assets/js/nav-v2/spn-smart-v4.js`;
- legacy RPC `public.nav_v2_save_wizard_result(jsonb)`;
- legacy server implementation и quality-функцию;
- действующие duplicate/idempotency/recovery guards.

Production task actions используют:

- `assets/js/nav-v2/task-action-guard-v2.js`;
- legacy RPC `public.nav_v2_update_task_status(uuid, nav_v2_task_status)`;
- deployed Edge facade v4.

Новый intake, bounded contract, actor-aware routes и preview packages остаются repository-only.

## Завершённая repository-only цепочка

### PR #394–#419 — intake, trust boundary и 25-rule catalog

Созданы трёхэтапный intake, versioned facts/evidence/rules, legal passport, side-aware work plan, server recomputation, privacy allowlist, verified actor context, request ledger/replay/rollback и production-like mapping.

Effective repository coverage: `25 supported / 0 unsupported`. Это structural coverage, а не production readiness.

### PR #408–#410 — privacy quality и cleanup decision

- ФИО и телефоны исключены из нового quality contract.
- 46 legacy quality rows классифицированы.
- Zero-write cleanup planner доказан.
- `selected_cleanup_option=null`.
- Production cleanup не выполнялся.

### PR #421–#423 — deployment decision, cost и source manifest

Зафиксированы owner options, отдельный authenticated E2E, отдельное production decision и ordered source inventory.

Исторический branch cost snapshot: `0.01344` в час, максимум `0.08064` за 6 часов. Цена обязательно проверяется заново перед branch creation.

Состояние:

- `selected_deployment_option=null`;
- `explicit_owner_cost_approval=false`;
- `cost_confirmation_id=null`;
- `branch_creation_allowed=false`.

Issue #282 остаётся binding cost gate.

### PR #425–#430 — deterministic artifacts, Edge candidate и consolidated bounded

Доказаны deterministic temporary assembly, exact source order/SHA-256, независимые PostgreSQL 17 lifecycle и отсутствие generated SQL в migrations.

Edge actor identity candidate находится за `BOUNDED_TASK_EDGE_IDENTITY_ENABLED=false` и не deployed.

Package v1 обнаружил повторные bounded sources. PR #430 создал consolidated bounded forward/rollback и доказал actor identity, DTO permissions, no document/risk side effects и ALWAYS ROLLBACK.

### PR #432 — package v2 и production read-only attestation

Добавлены aggregate-only preflight, captured production snapshot, deterministic package index и exact links на quality/bounded/intake/Edge candidates.

Package v2 остаётся fail-closed и не разрешает branch, apply или deploy.

### PR #433 — combined quality → bounded → intake lifecycle

Merge: `00125d63601b2064164bf01828d7244acf6ca773`.

В одной PostgreSQL 17 базе доказан lifecycle:

`privacy quality → consolidated bounded → governed intake 25-rule mapper → reverse rollback`

Устранены harness collisions, intake marker-table mismatch, unsafe standalone intake rollback и false-positive parser. Подтверждены 25-rule chain, actor-aware lifecycle, no cross-component side effects, exact quality restoration и legacy task survival.

### PR #434 — preview execution package v3

Merge: `fb0a5ad9161efc35732049c3a38a96ebc6f0de12`.

Package v3 связывает package v2, combined proof, exact rollback, minimal grants, execution runbook, synthetic technical-account lifecycle и Auth E2E readiness.

Закрыты как repository evidence:

- bounded candidate consolidation;
- cross-component sequential apply proof;
- exact rollback inventory;
- preview execution runbook;
- technical account lifecycle plan.

Будущий gated order:

0. fresh preflight и cost lookup;
1. owner/cost-gated preview branch;
2. database-first apply;
3. Edge deploy с feature flag `false`;
4. preview-only synthetic accounts;
5. authenticated role/mutation E2E;
6. cleanup и branch deletion до 6 часов.

Все execution/readiness flags остаются `false`.

### PR #436 — Security Advisor whitelist и production drift attestation

Merge: `abf83a36111cd8909ae60b2c250bed2898df3610`.

Fresh read-only evidence:

- 50 curated external RPC;
- 48 expected callable `SECURITY DEFINER` warnings;
- observed `48/48`, missing `0`, unexpected `0`;
- две `SECURITY INVOKER` exceptions;
- Navigator migration boundary не изменилась;
- latest overall migration относится к `leader_*`;
- Edge v4/JWT/hash не изменились;
- preview branch, candidate objects и technical identities отсутствуют.

Добавлен `tests/sql/nav_v2_advisor_readonly_preflight_v1.sql` и deterministic Advisor drift CI.

Issue #161 остаётся открытой только из-за leaked-password/Auth E2E prerequisites.

### PR #438 — Performance Advisor scope и no-auto-DDL contract

Merge: `be9f9efeac53c9c57bdf7d8ae0666680a683fbdd`.

Fresh aggregate-only evidence:

- scope tables: `11`;
- indexes: `53`;
- foreign keys: `29/29` имеют covering index;
- RLS policies: `32`;
- SELECT-wrapped Auth policies: `32/32`;
- direct per-row Auth calls: `0`;
- zero-scan non-constraint indexes: `13`;
- 12 из 13 покрывают FK или его leading columns;
- единственный non-FK zero-scan index: `nav_user_profiles_role_idx`;
- общий размер zero-scan indexes: `212992` bytes;
- statistics reset timestamp и representative workload window не доказаны.

Добавлены Navigator-only Performance Advisor attestation, aggregate-only preflight, strict checker и dedicated workflow.

Fail-closed policy: `idx_scan=0` не является drop approval. Любое index removal требует observation window, authenticated workload, `EXPLAIN ANALYZE`, FK parent update/delete benchmark, regression tests, exact rollback и отдельное owner production DDL approval.

### PR #440 — synthetic index query-plan evidence

Merge: `3db0b07988805e7c80ae0fecd537ab7a4a02ecc9`.

Live read-only consumer inventory:

- 24 Navigator RPC содержат profile role-dependent logic;
- 2 RPC напрямую упоминают `nav_deal_answers_v2`;
- PII не возвращалась;
- DDL/DML не выполнялись.

PostgreSQL 17 synthetic harness:

- `120000` profiles;
- `5000` deals;
- `100000` answers;
- natural и structural JSON `EXPLAIN`;
- synthetic-only index removal;
- result hash equivalence;
- full rollback и post-rollback schema absence.

Результаты:

1. `nav_user_profiles_role_idx` — `retain`. Role имеет 24 operational consumers, индекс структурно обслуживает selective role query, а после synthetic removal остаётся sequential-scan fallback.
2. `nav_deal_answers_v2_deal_idx` — `review_possible_redundancy_only`. Composite unique `(deal_id, question_key)` обслуживает `deal_id` leading-prefix query и synthetic FK child lookup после отсутствия single-column index; result hash сохранился.

Evidence:

- workflow run `29837121899`;
- artifact `8497773881`;
- digest `sha256:78cc9eb4e866d9a321d89c92573c2a0d497e5d23627d6e11c7eb0501c971422b`.

Synthetic plan не является production benchmark и не разрешает index drop.

## Обязательные gates

### Repository preparation gate

Закрыты:

- reviewable package inventory;
- exact hashes/source order;
- consolidated bounded forward/rollback;
- combined quality/bounded/intake lifecycle;
- exact preview rollback inventory;
- minimal-grants candidate;
- Edge disabled candidate;
- execution runbook;
- technical-account lifecycle;
- Security Advisor и Performance Advisor scoped read-only contracts;
- synthetic query-plan evidence для role и answers prefix indexes.

Это repository evidence, а не разрешение на cloud execution или production DDL.

### Preview branch and Auth E2E gate

Следующий шаг запрещён без отдельного явного решения владельца, включающего:

- `authenticated_e2e_only`;
- execution-time cost recheck;
- explicit cost approval;
- `cost_confirmation_id`;
- disposable preview branch;
- максимум 6 часов и automatic delete deadline;
- synthetic-only data;
- только technical `nav-e2e` accounts;
- запрет реальных сотрудников и production data.

Generic команды `продолжай` или `работай по плану` не являются approval.

### Leaked-password Auth gate

`auth_leaked_password_protection` остаётся выключенной до:

- issue #16 — invite/recovery/password flow;
- issue #159 — authenticated role matrix;
- issue #282 — cost/branch/Auth approval;
- повторного login/recovery QA.

### Production, DDL и cleanup gates

Production deployment, index removal, RLS rewrite и cleanup запрещены без отдельных evidence packages и owner approvals.

Для `nav_deal_answers_v2_deal_idx` дополнительно отсутствуют:

- production statistics observation window;
- authenticated workload;
- production `EXPLAIN ANALYZE`;
- FK parent update/delete benchmark;
- write amplification/storage benefit calculation;
- exact migration и rollback;
- owner DDL approval.

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
- `config/nav-v2-performance-advisor-attestation-v1.json`
- `config/nav-v2-index-query-plan-candidate-v1.json`
- `config/nav-v2-rpc-surface.json`
- `config/nav-v2-preview-minimal-grants-candidate-v1.json`
- `config/nav-v2-bounded-consolidated-candidate-v1.json`
- `tests/sql/nav_v2_advisor_readonly_preflight_v1.sql`
- `tests/sql/nav_v2_performance_readonly_preflight_v1.sql`
- `tests/sql/nav_v2_index_query_plan_harness_v1.sql`
- `tests/sql/nav_v2_preview_readonly_preflight_v1.sql`
- `supabase/functions/nav-v2-deal-api/index.ts`
- `supabase/functions/nav-v2-deal-api/index.production-v4.ts`
- `scripts/run-nav-v2-combined-preview-lifecycle-v1.sh`
- `scripts/check_nav_v2_preview_execution_package_v3.py`
- `scripts/check_nav_v2_advisor_live_attestation.py`
- `scripts/check_nav_v2_performance_advisor_attestation_v1.py`
- `scripts/check_nav_v2_index_query_plan_candidate_v1.py`
- `docs/NAV_V2_ADVISOR_TRIAGE.md`
- `docs/NAV_V2_PERFORMANCE_ADVISOR_SCOPE_V1_2026-07-21.md`
- `docs/NAV_V2_INDEX_QUERY_PLAN_CANDIDATE_V1_2026-07-21.md`

## Следующий безопасный slice без нового approval

Разрешены только бесплатные read-only/repository actions:

1. поддерживать package v3, handoff и live attestations;
2. проверять CI/review drift;
3. повторять aggregate-only production preflight без PII;
4. фиксировать Navigator migration, Advisor whitelist, index/RLS baseline или Edge drift;
5. улучшать synthetic FK parent update/delete benchmark без production DDL;
6. составлять exact non-PII query-to-index mapping;
7. не reconciliate `leader_*` migrations;
8. не выполнять cost confirmation заранее;
9. не создавать branch, accounts, secrets или cloud resources.

Новый cloud deployment slice отсутствует: оставшиеся шаги требуют explicit owner/cost/Auth approval.

## Команда для отдельного gated решения

Для authenticated preview E2E владелец должен явно разрешить одновременно:

`authenticated_e2e_only`, свежую стоимость branch, cost confirmation, disposable preview branch максимум на 6 часов, synthetic technical accounts и automatic cleanup.

Без такой формулировки cloud execution запрещено.
