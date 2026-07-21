# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 21 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- `main`: `1076b70a23c89d0058beee29847f092cdc5dabb9` — squash merge PR #445.
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

Fresh aggregate-only FK capture после PR #443:

- `nav_deal_answers_v2.deal_id → nav_deals_v2.id`;
- `ON DELETE CASCADE`;
- `ON UPDATE NO ACTION`;
- row estimates: `23 deals / 7 answers`;
- `pg_stat_database.stats_reset = null`;
- PII не возвращалась;
- DDL/DML не выполнялись.

В production отсутствуют:

- bounded task columns и mutation event table;
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

Подготовлены трёхэтапный intake, versioned facts/evidence/rules/documents/decisions, legal passport, side-aware work plan, server recomputation, privacy allowlist, verified actor context, private ledger, replay protection, atomic rollback и production-like mapping.

Effective repository coverage: `25 supported / 0 unsupported`.

`25/0` означает structural repository coverage, а не production readiness.

### PR #408–#410 — privacy quality и cleanup decision

- ФИО и телефоны исключены из нового quality contract.
- 46 legacy quality rows классифицированы.
- Deterministic zero-write cleanup planner доказан.
- `selected_cleanup_option=null`.
- Production cleanup не выполнялся.

### PR #421–#423 — deployment decision, cost и source manifest

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

Доказаны exact source order/SHA-256, PostgreSQL 17 apply/assert/rollback, отсутствие generated SQL в migrations, consolidated bounded forward/rollback, actor identity, DTO permissions, отсутствие documents/risks side effects и `ALWAYS ROLLBACK`.

Edge actor identity candidate находится за `BOUNDED_TASK_EDGE_IDENTITY_ENABLED=false` и не развёрнут.

### PR #432–#434 — preview packages и combined lifecycle

Package v2 добавил aggregate-only production preflight и deterministic package index.

PR #433 доказал в одной PostgreSQL 17 базе:

`privacy quality → consolidated bounded → governed intake 25-rule mapper → reverse rollback`

PR #434 связал package v2, combined lifecycle, exact rollback, minimal grants, execution runbook, synthetic technical-account lifecycle и Auth E2E readiness.

Все execution и production-readiness flags остаются `false`.

Будущий gated execution order:

0. fresh read-only preflight и cost lookup;
1. owner/cost-gated disposable branch;
2. database-first apply;
3. Edge deploy с feature flag `false`;
4. preview-only synthetic accounts;
5. authenticated role/mutation E2E;
6. cleanup и branch deletion не позднее шести часов.

### PR #436 — Security Advisor whitelist и drift attestation

Fresh read-only evidence:

- 50 curated external RPC;
- 48 expected callable `SECURITY DEFINER` warnings;
- observed `48/48`, missing `0`, unexpected `0`;
- две допустимые `SECURITY INVOKER` exceptions;
- Navigator migration boundary не изменилась;
- latest overall migration относится к `leader_*`;
- Edge v4/JWT/hash не изменились;
- preview branch, candidate DB objects и technical identities отсутствуют.

Issue #161 остаётся открытой из-за leaked-password/Auth E2E prerequisites, а не whitelist drift.

### PR #438 — Performance Advisor scope и no-auto-DDL contract

Navigator v2 scope:

- tables: `11`;
- indexes: `53`;
- foreign keys: `29/29` имеют covering index;
- RLS policies: `32`;
- SELECT-wrapped Auth policies: `32/32`;
- direct per-row Auth calls: `0`;
- zero-scan non-constraint indexes: `13`;
- representative workload window не доказан.

Fail-closed policy:

`idx_scan=0` не является drop approval.

### PR #440 — synthetic index query-plan evidence

- `120000` synthetic profiles;
- `5000` deals;
- `100000` answers;
- natural и structural JSON `EXPLAIN`;
- synthetic-only index removal;
- result hash equivalence;
- full rollback и schema absence.

Решения:

1. `nav_user_profiles_role_idx` — `retain`.
2. `nav_deal_answers_v2_deal_idx` — `review_possible_redundancy_only`.

Composite unique `(deal_id, question_key)` структурно обслуживает `deal_id` leading-prefix query и synthetic FK child lookup. Это не production benchmark.

### PR #442 — browser Auth session recovery

Merge: `64e2a7a8d471525410e5adf1c73214aa05e160fa`.

Исправлено:

- invalid/not-found/already-used refresh token классифицируется отдельно;
- недействительная session и profile cache очищаются однократно;
- последний email сохраняется;
- пользователь получает понятное сообщение;
- следующий RPC без нового входа останавливается до сети;
- действующий refresh token обновляет session и повторяет RPC ровно один раз.

CI: Auth recovery, static, JavaScript, desktop/mobile Playwright и read-layer browser regression — success.

### PR #445 — synthetic FK parent mutation evidence

Merge: `1076b70a23c89d0058beee29847f092cdc5dabb9`.

Live read-only FK contract:

- child: `public.nav_deal_answers_v2`;
- parent: `public.nav_deals_v2`;
- `ON DELETE CASCADE`;
- `ON UPDATE NO ACTION`;
- single `(deal_id)` и unique composite `(deal_id, question_key)` по `16384` bytes;
- row estimates `23 / 7`;
- `stats_reset=null`.

PostgreSQL 17 harness создаёт два независимых режима по `100000` synthetic answers:

1. оба индекса;
2. только composite-prefix.

Actual `EXPLAIN ANALYZE` подтвердил в обоих режимах:

- parent `DELETE CASCADE` удаляет parent и 20 children;
- parent key `UPDATE` выполняет `NO ACTION` child-reference check;
- FK trigger evidence присутствует;
- mutation post-state semantics совпадают;
- unaffected answer hash совпадает;
- full rollback и schema absence проходят.

Decision:

`synthetic_fk_parent_mutation_gap_closed_production_drop_not_ready`

CI evidence:

- workflow run `29859873682` — success;
- FK artifact `8506837684`;
- digest `sha256:68a05799d046efc973befbd6c8a4cdffa8f67d575cfcc95fe03a3d99d39a2f7a`;
- static `29859873720` — success;
- preview package `29859873663` — success;
- combined lifecycle `29859873600` — success.

Это repository-only evidence. Production index не удалялся.

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
- synthetic FK parent mutation semantics evidence;
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

Для `nav_deal_answers_v2_deal_idx` synthetic structural и FK mutation semantics evidence теперь закрыты, но отсутствуют:

- известное начало production statistics observation window;
- representative authenticated workload;
- production `EXPLAIN ANALYZE` на representative non-PII fixtures;
- production-scale FK parent update/delete benchmark;
- write amplification/storage benefit calculation;
- authenticated regression suite;
- exact forward и rollback migration;
- отдельное owner DDL approval.

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

Advisor, performance и index evidence:

- `config/nav-v2-advisor-live-attestation.json`
- `config/nav-v2-advisor-scope.json`
- `config/nav-v2-performance-advisor-attestation-v1.json`
- `config/nav-v2-index-query-plan-candidate-v1.json`
- `config/nav-v2-index-fk-parent-mutation-evidence-v1.json`
- `config/nav-v2-rpc-surface.json`
- `tests/sql/nav_v2_advisor_readonly_preflight_v1.sql`
- `tests/sql/nav_v2_performance_readonly_preflight_v1.sql`
- `tests/sql/nav_v2_index_query_plan_harness_v1.sql`
- `tests/sql/nav_v2_index_fk_parent_mutation_harness_v1.sql`
- `tests/sql/nav_v2_preview_readonly_preflight_v1.sql`
- `scripts/check_nav_v2_index_query_plan_candidate_v1.py`
- `scripts/check_nav_v2_index_fk_parent_mutation_evidence_v1.py`
- `docs/NAV_V2_INDEX_QUERY_PLAN_CANDIDATE_V1_2026-07-21.md`
- `docs/NAV_V2_INDEX_FK_PARENT_MUTATION_EVIDENCE_V1_2026-07-21.md`

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

## Следующий безопасный slice без нового approval

Разрешены только бесплатные read-only и repository actions:

1. поддерживать package v3, handoff и live attestations;
2. проверять CI и review drift;
3. повторять aggregate-only production preflight без PII;
4. фиксировать Navigator migration, Advisor, index/RLS или Edge drift;
5. анализировать Auth/Edge/API logs без изменения settings и без раскрытия токенов;
6. составлять exact non-PII query-to-index mapping;
7. расширять browser recovery tests без real accounts;
8. готовить production-scale benchmark contract только как fail-closed план, без production DDL;
9. не reconciliate `leader_*` migrations;
10. не выполнять cost confirmation заранее;
11. не создавать branch, accounts, secrets или cloud resources.

Новый cloud deployment slice отсутствует: оставшиеся cloud-шаги требуют explicit owner, cost и Auth approval.

## Команда для отдельного gated решения

Для authenticated preview E2E владелец должен явно разрешить одновременно:

`authenticated_e2e_only`, свежую стоимость branch, отдельный cost confirmation, disposable preview branch максимум на 6 часов, synthetic technical accounts и automatic cleanup.

Без такой формулировки cloud execution запрещено.
