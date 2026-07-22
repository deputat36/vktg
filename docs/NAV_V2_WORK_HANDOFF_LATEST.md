# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 22 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- `main`: `d7c7fa80f011643a869cd502f94209bec8ab3ade` — squash merge PR #453.
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

Последняя общая migration относится к `leader_*`. Navigator не должен менять, откатывать или нормализовать migration history другого модуля.

Live counts, Auth logs, WAL и `idx_scan` могут меняться из-за реальной работы, рестарта и сброса статистики. Не откатывать data, не оценивать сотрудников и не удалять индексы только из-за счётчиков.

## Назначение продукта

Navigator — единая заявка на подготовку сделки и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`потребность → короткий сбор фактов → маршрутизация → план документов и условий → решение профильной роли → выполнение → evidence → подтверждение готовности → задаток/сделка → закрытие`

Navigator не является основной CRM, файловым архивом, банковской CRM, автоматическим юристом или системой оценки сотрудников по сырым счётчикам.

Роли:

- СПН фиксирует известные факты и выполняет свои действия.
- Юрист принимает юридические решения и подтверждает юридические gates.
- Брокер отвечает только за ипотечную консультацию, программу и одобрение.
- Маткапитал, сертификаты, субсидии, дети и опека без ипотеки относятся к СПН и юристу.
- Менеджер контролирует владельцев, сроки и исключения, но не заменяет профильную роль.
- Файлы остаются во внешнем утверждённом хранилище.
- Navigator минимизирует прямые идентификаторы и не дублирует CRM.

Каждый автоматически создаваемый пункт обязан иметь:

`trigger → owner → deadline → action → evidence → outcome → confirmation → gate impact`

Автоматический backlog нельзя расширять без completion contract.

## Production baseline

Последний business-count snapshot:

- 23 сделки;
- 24 участника;
- 198 документов;
- 53 риска;
- 98 задач;
- 122 события.

Production indexes остаются без изменений:

- `nav_user_profiles_role_idx` — btree `(role)`;
- `nav_deal_answers_v2_deal_idx` — btree `(deal_id)`;
- `nav_deal_answers_v2_deal_id_question_key_key` — unique btree `(deal_id, question_key)`.

Fresh aggregate-only FK contract:

- `nav_deal_answers_v2.deal_id → nav_deals_v2.id`;
- `ON DELETE CASCADE`;
- `ON UPDATE NO ACTION`;
- `validated=true`;
- `deferrable=false`;
- `initially_deferred=false`;
- PII не возвращалась;
- DDL/DML не выполнялись.

Read-only statistics capture от 22 июля 2026 года для `nav_deal_answers_v2`:

- heap `8192` bytes;
- total relation `81920` bytes;
- оба candidate indexes по `16384` bytes;
- `seq_scan=4`, `idx_scan=0`;
- DML counters и `n_live_tup` равны `0`;
- analyze/vacuum timestamps отсутствуют;
- `pg_stat_database.stats_reset=null`;
- global WAL snapshot нельзя связать с candidate index.

Эта статистика не является representative production workload и не заменяет фактические counts, observation window или authenticated traffic evidence.

В production отсутствуют:

- bounded task columns/events/RPC;
- final 25-rule mapper;
- governed intake ledger/mapper;
- privacy-aligned quality replacement;
- cleanup execution;
- bounded frontend transport;
- candidate Edge deployment;
- technical `nav-e2e` accounts;
- preview branch.

## Действующий runtime

Production создание сделки использует:

- `spn-v2.html`;
- `assets/js/nav-v2/spn-smart-v4.js`;
- legacy RPC `public.nav_v2_save_wizard_result(jsonb)`;
- legacy server implementation и quality-функцию;
- duplicate, idempotency и recovery guards.

Production task actions используют:

- `assets/js/nav-v2/task-action-guard-v2.js`;
- legacy RPC `public.nav_v2_update_task_status(uuid, nav_v2_task_status)`;
- deployed Edge facade v4.

Новый intake, bounded contract, actor-aware routes и preview packages остаются repository-only.

## Завершённая repository-only цепочка

### PR #394–#419 — intake и trust boundary

Подготовлены:

- трёхэтапный intake;
- versioned facts/evidence/rules/documents/decisions;
- legal passport;
- side-aware work plan;
- server recomputation;
- privacy allowlist;
- verified actor context;
- private request ledger;
- replay protection;
- atomic rollback;
- production-like mapping.

Effective structural coverage: `25 supported / 0 unsupported`. Это repository coverage, а не production readiness.

### PR #408–#410 — privacy quality и cleanup decision

- ФИО и телефоны исключены из нового quality contract.
- 46 legacy quality rows классифицированы.
- Zero-write cleanup planner доказан.
- `selected_cleanup_option=null`.
- Production cleanup не выполнялся.

### PR #421–#434 — preview packages и lifecycle

Исторический branch snapshot: `0.01344 USD/час`, максимум `0.08064 USD` за 6 часов без egress/storage. Стоимость обязательно проверяется заново перед любым cost confirmation.

Текущее состояние:

- `selected_deployment_option=null`;
- `explicit_owner_cost_approval=false`;
- `cost_confirmation_id=null`;
- `branch_creation_allowed=false`.

Issue #282 остаётся binding cost gate.

Доказаны exact source order/SHA-256, PostgreSQL 17 apply/assert/rollback, consolidated bounded forward/rollback, actor identity, DTO permissions, no documents/risks side effects, `ALWAYS ROLLBACK` и combined lifecycle:

`privacy quality → consolidated bounded → governed intake 25-rule mapper → reverse rollback`

Package v3 связывает package v2, combined lifecycle, exact rollback, minimal grants, disabled Edge candidate, execution runbook, technical-account lifecycle и Auth E2E readiness.

Все execution и production-readiness flags остаются `false`.

### PR #436 — Security Advisor contract

- 50 curated external RPC;
- 48 expected callable `SECURITY DEFINER` warnings;
- observed `48/48`, missing `0`, unexpected `0`;
- две `SECURITY INVOKER` exceptions;
- Navigator migration и Edge baseline не изменились.

Fresh Advisor check 22 июля не выявил нового Navigator drift. Callable warnings остаются ожидаемыми для curated external RPC и не должны исправляться автоматической сменой security model.

Issue #161 остаётся открытой из-за leaked-password/Auth E2E prerequisites.

### PR #438 — Performance Advisor contract

- Navigator tables: `11`;
- indexes: `53`;
- foreign keys with covering index: `29/29`;
- RLS policies: `32`;
- SELECT-wrapped Auth: `32/32`;
- direct per-row Auth calls: `0`;
- representative workload window не доказан.

`idx_scan=0` не является drop approval.

### PR #440 — synthetic query-plan evidence

- `120000` profiles;
- `5000` deals;
- `100000` answers;
- natural/structural JSON `EXPLAIN`;
- synthetic-only index removal;
- result hash equivalence;
- full rollback.

Решения:

1. `nav_user_profiles_role_idx` — `retain`.
2. `nav_deal_answers_v2_deal_idx` — `review_possible_redundancy_only`.

### PR #442 и PR #444 — browser Auth recovery

PR #442 устранил invalid/not-found/already-used refresh loop:

- недействительная session/profile cache очищается один раз;
- email сохраняется для чистого входа;
- повторный RPC останавливается;
- валидный refresh повторяет RPC ровно один раз.

PR #444 добавил multi-tab race protection:

- exclusive Web Lock `navigator-v2-auth-refresh`;
- повторное чтение session после получения lock;
- новая session другой вкладки не перезаписывается и не очищается старым response;
- logout во время refresh не приводит к восстановлению session;
- fallback compare-before-write/invalidate работает без Web Locks.

Merge PR #444: `d55c7646dea7d5d130f1b4571ed15610e2a6395f`.

Fresh Auth logs 22 июля содержат успешный refresh/login. Новых `refresh_token_not_found` после старого инцидента 21 июля не обнаружено.

Authenticated smoke остаётся gated и корректно skipped без preview secrets.

### PR #445 и PR #449 — canonical FK parent mutation evidence

Initial merge PR #445: `1076b70a23c89d0058beee29847f092cdc5dabb9`.

Canonical hardening merge PR #449: `d71d5af774c9e0bdfa475869c2f34960d924dff0`.

Canonical PostgreSQL 17 harness по `100000` synthetic answers выполняет:

- 2 parent `DELETE CASCADE`;
- 2 successful unreferenced parent key updates;
- 2 rejected referenced parent key updates с SQLSTATE `23503`.

Подтверждены:

- live/synthetic FK validated, non-deferrable, initially-immediate;
- transaction-local scans через `pg_stat_get_xact_numscans(oid)`;
- после synthetic removal single index composite scan delta = `1` для delete, successful update и blocked update;
- `EXPLAIN ANALYZE, BUFFERS, WAL, FORMAT JSON`;
- synthetic index size capture;
- final counts и full rollback.

Decision:

`synthetic_fk_parent_mutation_gap_hardened_production_drop_not_ready`

Закрытые PR #447 и #448 не смержены, поскольку их проверки уже вошли в canonical evidence.

### PR #451 — exact non-PII query-to-index mapping

Merge: `318a86d47a5ef5106819eca469313dc3afe6a109`.

`nav_user_profiles_role_idx`:

- 24 функции reference `nav_user_profiles` и `role`;
- 1 direct runtime role filter;
- 1 direct demo role filter;
- 1 whole-table role aggregate;
- 2 role write paths;
- 19 PK lookup / ID join / projection / loaded-variable paths;
- решение остаётся `retain`.

`nav_deal_answers_v2_deal_idx`:

- 1 demo cleanup consumer с `DELETE ... WHERE deal_id IN (...)`;
- 1 demo seed consumer, insert-only;
- internal FK lookup учитывается отдельно;
- решение остаётся `review_possible_redundancy_only`.

Static validator доказал полное совпадение категорий с исходными signatures без пропусков и дублей. PII и business rows не использовались.

### PR #453 — synthetic write/storage measurement

Merge: `d7c7fa80f011643a869cd502f94209bec8ab3ade`.

Fresh production capture был только aggregate/statistics read-only и доказал, что текущие counters не дают representative workload evidence.

Isolated PostgreSQL 17 harness сравнил:

1. single `(deal_id)` + unique composite `(deal_id, question_key)`;
2. только unique composite `(deal_id, question_key)`.

На каждый режим:

- insert `100000` rows;
- indexed `deal_id` update `10000` rows;
- delete `10000` rows;
- final `90000` rows;
- statement-local `EXPLAIN ANALYZE, BUFFERS, WAL, FORMAT JSON`;
- relation/index size snapshots;
- deterministic final hash;
- full rollback и schema absence.

Synthetic CI observations:

- insert extra single-index WAL: `+7123512` bytes, около `+21.8%`;
- indexed update extra WAL: `+712288` bytes, около `+17.6%`;
- delete WAL delta: `0`;
- extra single-index storage: `1024000–1130496` bytes;
- около `+18.7–18.8%` candidate-index storage;
- около `+5.0%` total relation size.

Эти значения относятся только к generated CI workload и не являются production forecast, latency proof или DDL approval.

Decision:

`synthetic_write_storage_measurement_completed_production_drop_not_ready`

CI:

- measurement run `29892486473` — success;
- static run `29892486487` — success;
- preview package run `29892486503` — success;
- combined lifecycle run `29892486515` — success.

Artifact:

- ID `8518731280`;
- digest `sha256:cee54610f07a81261813fa9b69e8e5dd5e2bc814d6f7e7ae8bc5983ae93ff8ac`.

## Обязательные gates

### Repository preparation gate

Закрыты:

- reviewable inventory;
- exact hashes/source order;
- consolidated bounded rollback;
- combined quality/bounded/intake lifecycle;
- exact preview rollback;
- minimal grants;
- disabled Edge candidate;
- execution runbook;
- technical-account lifecycle;
- Security/Performance Advisor contracts;
- synthetic query-plan evidence;
- hardened FK mutation semantics;
- browser refresh recovery;
- exact non-PII query-to-index mapping;
- synthetic write/storage measurement methodology и CI evidence.

Это repository evidence, а не разрешение на cloud execution или production DDL.

### Preview branch and Auth E2E gate

Следующий cloud шаг запрещён без отдельного явного решения владельца, включающего:

- `authenticated_e2e_only`;
- fresh branch cost recheck;
- показ актуальной суммы и валюты;
- отдельное подтверждение стоимости;
- `confirm_cost` и `cost_confirmation_id`;
- disposable branch максимум на 6 часов;
- automatic delete deadline;
- synthetic-only data;
- только technical `nav-e2e` accounts;
- запрет production data/real employees;
- обязательный cleanup.

Generic команды `продолжай`, `работай по плану` и `действуй автономно` не являются approval.

### Leaked-password Auth gate

`auth_leaked_password_protection` остаётся выключенной до issue #16, issue #159, issue #282 и повторного login/recovery QA в disposable preview environment.

Browser recovery PR #442/#444 не заменяет authenticated E2E.

### Production DDL gate

Production deployment, index removal, RLS rewrite и cleanup запрещены без отдельных evidence packages и owner approvals.

Для `nav_deal_answers_v2_deal_idx` repository-only structural/FK/query-mapping/write-storage evidence закрыто, но отсутствуют:

- известное начало production statistics window;
- representative authenticated workload;
- production `EXPLAIN ANALYZE` на non-PII fixtures;
- production-scale FK parent mutation benchmark;
- production write amplification/storage benefit measurement;
- authenticated regression suite;
- exact forward/rollback migration;
- отдельное owner DDL approval.

Для `nav_user_profiles_role_idx` решение остаётся `retain`; mapping не является основанием для удаления.

Не изменять production `leader_*`. Navigator использует только `nav_*`, `nav_v2_*` и общий Auth.

## Канонические артефакты

Preview/database:

- `config/nav-v2-preview-candidate-package-v3.json`
- `config/nav-v2-preview-execution-runbook-v1.json`
- `config/nav-v2-preview-technical-account-lifecycle-v1.json`
- `config/nav-v2-combined-preview-lifecycle-v1.json`
- `config/nav-v2-combined-preview-intake-rollback-v1.json`
- `config/nav-v2-preview-readonly-attestation-v1.json`
- `config/nav-v2-preview-minimal-grants-candidate-v1.json`
- `config/nav-v2-bounded-consolidated-candidate-v1.json`

Advisor/index evidence:

- `config/nav-v2-advisor-live-attestation.json`
- `config/nav-v2-advisor-scope.json`
- `config/nav-v2-performance-advisor-attestation-v1.json`
- `config/nav-v2-index-query-plan-candidate-v1.json`
- `config/nav-v2-index-fk-parent-mutation-evidence-v1.json`
- `config/nav-v2-query-to-index-mapping-v1.json`
- `config/nav-v2-index-write-storage-measurement-v1.json`
- `tests/sql/nav_v2_index_query_plan_harness_v1.sql`
- `tests/sql/nav_v2_index_fk_parent_mutation_harness_v1.sql`
- `tests/sql/nav_v2_index_write_storage_measurement_harness_v1.sql`
- `scripts/check_nav_v2_index_query_plan_candidate_v1.py`
- `scripts/check_nav_v2_index_fk_parent_mutation_evidence_v1.py`
- `scripts/check_nav_v2_query_to_index_mapping_v1.py`
- `scripts/check_nav_v2_index_write_storage_measurement_v1.py`
- `docs/NAV_V2_INDEX_QUERY_PLAN_CANDIDATE_V1_2026-07-21.md`
- `docs/NAV_V2_INDEX_FK_PARENT_MUTATION_EVIDENCE_V1_2026-07-21.md`
- `docs/NAV_V2_QUERY_TO_INDEX_MAPPING_V1_2026-07-21.md`
- `docs/NAV_V2_INDEX_WRITE_STORAGE_MEASUREMENT_V1_2026-07-22.md`

Auth/runtime:

- `assets/js/nav-v2/supabase-v2.js`
- `assets/js/nav-v2/auth-session-recovery-v2.js`
- `tests/unit/nav-v2-auth-session-recovery.test.mjs`
- `.github/workflows/nav-v2-auth-session-recovery-v1.yml`
- `docs/NAV_V2_AUTH_MULTI_TAB_REFRESH_RECOVERY_V2_2026-07-21.md`

Edge/lifecycle:

- `supabase/functions/nav-v2-deal-api/index.ts`
- `supabase/functions/nav-v2-deal-api/index.production-v4.ts`
- `scripts/run-nav-v2-combined-preview-lifecycle-v1.sh`
- `scripts/check_nav_v2_preview_execution_package_v3.py`
- `scripts/check_nav_v2_advisor_live_attestation.py`
- `scripts/check_nav_v2_performance_advisor_attestation_v1.py`

## Следующий безопасный slice

Разрешены только бесплатные read-only и repository actions:

1. поддерживать package v3, handoff и live attestations;
2. проверять CI/review drift;
3. повторять aggregate-only production preflight без PII;
4. фиксировать Navigator migration, Advisor, index/RLS или Edge drift;
5. анализировать Auth/Edge/API logs без settings changes и токенов;
6. расширять browser recovery tests без real accounts;
7. подготовить production-scale FK benchmark contract только как fail-closed plan без cloud execution и production DML;
8. уточнить future production observation-window protocol без запуска workload;
9. не reconciliate `leader_*` migrations;
10. не выполнять cost confirmation заранее;
11. не создавать Supabase branch, accounts, secrets или cloud resources.

Новый cloud deployment slice отсутствует.

## Команда для отдельного gated решения

Для authenticated preview E2E владелец должен явно разрешить одновременно:

`authenticated_e2e_only`, свежую стоимость branch, отдельный cost confirmation, disposable preview branch максимум на 6 часов, synthetic technical accounts и automatic cleanup.

Без такой формулировки cloud execution запрещено.
