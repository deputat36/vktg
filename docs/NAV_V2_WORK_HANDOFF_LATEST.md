# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 21 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- `main`: `64e2a7a8d471525410e5adf1c73214aa05e160fa` — squash merge PR #442.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Organization: `Lider`, plan `free`.
- Project status: `ACTIVE_HEALTHY`.
- Region: `eu-west-1`.
- PostgreSQL production: `17.6.1.121`.
- Последняя Navigator production migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Последняя общая remote migration: `20260721122333_revoke_anon_execute_leader_internal_rpcs`.
- Production Edge `nav-v2-deal-api`: version `4`, `ACTIVE`, `verify_jwt=true`.
- Edge SHA-256: `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.
- Supabase preview branches отсутствуют.
- Technical `nav-e2e` users/profiles отсутствуют.

Последняя общая migration относится к `leader_*`. Navigator не должен изменять, переименовывать или нормализовать migration history другого модуля.

Live counts, Auth logs и `idx_scan` могут меняться из-за реальной работы, рестарта или сброса статистики. Не откатывать production data, не оценивать сотрудников и не удалять индексы только из-за изменения счётчиков.

## Назначение продукта

Navigator — единая заявка на подготовку сделки и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`потребность → короткий сбор фактов → маршрутизация → план документов и условий → решение профильной роли → выполнение → evidence → подтверждение готовности → задаток/сделка → закрытие`

Navigator не является:

- заменой основной CRM;
- файловым архивом документов клиентов;
- банковской CRM;
- автоматическим юристом;
- системой оценки сотрудников по сырым счётчикам.

Роли:

- СПН фиксирует известные факты, ведёт коммуникацию и выполняет свои действия.
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

- bounded task columns;
- bounded mutation event table;
- actor-aware bounded task RPC;
- governed bounded lifecycle RPC;
- final 25-rule mapper;
- governed intake ledger и mapper;
- privacy-aligned quality replacement;
- bounded frontend transport;
- candidate Edge deployment;
- technical `nav-e2e` accounts;
- Supabase preview branch.

## Действующий runtime

Production создание сделки использует:

- `spn-v2.html`;
- `assets/js/nav-v2/spn-smart-v4.js`;
- legacy RPC `public.nav_v2_save_wizard_result(jsonb)`;
- legacy server implementation и quality-функцию;
- действующие duplicate, idempotency и recovery guards.

Production task actions используют:

- `assets/js/nav-v2/task-action-guard-v2.js`;
- legacy RPC `public.nav_v2_update_task_status(uuid, nav_v2_task_status)`;
- deployed Edge facade v4.

Новый intake, bounded contract, actor-aware routes и preview packages остаются repository-only.

## Завершённая repository-only цепочка

### PR #394–#419 — intake, trust boundary и catalog

Подготовлены:

- трёхэтапный intake;
- versioned facts, evidence, rules, documents и decisions;
- legal passport и side-aware work plan;
- server recomputation и privacy allowlist;
- verified actor и trusted owner context;
- private request ledger, replay protection и atomic rollback;
- production-like mapping;
- legal semantics wave 1, wave 2 и special.

Effective repository coverage: `25 supported / 0 unsupported`.

`25/0` означает structural repository coverage, а не production readiness.

### PR #408–#410 — privacy quality и cleanup decision

- ФИО и телефоны исключены из нового quality contract.
- 46 legacy quality rows классифицированы.
- Deterministic zero-write cleanup planner доказан.
- `selected_cleanup_option=null`.
- Production cleanup не выполнялся.

### PR #421–#423 — deployment decision, cost и source manifest

Зафиксированы owner deployment options, отдельный authenticated E2E, отдельное production decision и ordered source inventory.

Исторический branch cost snapshot:

- `0.01344` USD в час;
- maximum six-hour compute ceiling `0.08064` USD;
- egress/storage могут добавить расходы;
- стоимость обязательно проверяется заново перед branch creation.

Текущее состояние:

- `selected_deployment_option=null`;
- `explicit_owner_cost_approval=false`;
- `cost_confirmation_id=null`;
- `branch_creation_allowed=false`.

Issue #282 остаётся binding cost gate.

### PR #425–#430 — deterministic artifacts, Edge candidate и bounded consolidation

Доказаны:

- deterministic temporary assembly;
- exact source order и SHA-256;
- независимые PostgreSQL 17 apply/assert/rollback;
- отсутствие generated SQL в `supabase/migrations`;
- consolidated bounded forward/rollback;
- actor identity;
- DTO permissions;
- отсутствие побочных documents/risks;
- `ALWAYS ROLLBACK`.

Edge actor identity candidate находится за:

`BOUNDED_TASK_EDGE_IDENTITY_ENABLED=false`

Candidate Edge не развёрнут.

### PR #432 — preview package v2 и read-only attestation

Добавлены:

- aggregate-only production preflight;
- captured production snapshot;
- deterministic temporary package index;
- exact links на quality, bounded, intake и Edge candidates.

Package v2 остаётся fail-closed и не разрешает branch, apply или deploy.

### PR #433 — combined quality → bounded → intake lifecycle

Merge: `00125d63601b2064164bf01828d7244acf6ca773`.

В одной PostgreSQL 17 базе доказан lifecycle:

`privacy quality → consolidated bounded → governed intake 25-rule mapper → reverse rollback`

Устранены:

- независимые harness schema collisions;
- intake marker-table mismatch;
- unsafe standalone intake rollback;
- false-positive parser для `CREATE INDEX IF NOT EXISTS`.

Подтверждены:

- полный 25-rule chain;
- actor-aware bounded lifecycle;
- отсутствие cross-component side effects;
- exact quality restoration;
- сохранность legacy task.

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

- bounded candidate consolidation;
- cross-component sequential apply proof;
- exact preview rollback inventory;
- preview execution runbook;
- technical account lifecycle plan.

Будущий gated execution order:

0. fresh read-only preflight и cost lookup;
1. owner/cost-gated disposable branch;
2. database-first apply;
3. Edge deploy с feature flag `false`;
4. preview-only synthetic accounts;
5. authenticated role/mutation E2E;
6. cleanup и branch deletion не позднее шести часов.

Все execution и production-readiness flags остаются `false`.

### PR #436 — Security Advisor whitelist и drift attestation

Merge: `abf83a36111cd8909ae60b2c250bed2898df3610`.

Fresh read-only evidence:

- 50 curated external RPC;
- 48 expected callable `SECURITY DEFINER` warnings;
- observed `48/48`;
- missing `0`;
- unexpected `0`;
- две допустимые `SECURITY INVOKER` exceptions;
- Navigator migration boundary не изменилась;
- latest overall migration относится к `leader_*`;
- Edge v4/JWT/hash не изменились;
- preview branch, candidate DB objects и technical identities отсутствуют.

Добавлен воспроизводимый aggregate-only preflight внутри read-only transaction и deterministic Advisor drift CI.

Issue #161 остаётся открытой из-за leaked-password/Auth E2E prerequisites, а не из-за whitelist drift.

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
- representative workload window не доказан.

Fail-closed policy:

`idx_scan=0` не является drop approval.

Любое index removal требует observation window, authenticated workload, `EXPLAIN ANALYZE`, FK parent update/delete benchmark, regression tests, exact rollback и отдельное owner production DDL approval.

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
- full rollback;
- post-rollback schema absence.

Решения:

1. `nav_user_profiles_role_idx` — `retain`.
2. `nav_deal_answers_v2_deal_idx` — `review_possible_redundancy_only`.

Composite unique `(deal_id, question_key)` структурно обслуживает `deal_id` leading-prefix query и synthetic FK child lookup. Synthetic evidence не является production benchmark и не разрешает index drop.

### PR #442 — browser Auth session recovery

Merge: `64e2a7a8d471525410e5adf1c73214aa05e160fa`.

Read-only Supabase Auth logs за 21 июля 2026 года показали несколько `refresh_token_not_found` с GitHub Pages origin. Browser ранее оставлял недействительную `nav_session_v2` в `localStorage`, поэтому последующие страницы повторяли тот же refresh.

Исправлено:

- Auth error сохраняет структурированные `status`, `code` и payload;
- invalid, not-found и already-used refresh token классифицируются отдельно;
- недействительная session и profile cache очищаются однократно;
- последний email сохраняется для нового входа;
- пользователь получает понятное сообщение о завершении сессии;
- следующий RPC без нового входа останавливается до сети;
- действующий refresh token по-прежнему обновляет session и повторяет RPC ровно один раз.

CI evidence:

- dedicated auth recovery run `29840446957` — success;
- Navigator static checks run `29840446976` — 49/49 success;
- JavaScript syntax run `29840446989` — success;
- public desktop/mobile Playwright run `29840447071` — success;
- read-layer semantic/browser run `29840447082` — success.

Authenticated smoke корректно пропущен, потому что preview environment и technical secrets не создавались.

Supabase Auth settings, users, passwords, database, migrations, RLS, grants, Edge и `leader_*` не менялись.

## Обязательные gates

### Repository preparation gate

Закрыты:

- reviewable package inventory;
- exact hashes и source order;
- consolidated bounded forward/rollback;
- combined quality/bounded/intake lifecycle;
- exact preview rollback inventory;
- minimal-grants candidate;
- Edge disabled candidate;
- execution runbook;
- technical-account lifecycle;
- Security Advisor scoped contract;
- Performance Advisor scoped contract;
- synthetic query-plan evidence;
- browser invalid-refresh recovery и unit/browser CI.

Это repository evidence, а не разрешение на cloud execution или production DDL.

### Preview branch and Auth E2E gate

Следующий cloud шаг запрещён без отдельного явного решения владельца, включающего все пункты:

- выбор `authenticated_e2e_only`;
- execution-time branch cost recheck;
- явное подтверждение актуальной стоимости и валюты;
- отдельный `confirm_cost`;
- `cost_confirmation_id`;
- disposable Supabase preview branch;
- maximum lifetime 6 hours;
- automatic delete deadline;
- synthetic-only data policy;
- только technical `nav-e2e` accounts;
- запрет реальных сотрудников и production data;
- обязательный cleanup.

Generic команды `продолжай`, `работай по плану` или `действуй автономно` не являются approval.

### Leaked-password Auth gate

`auth_leaked_password_protection` остаётся выключенной до:

- issue #16 — полного invite/recovery/password flow;
- issue #159 — authenticated desktop/mobile role matrix;
- issue #282 — cost, branch и technical Auth approval;
- повторного login/recovery QA в disposable preview environment.

PR #442 устранил browser refresh-loop, но не заменяет полный authenticated E2E.

### Production, DDL и cleanup gates

Production deployment, index removal, RLS rewrite и cleanup запрещены без отдельных evidence packages и owner approvals.

Для `nav_deal_answers_v2_deal_idx` отсутствуют:

- production statistics observation window;
- authenticated workload;
- production `EXPLAIN ANALYZE`;
- FK parent update/delete benchmark;
- write amplification/storage benefit calculation;
- exact migration и rollback;
- owner DDL approval.

Не изменять production `leader_*`. Navigator использует только `nav_*`, `nav_v2_*` и общий Auth.

## Канонические артефакты

Preview и database contracts:

- `config/nav-v2-preview-candidate-package-v3.json`
- `config/nav-v2-preview-execution-runbook-v1.json`
- `config/nav-v2-preview-technical-account-lifecycle-v1.json`
- `config/nav-v2-combined-preview-lifecycle-v1.json`
- `config/nav-v2-combined-preview-intake-rollback-v1.json`
- `config/nav-v2-preview-candidate-package-v2.json`
- `config/nav-v2-preview-readonly-attestation-v1.json`
- `config/nav-v2-preview-minimal-grants-candidate-v1.json`
- `config/nav-v2-bounded-consolidated-candidate-v1.json`

Advisor и performance contracts:

- `config/nav-v2-advisor-live-attestation.json`
- `config/nav-v2-advisor-scope.json`
- `config/nav-v2-performance-advisor-attestation-v1.json`
- `config/nav-v2-index-query-plan-candidate-v1.json`
- `config/nav-v2-rpc-surface.json`
- `tests/sql/nav_v2_advisor_readonly_preflight_v1.sql`
- `tests/sql/nav_v2_performance_readonly_preflight_v1.sql`
- `tests/sql/nav_v2_index_query_plan_harness_v1.sql`
- `tests/sql/nav_v2_preview_readonly_preflight_v1.sql`

Runtime and Auth recovery:

- `assets/js/nav-v2/supabase-v2.js`
- `assets/js/nav-v2/auth-session-recovery-v2.js`
- `tests/unit/nav-v2-auth-session-recovery.test.mjs`
- `.github/workflows/nav-v2-auth-session-recovery-v1.yml`
- `docs/NAV_V2_AUTH_SESSION_RECOVERY_V1_2026-07-21.md`

Edge and lifecycle:

- `supabase/functions/nav-v2-deal-api/index.ts`
- `supabase/functions/nav-v2-deal-api/index.production-v4.ts`
- `scripts/run-nav-v2-combined-preview-lifecycle-v1.sh`
- `scripts/check_nav_v2_preview_execution_package_v3.py`
- `scripts/check_nav_v2_advisor_live_attestation.py`
- `scripts/check_nav_v2_performance_advisor_attestation_v1.py`
- `scripts/check_nav_v2_index_query_plan_candidate_v1.py`

## Следующий безопасный slice без нового approval

Разрешены только бесплатные read-only и repository actions:

1. поддерживать package v3, handoff и live attestations;
2. проверять CI и review drift;
3. повторять aggregate-only production preflight без PII;
4. фиксировать Navigator migration, Advisor, index/RLS или Edge drift;
5. анализировать Auth/Edge/API logs без изменения settings и без раскрытия токенов;
6. улучшать synthetic FK parent update/delete benchmark без production DDL;
7. расширять browser recovery tests без real accounts;
8. готовить exact non-PII query-to-index mapping;
9. не reconciliate `leader_*` migrations;
10. не выполнять cost confirmation заранее;
11. не создавать branch, accounts, secrets или cloud resources.

Новый cloud deployment slice отсутствует: оставшиеся cloud-шаги требуют explicit owner, cost и Auth approval.

## Команда для отдельного gated решения

Для authenticated preview E2E владелец должен явно разрешить одновременно:

`authenticated_e2e_only`, свежую стоимость branch, отдельный cost confirmation, disposable preview branch максимум на 6 часов, synthetic technical accounts и automatic cleanup.

Без такой формулировки cloud execution запрещено.
