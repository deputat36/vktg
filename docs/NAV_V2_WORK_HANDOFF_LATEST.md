# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 22 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- `main`: `0aa69972d453da00182d39a443ec36845f05ca10` — squash merge PR #462.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Organization: `Lider`, plan `free`.
- Project: `ACTIVE_HEALTHY`, region `eu-west-1`.
- PostgreSQL production: `17.6.1.121`.
- Последняя Navigator migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Последняя общая migration: `20260721122333_revoke_anon_execute_leader_internal_rpcs` — относится к `leader_*`.
- Edge `nav-v2-deal-api`: v4, `ACTIVE`, `verify_jwt=true`.
- Edge SHA-256: `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.
- Preview branches отсутствуют.
- Technical `nav-e2e` users/profiles отсутствуют.
- Открытых Navigator PR после merge PR #462 нет.

PR #457–#462 не меняли production data/schema/indexes, Auth settings, RLS, grants или Edge.

Не изменять, не откатывать и не reconciliate `leader_*`.

## Назначение продукта

Navigator — единая заявка на подготовку сделки и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`потребность → факты → маршрутизация → документы/условия → решение профильной роли → выполнение → evidence → подтверждение готовности → задаток/сделка → закрытие`

Navigator не является основной CRM, файловым архивом, банковской CRM, автоматическим юристом или системой оценки сотрудников по сырым counters.

Автоматически создаваемый пункт должен иметь:

`trigger → owner → deadline → action → evidence → outcome → confirmation → gate impact`

## Действующий production runtime

Создание сделки:

- `spn-v2.html`;
- `assets/js/nav-v2/spn-smart-v4.js`;
- legacy RPC `public.nav_v2_save_wizard_result(jsonb)`;
- legacy server implementation и quality function;
- duplicate/idempotency/recovery guards.

Task actions:

- `assets/js/nav-v2/task-action-guard-v2.js`;
- legacy RPC `public.nav_v2_update_task_status(uuid, nav_v2_task_status)`;
- deployed Edge facade v4.

Новый intake, bounded contracts, actor-aware routes и preview packages остаются repository-only.

## Production baseline

Исторический business-count snapshot:

- 23 сделки;
- 24 участника;
- 198 документов;
- 53 риска;
- 98 задач;
- 122 события.

Не использовать эти counts для cleanup или оценки сотрудников.

Candidate indexes:

- `nav_user_profiles_role_idx (role)` — решение `retain`;
- `nav_deal_answers_v2_deal_idx (deal_id)` — `review_possible_redundancy_only`;
- unique `nav_deal_answers_v2_deal_id_question_key_key (deal_id, question_key)`.

FK:

- `nav_deal_answers_v2.deal_id → nav_deals_v2.id`;
- `ON DELETE CASCADE`;
- `ON UPDATE NO ACTION`;
- validated, non-deferrable, initially immediate.

`idx_scan=0` не является drop approval.

## Repository-only evidence chain

### Intake, privacy и preview lifecycle — PR #394–#434

Подготовлены:

- трёхэтапный intake;
- versioned facts/evidence/rules/documents/decisions;
- legal passport и side-aware work plan;
- server recomputation;
- privacy allowlist;
- actor identity и private request ledger;
- replay protection и atomic rollback;
- production-like 25-rule mapping;
- consolidated bounded apply/assert/rollback;
- minimal grants;
- disabled Edge candidate;
- technical-account lifecycle;
- Auth E2E readiness package.

Structural coverage: `25 supported / 0 unsupported`. Это repository coverage, не production readiness.

Cleanup:

- direct identifiers исключены из нового quality contract;
- legacy quality rows классифицированы;
- zero-write planner доказан;
- `selected_cleanup_option=null`;
- production cleanup не выполнялся.

Preview execution flags остаются false:

- `selected_deployment_option=null`;
- `explicit_owner_cost_approval=false`;
- `cost_confirmation_id=null`;
- `branch_creation_allowed=false`.

Историческую branch price нельзя использовать как fresh cost.

### Advisor и query-plan evidence — PR #436/#438/#440

- 50 curated external RPC;
- 48 expected callable `SECURITY DEFINER` warnings;
- 2 `SECURITY INVOKER` exceptions;
- Navigator tables `11`;
- indexes `53`;
- FK with covering index `29/29`;
- RLS policies `32`;
- SELECT-wrapped Auth `32/32`;
- direct per-row Auth calls `0`.

Callable functions нельзя автоматически переводить на другой security model.

`auth_leaked_password_protection` остаётся отдельным gated решением.

Synthetic query-plan evidence:

- `120000` profiles;
- `5000` deals;
- `100000` answers;
- JSON plans;
- synthetic index removal;
- hash equivalence;
- full rollback.

### Browser Auth recovery — PR #442/#444

Действующий runtime покрывает:

- invalid/not-found/already-used refresh loop stop;
- cache clear once;
- valid refresh retry once;
- Web Lock `navigator-v2-auth-refresh`;
- session re-read after lock;
- new-session и logout race protection;
- fallback без Web Locks.

Authenticated browser smoke остаётся gated без preview secrets и technical accounts.

### FK/query/index evidence — PR #445/#449/#451

PostgreSQL 17 synthetic FK harness проверяет:

- `DELETE CASCADE`;
- successful unreferenced update;
- referenced update rejection `23503`;
- transaction-local scan attribution;
- composite-prefix behavior после synthetic single-index removal;
- `EXPLAIN ANALYZE, BUFFERS, WAL, FORMAT JSON`;
- sizes, final counts и rollback.

Decision:

`synthetic_fk_parent_mutation_gap_hardened_production_drop_not_ready`

Exact query mapping:

- `nav_user_profiles_role_idx` — retain;
- direct runtime role-first consumers ограничены;
- `nav_deal_answers_v2_deal_idx` direct RPC read consumer — legacy demo cleanup;
- demo seed — insert-only;
- internal FK lookup учитывается отдельно;
- business rows и PII не использовались.

### Synthetic write/storage measurement — PR #453

PostgreSQL 17 сравнил single+composite и composite-only:

- insert `100000`;
- indexed update `10000`;
- delete `10000`;
- final `90000`;
- JSON plans, BUFFERS/WAL, relation sizes, deterministic hash, rollback.

Synthetic observations:

- extra insert WAL `+7123512` bytes, около `+21.8%`;
- extra indexed-update WAL `+712288` bytes, около `+17.6%`;
- delete WAL delta `0`;
- extra index storage `1024000–1130496` bytes;
- около `+18.7–18.8%` candidate-index storage;
- около `+5%` total relation size.

Это CI workload, не production forecast или DDL approval.

Decision:

`synthetic_write_storage_measurement_completed_production_drop_not_ready`

### Production-scale benchmark plan — PR #455

Fail-closed protocol подготовлен, benchmark не выполнялся.

State:

- `benchmark_execution_authorized=false`;
- `cloud_execution_allowed=false`;
- `production_dml_authorized=false`;
- `production_ddl_authorized=false`;
- `selected_environment=null`;
- branch/cost/accounts отсутствуют.

Allowed future environments:

1. owner/cost-approved disposable Supabase preview branch;
2. isolated ephemeral PostgreSQL 17.

Production DB, copied production rows, real accounts и direct identifiers запрещены.

Future matrix включает zero/one/median/p95/max-bounded child deletes, successful update, rejected `23503` update и mixed batch.

Protocol: 5 warmups, 20 measured iterations, randomized order, deterministic dataset, JSON plans, WAL/BUFFERS, locks/timeouts/deadlocks, sizes/hashes и cleanup evidence.

Decision:

`production_scale_fk_benchmark_protocol_prepared_execution_blocked`

## Срезы PR #457–#462

### Observation baseline — PR #457

Merge: `ec73826983207241f1e1d87ff6697757fdacee17`.

Read-only baseline captured at `2026-07-22T05:31:47.591346+00:00`.

Без business rows, PII, query text, DML, DDL, settings changes или statistics reset.

Epoch:

- DB OID `5`;
- postmaster start `2026-06-13T20:56:45.579218+00:00`;
- database `stats_reset=null`;
- WAL reset `2026-06-13T20:56:11.777190+00:00`;
- table OID `19392`;
- composite index OID `19402`;
- single index OID `19583`.

Window:

- capture count `1`;
- minimum captures `2`;
- `selected_cadence=null`;
- completion thresholds `null`;
- representative workload unproven.

Decision:

`observation_window_baseline_started_evidence_not_yet_representative`

### Capacity-input form — PR #458

Merge: `7bc8643026243bf838b1f811d811e672a557fd2a`.

15 required inputs подготовлены и остаются `null`:

- environment;
- scale source;
- target deals/answers;
- p50/p95/max distribution;
- concurrency/headroom;
- compute/runtime;
- observation cadence;
- minimum days/sessions/index reads/table writes/parent mutations.

Form:

- `status=unsubmitted`;
- owner/release approval false;
- values cannot be guessed;
- form alone cannot authorize execution.

Decision:

`capacity_input_decision_form_prepared_unsubmitted_execution_blocked`

### Offline observation delta evaluator — PR #460

Merge: `7f621d52c1330d44f13efc29263078ba167c4168`.

Reads two local JSON snapshots only. No network, Supabase or SQL connection.

Checks:

- DB/postmaster/reset epoch;
- table/index OIDs and definitions;
- uniqueness and valid/ready state;
- monotonic DB/WAL/table/index counters;
- privacy/read-only markers;
- signed size deltas.

Valid result:

`delta_valid_same_epoch_evidence_not_representative`

Invalid result:

`observation_window_invalidated_restart_capture_required`

Self-test covers 11 cases.

### Redacted live Auth recovery attestation — PR #462

Merge: `0aa69972d453da00182d39a443ec36845f05ca10`.

Read-only Supabase Auth/API/Postgres logs показали две обезличенные последовательности:

`RPC 401 → refresh 200 → повторный RPC 200`

Fresh Auth sample не содержит нового `refresh_token_not_found`.

Unauthenticated smoke подтвердил:

- authenticated callable RPC без session → `401` / `permission denied`;
- internal/private helper через Data API → `404`;
- unexpected unauthenticated success не наблюдался.

Raw logs, identities, email, IP, tokens, request IDs, headers, payloads и business rows не коммитились.

Attestation связана с:

- `assets/js/nav-v2/auth-session-recovery-v2.js`;
- `tests/unit/nav-v2-auth-session-recovery.test.mjs`.

CI:

- attestation contract + Auth recovery unit suite: `29947064494` — success;
- Navigator static 49/49: `29947063145` — success.

Decision:

`live_auth_refresh_recovery_observed_redacted_not_authenticated_role_e2e`

Не доказаны:

- authenticated role matrix;
- desktop/mobile visual E2E;
- browser internal state и real multi-tab race;
- готовность leaked-password protection;
- preview branch approval.

## Gates

### Preview/Auth E2E

Generic `продолжай`, `работай по плану`, `действуй автономно` не являются approval.

Cloud шаг требует отдельного решения владельца:

- `authenticated_e2e_only`;
- fresh branch cost;
- показ amount/currency/recurrence;
- explicit cost approval;
- `confirm_cost` и confirmation ID;
- disposable branch ≤6 часов;
- automatic delete deadline;
- synthetic technical accounts only;
- no production data/real employees;
- cleanup evidence.

### Production index/DDL

Для `nav_deal_answers_v2_deal_idx` всё ещё отсутствуют:

- approved observation cadence;
- approved completion thresholds;
- second approved capture в том же epoch;
- representative authenticated workload;
- submitted/approved capacity form;
- benchmark execution authorization;
- выполненный production-scale benchmark в разрешённой среде;
- production `EXPLAIN ANALYZE` на approved non-PII fixtures;
- production write/storage evidence;
- authenticated regression;
- exact forward/rollback migration;
- separate owner DDL approval.

Индекс остаётся `review_possible_redundancy_only`.

## Канонические артефакты

Index evidence:

- `config/nav-v2-performance-advisor-attestation-v1.json`
- `config/nav-v2-index-query-plan-candidate-v1.json`
- `config/nav-v2-index-fk-parent-mutation-evidence-v1.json`
- `config/nav-v2-query-to-index-mapping-v1.json`
- `config/nav-v2-index-write-storage-measurement-v1.json`
- `config/nav-v2-production-scale-fk-benchmark-plan-v1.json`
- `config/nav-v2-index-observation-window-v1.json`
- `config/nav-v2-index-capacity-input-decision-v1.json`
- `config/nav-v2-index-observation-delta-evaluator-v1.json`

Auth evidence:

- `config/nav-v2-auth-recovery-live-attestation-v1.json`
- `assets/js/nav-v2/auth-session-recovery-v2.js`
- `tests/unit/nav-v2-auth-session-recovery.test.mjs`
- `scripts/check_nav_v2_auth_recovery_live_attestation_v1.py`
- `.github/workflows/nav-v2-auth-recovery-live-attestation-v1.yml`

Preview/lifecycle:

- `config/nav-v2-preview-candidate-package-v3.json`
- `config/nav-v2-preview-execution-runbook-v1.json`
- `config/nav-v2-preview-technical-account-lifecycle-v1.json`
- `config/nav-v2-combined-preview-lifecycle-v1.json`
- `scripts/run-nav-v2-combined-preview-lifecycle-v1.sh`

## Следующий безопасный slice

Только бесплатные read-only/repository actions:

1. проверять GitHub CI/review drift;
2. проверять Supabase project/migration/Edge/Advisor/Auth drift без settings changes;
3. расширять redacted Auth log attestation/report validation без raw logs;
4. расширять browser recovery unit tests без real accounts;
5. повторять aggregate-only index snapshot только отдельным явным действием, не выбирая cadence автоматически;
6. использовать offline delta evaluator после второго approved snapshot;
7. поддерживать package v3 и handoff;
8. не заполнять capacity form без owner decision;
9. не вызывать cost confirmation;
10. не создавать branch/accounts/secrets;
11. не менять production DDL/DML/RLS/Auth/Edge;
12. не трогать `leader_*`.

Новый cloud deployment slice отсутствует.

## Отдельное gated решение

Authenticated preview E2E требует явной формулировки с fresh cost, cost confirmation, disposable branch, synthetic accounts и cleanup.

Production-scale benchmark дополнительно требует:

- submitted and approved capacity form;
- selected environment;
- approved scale/distribution/concurrency/runtime;
- approved observation cadence/thresholds;
- separate benchmark execution authorization;
- fresh cost confirmation, если выбран preview.

Без этого cloud execution запрещено.
