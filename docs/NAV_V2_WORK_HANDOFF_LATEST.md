# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 22 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- `main`: `7bc8643026243bf838b1f811d811e672a557fd2a` — squash merge PR #458.
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
- Открытых Navigator PR после PR #458 нет.

Последняя общая migration относится к `leader_*`. Navigator не должен менять, откатывать или нормализовать migration history другого модуля.

Live counts, Auth logs, WAL и `idx_scan` могут меняться из-за реальной работы, restart и reset статистики. Не откатывать data, не оценивать сотрудников и не удалять индексы только из-за counters.

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

Эти counts являются историческим snapshot, а не основанием для cleanup или оценки сотрудников.

Production indexes остаются без изменений:

- `nav_user_profiles_role_idx` — btree `(role)`;
- `nav_deal_answers_v2_deal_idx` — btree `(deal_id)`;
- `nav_deal_answers_v2_deal_id_question_key_key` — unique btree `(deal_id, question_key)`.

FK contract:

- `nav_deal_answers_v2.deal_id → nav_deals_v2.id`;
- `ON DELETE CASCADE`;
- `ON UPDATE NO ACTION`;
- `validated=true`;
- `deferrable=false`;
- `initially_deferred=false`.

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

### Intake, privacy и trust boundary — PR #394–#419

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
- production-like 25-rule mapping.

Effective structural coverage: `25 supported / 0 unsupported`. Это repository coverage, а не production readiness.

### Privacy quality и cleanup — PR #408–#410

- ФИО и телефоны исключены из нового quality contract.
- 46 legacy quality rows классифицированы.
- Zero-write cleanup planner доказан.
- `selected_cleanup_option=null`.
- Production cleanup не выполнялся.

### Preview packages и lifecycle — PR #421–#434

Исторический branch snapshot: `0.01344 USD/час`, максимум `0.08064 USD` за 6 часов без egress/storage.

Эта цена устаревающая и не может использоваться для нового cost confirmation.

Текущее состояние:

- `selected_deployment_option=null`;
- `explicit_owner_cost_approval=false`;
- `cost_confirmation_id=null`;
- `branch_creation_allowed=false`.

Package v3 связывает exact source order/SHA-256, PostgreSQL 17 apply/assert/rollback, combined lifecycle, exact rollback, minimal grants, disabled Edge candidate, execution runbook, technical-account lifecycle и Auth E2E readiness.

Все execution и production-readiness flags остаются `false`.

### Security Advisor — PR #436

- 50 curated external RPC;
- 48 expected callable `SECURITY DEFINER` warnings;
- две `SECURITY INVOKER` exceptions;
- Navigator migration и Edge baseline не изменились.

Fresh Advisor check 22 июля не выявил нового Navigator drift. Callable warnings не должны исправляться автоматической сменой security model.

`auth_leaked_password_protection` остаётся отдельным gated решением.

### Performance Advisor и query plans — PR #438 и PR #440

- Navigator tables: `11`;
- indexes: `53`;
- foreign keys with covering index: `29/29`;
- RLS policies: `32`;
- SELECT-wrapped Auth: `32/32`;
- direct per-row Auth calls: `0`.

Synthetic query-plan harness:

- `120000` profiles;
- `5000` deals;
- `100000` answers;
- JSON `EXPLAIN`;
- synthetic-only index removal;
- result hash equivalence;
- full rollback.

Решения:

1. `nav_user_profiles_role_idx` — `retain`.
2. `nav_deal_answers_v2_deal_idx` — `review_possible_redundancy_only`.

`idx_scan=0` не является drop approval.

### Browser Auth recovery — PR #442 и PR #444

Реализованы:

- invalid/not-found/already-used refresh loop stop;
- single cache clear;
- retry валидного refresh ровно один раз;
- exclusive Web Lock `navigator-v2-auth-refresh`;
- повторное чтение session после lock;
- защита новой session другой вкладки;
- запрет восстановления session после logout;
- fallback compare-before-write/invalidate без Web Locks.

Merge PR #444: `d55c7646dea7d5d130f1b4571ed15610e2a6395f`.

Fresh Auth logs 22 июля содержат успешный refresh/login. Новых `refresh_token_not_found` после инцидента 21 июля не обнаружено.

Authenticated smoke остаётся gated и корректно skipped без preview secrets.

### Canonical FK parent mutation — PR #445 и PR #449

Canonical PostgreSQL 17 harness по `100000` synthetic answers проверяет:

- parent `DELETE CASCADE`;
- successful unreferenced parent key update;
- rejected referenced parent key update с SQLSTATE `23503`;
- transaction-local scans через `pg_stat_get_xact_numscans(oid)`;
- composite scan attribution после synthetic single-index removal;
- `EXPLAIN ANALYZE, BUFFERS, WAL, FORMAT JSON`;
- index sizes, final counts и full rollback.

Decision:

`synthetic_fk_parent_mutation_gap_hardened_production_drop_not_ready`

### Exact query-to-index mapping — PR #451

`nav_user_profiles_role_idx`:

- 24 functions reference `nav_user_profiles` и `role`;
- 2 direct role-first filters;
- 1 non-demo runtime direct filter;
- решение `retain`.

`nav_deal_answers_v2_deal_idx`:

- 1 demo cleanup consumer с filter by `deal_id`;
- 1 demo seed insert-only consumer;
- internal FK lookup учитывается отдельно;
- решение `review_possible_redundancy_only`.

PII и business rows не использовались.

### Synthetic write/storage measurement — PR #453

Merge: `d7c7fa80f011643a869cd502f94209bec8ab3ade`.

Isolated PostgreSQL 17 harness сравнил single+composite и composite-only modes.

На каждый mode:

- insert `100000` rows;
- indexed update `10000` rows;
- delete `10000` rows;
- final `90000` rows;
- statement-local `EXPLAIN ANALYZE, BUFFERS, WAL, FORMAT JSON`;
- relation/index size snapshots;
- deterministic hash;
- full rollback и schema absence.

Synthetic CI observations:

- insert extra single-index WAL: `+7123512` bytes, около `+21.8%`;
- indexed update extra WAL: `+712288` bytes, около `+17.6%`;
- delete WAL delta: `0`;
- extra single-index storage: `1024000–1130496` bytes;
- около `+18.7–18.8%` candidate-index storage;
- около `+5.0%` total relation size.

Это generated CI workload, а не production forecast, latency proof или DDL approval.

Decision:

`synthetic_write_storage_measurement_completed_production_drop_not_ready`

Artifact ID `8518731280`, digest `sha256:cee54610f07a81261813fa9b69e8e5dd5e2bc814d6f7e7ae8bc5983ae93ff8ac`.

### Production-scale FK benchmark plan — PR #455

Merge: `ea5d5aa684762a9f9563020abd40bf636acfe034`.

Подготовлен fail-closed protocol, но benchmark не выполнялся.

Execution state:

- `benchmark_execution_authorized=false`;
- `cloud_execution_allowed=false`;
- `production_dml_authorized=false`;
- `production_ddl_authorized=false`;
- `selected_environment=null`;
- `preview_branch_created=false`;
- `cost_rechecked=false`;
- `explicit_owner_cost_approval=false`;
- `cost_confirmation_id=null`.

Allowed future environments:

1. owner/cost-approved disposable Supabase preview branch;
2. isolated ephemeral PostgreSQL 17.

Production database, copied production rows, real accounts и direct identifiers запрещены.

Required future matrix включает zero/one/median/p95/max-bounded child deletes, successful unreferenced update, rejected `23503` update и mixed batch.

Measurement protocol: 5 warmups, 20 measured iterations, randomized order, deterministic dataset, JSON plans, BUFFERS/WAL, lock/timeout/deadlock, sizes/counts/hashes и cleanup evidence.

Fixed latency/WAL/storage threshold отсутствует. Successful benchmark не является automatic DROP INDEX approval.

Decision:

`production_scale_fk_benchmark_protocol_prepared_execution_blocked`

### Index observation window — PR #457

Merge: `ec73826983207241f1e1d87ff6697757fdacee17`.

Read-only baseline captured at `2026-07-22T05:31:47.591346+00:00` without business rows, PII, query text, DML, DDL, settings changes or statistics reset.

Epoch identity:

- database OID `5`;
- postmaster start `2026-06-13T20:56:45.579218+00:00`;
- database `stats_reset=null`;
- WAL reset `2026-06-13T20:56:11.777190+00:00`;
- table OID `19392`;
- composite index OID `19402`;
- single index OID `19583`.

Candidate baseline:

- `seq_scan=4`;
- `seq_tup_read=35`;
- candidate `idx_scan=0`;
- table DML counters `0`;
- heap `8192` bytes;
- total relation `81920` bytes;
- оба candidate indexes valid/ready, `16384` bytes.

Observation state:

- baseline capture count `1`;
- minimum captures `2`;
- `selected_cadence=null`;
- completion thresholds `null`;
- window incomplete;
- workload representativeness unproven.

Restart, statistics reset, OID/definition drift, invalid index state или counter decrease инвалидируют окно.

Decision:

`observation_window_baseline_started_evidence_not_yet_representative`

CI:

- observation source contract `29894311897`;
- static 49/49 `29894311883`;
- preview package `29894311874`;
- combined PostgreSQL lifecycle `29894311871`.

### Capacity-input decision form — PR #458

Merge: `7bc8643026243bf838b1f811d811e672a557fd2a`.

Подготовлена единая форма для будущего решения по:

- environment;
- target scale source;
- target deals и answers;
- p50/p95/max-bounded answers-per-deal distribution;
- peak concurrency и headroom;
- compute class;
- maximum runtime;
- observation cadence;
- minimum days/sessions/index reads/table writes/parent mutations.

Все 15 input values остаются `null`.

Form state:

- `status=unsubmitted`;
- owner approval `false`;
- release-manager approval `false`;
- values may not be guessed;
- partial/complete form alone does not authorize execution.

Preview cost gate:

- `cost_rechecked=false`;
- amount/currency/recurrence `null`;
- `shown_to_owner=false`;
- `explicit_owner_cost_approval=false`;
- `cost_confirmation_id=null`;
- automatic delete deadline `null`.

Historical cost нельзя использовать как fresh confirmation.

Decision:

`capacity_input_decision_form_prepared_unsubmitted_execution_blocked`

CI:

- capacity-input source contract `29894655170`;
- static 49/49 `29894655090`.

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
- synthetic write/storage measurement;
- fail-closed production-scale FK benchmark protocol;
- read-only observation-window baseline;
- unsubmitted capacity-input decision form.

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

Для `nav_deal_answers_v2_deal_idx` repository-only evidence и protocols подготовлены, но отсутствуют:

- утверждённая cadence observation window;
- утверждённые completion thresholds;
- end capture в том же epoch;
- representative authenticated workload;
- утверждённые capacity/concurrency/runtime inputs;
- отдельное benchmark execution authorization;
- выполненный production-scale benchmark в разрешённой disposable/isolated среде;
- production `EXPLAIN ANALYZE` на approved non-PII fixtures;
- production write amplification/storage benefit evidence;
- authenticated regression suite;
- exact forward/rollback migration;
- отдельное owner DDL approval.

Для `nav_user_profiles_role_idx` решение остаётся `retain`.

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
- `config/nav-v2-production-scale-fk-benchmark-plan-v1.json`
- `config/nav-v2-index-observation-window-v1.json`
- `config/nav-v2-index-capacity-input-decision-v1.json`
- `tests/sql/nav_v2_index_query_plan_harness_v1.sql`
- `tests/sql/nav_v2_index_fk_parent_mutation_harness_v1.sql`
- `tests/sql/nav_v2_index_write_storage_measurement_harness_v1.sql`
- `tests/sql/nav_v2_production_scale_fk_benchmark_readonly_preflight_v1.sql`
- `tests/sql/nav_v2_index_observation_window_readonly_capture_v1.sql`
- `scripts/check_nav_v2_index_query_plan_candidate_v1.py`
- `scripts/check_nav_v2_index_fk_parent_mutation_evidence_v1.py`
- `scripts/check_nav_v2_query_to_index_mapping_v1.py`
- `scripts/check_nav_v2_index_write_storage_measurement_v1.py`
- `scripts/check_nav_v2_production_scale_fk_benchmark_plan_v1.py`
- `scripts/check_nav_v2_index_observation_window_v1.py`
- `scripts/check_nav_v2_index_capacity_input_decision_v1.py`
- `docs/NAV_V2_INDEX_QUERY_PLAN_CANDIDATE_V1_2026-07-21.md`
- `docs/NAV_V2_INDEX_FK_PARENT_MUTATION_EVIDENCE_V1_2026-07-21.md`
- `docs/NAV_V2_QUERY_TO_INDEX_MAPPING_V1_2026-07-21.md`
- `docs/NAV_V2_INDEX_WRITE_STORAGE_MEASUREMENT_V1_2026-07-22.md`
- `docs/NAV_V2_PRODUCTION_SCALE_FK_BENCHMARK_PLAN_V1_2026-07-22.md`
- `docs/NAV_V2_INDEX_OBSERVATION_WINDOW_V1_2026-07-22.md`
- `docs/NAV_V2_INDEX_CAPACITY_INPUT_DECISION_V1_2026-07-22.md`

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
3. повторять aggregate-only production preflight без PII только как отдельный snapshot, не выбирая cadence автоматически;
4. подготовить offline delta evaluator для observation captures без запуска новых production queries;
5. фиксировать Navigator migration, Advisor, index/RLS или Edge drift;
6. анализировать Auth/Edge/API logs без settings changes, tokens и PII;
7. расширять browser recovery tests без real accounts;
8. не заполнять capacity form без явного owner decision;
9. не reconciliate `leader_*` migrations;
10. не выполнять cost confirmation заранее;
11. не создавать Supabase branch, accounts, secrets или cloud resources.

Новый cloud deployment slice отсутствует.

## Команда для отдельного gated решения

Для authenticated preview E2E владелец должен явно разрешить одновременно:

`authenticated_e2e_only`, fresh branch cost, отдельный cost confirmation, disposable preview branch максимум на 6 часов, synthetic technical accounts и automatic cleanup.

Для production-scale FK benchmark отдельное решение должно дополнительно включать:

- заполненную и утверждённую capacity-input form;
- selected environment;
- approved scale/distribution/concurrency/runtime;
- approved observation cadence/thresholds;
- отдельное benchmark execution authorization;
- fresh cost confirmation, если выбран preview branch.

Без такой формулировки cloud execution запрещено.
