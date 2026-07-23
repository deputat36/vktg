# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 23 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- `main`: `08b2bc7ca061d8e42fcf9cc30fb5dd73d6898557` — squash merge PR #476.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Organization: `Lider`, plan `free`.
- Project: `ACTIVE_HEALTHY`, region `eu-west-1`.
- PostgreSQL: `17.6.1.121`.
- Последняя Navigator migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Последняя общая migration: `20260721122333_revoke_anon_execute_leader_internal_rpcs` — относится к `leader_*`.
- Edge `nav-v2-deal-api`: v4, `ACTIVE`, `verify_jwt=true`.
- Edge SHA-256: `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.
- Preview branches отсутствуют.
- Technical `nav-e2e` users/profiles отсутствуют.
- После merge PR #476 открытых Navigator PR нет.

PR #457–#476 не меняли production data/schema/indexes, Auth settings, RLS, grants или Edge.

Не изменять, не откатывать и не reconciliate `leader_*`.

## Назначение и production runtime

Navigator — единая заявка на подготовку сделки и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`потребность → факты → маршрутизация → документы/условия → решение профильной роли → выполнение → evidence → готовность → задаток/сделка → закрытие`

Navigator не является основной CRM, файловым архивом, банковской CRM, автоматическим юристом или системой оценки сотрудников по сырым counters.

Автоматически создаваемый пункт должен иметь:

`trigger → owner → deadline → action → evidence → outcome → confirmation → gate impact`

Действующее создание сделки:

- `spn-v2.html`;
- `assets/js/nav-v2/spn-smart-v4.js`;
- legacy RPC `public.nav_v2_save_wizard_result(jsonb)`;
- duplicate/idempotency/recovery guards.

Действующие task actions:

- `assets/js/nav-v2/task-action-guard-v2.js`;
- legacy RPC `public.nav_v2_update_task_status(uuid, nav_v2_task_status)`;
- deployed Edge facade v4.

Новый intake, bounded contracts, actor-aware routes и preview packages остаются repository-only.

## Production baseline

Исторический aggregate snapshot:

- 23 сделки;
- 24 участника;
- 198 документов;
- 53 риска;
- 98 задач;
- 122 события.

Counts нельзя использовать для cleanup или оценки сотрудников.

Candidate indexes:

- `nav_user_profiles_role_idx (role)` — `retain`;
- `nav_deal_answers_v2_deal_idx (deal_id)` — `review_possible_redundancy_only`;
- unique `nav_deal_answers_v2_deal_id_question_key_key (deal_id, question_key)`.

FK `nav_deal_answers_v2.deal_id → nav_deals_v2.id`:

- `ON DELETE CASCADE`;
- `ON UPDATE NO ACTION`;
- validated, non-deferrable, initially immediate.

`idx_scan=0` не является drop approval.

## Базовая repository-only evidence chain

### Intake, privacy и preview — PR #394–#434

Подготовлены трёхэтапный intake, versioned facts/evidence/rules/documents/decisions, legal passport, side-aware work plan, server recomputation, privacy allowlist, verified actor context, private ledger, replay protection, rollback, 25-rule mapping, consolidated apply/assert/rollback, minimal grants, disabled Edge candidate, execution runbook и technical-account lifecycle.

Structural coverage: `25 supported / 0 unsupported`. Это не production readiness.

Preview flags:

- `selected_deployment_option=null`;
- `explicit_owner_cost_approval=false`;
- `cost_confirmation_id=null`;
- `branch_creation_allowed=false`.

Историческую branch price нельзя использовать как fresh cost.

### Advisor/query evidence — PR #436/#438/#440

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

### FK/index evidence — PR #445/#449/#451/#453/#455

Подтверждены FK parent-mutation semantics, transaction-local scan attribution, composite-prefix behavior, exact query-to-index mapping без PII, synthetic write/storage comparison и fail-closed production-scale benchmark protocol.

Synthetic observations:

- extra insert WAL около `+21.8%`;
- extra indexed-update WAL около `+17.6%`;
- delete WAL delta `0`;
- extra candidate-index storage около `+18.7–18.8%`;
- total relation delta около `+5%`.

Это synthetic CI workload, не production forecast или DDL approval.

## Последние срезы

### PR #457 — observation baseline

- Merge: `ec73826983207241f1e1d87ff6697757fdacee17`.
- Read-only capture: `2026-07-22T05:31:47.591346+00:00`.
- Epoch: DB OID `5`, postmaster `2026-06-13T20:56:45.579218+00:00`, WAL reset `2026-06-13T20:56:11.777190+00:00`, table OID `19392`, composite index OID `19402`, single index OID `19583`.
- Capture count `1`; required at least `2`; cadence/thresholds `null`; representative workload unproven.
- Decision: `observation_window_baseline_started_evidence_not_yet_representative`.

### PR #458 — capacity-input form

- Merge: `7bc8643026243bf838b1f811d811e672a557fd2a`.
- Все 15 required values `null`; form `unsubmitted`; owner/release approvals `false`; execution flags `false`.
- Decision: `capacity_input_decision_form_prepared_unsubmitted_execution_blocked`.

### PR #460 — offline index delta evaluator

- Merge: `7f621d52c1330d44f13efc29263078ba167c4168`.
- Проверяет две локальные JSON snapshots: epoch, OIDs, definitions, valid/ready state, monotonic counters, privacy markers и signed deltas.
- Decisions: `delta_valid_same_epoch_evidence_not_representative`; `observation_window_invalidated_restart_capture_required`.
- Self-test: 11 cases.

### PR #462 — redacted live Auth attestation

- Merge: `0aa69972d453da00182d39a443ec36845f05ca10`.
- Read-only logs: две обезличенные последовательности `RPC 401 → refresh 200 → retry 200`.
- Fresh sample без нового `refresh_token_not_found`.
- Unauthenticated callable RPC → `401`; private/internal helper through Data API → `404`.
- Raw logs, identities, email, IP, tokens, request IDs, headers, payloads и business rows не коммитились.
- CI: `29947064494`, static `29947063145`.
- Decision: `live_auth_refresh_recovery_observed_redacted_not_authenticated_role_e2e`.

### PR #464 — concurrent refresh fan-in

- Merge: `6579c15c92b9ee5d4082796875b11711d7023db2`.
- `2 RPC 401 → 1 refresh 200 → 2 retry 200`.
- `2 RPC 401 → 1 invalid refresh → 0 retry`.
- Подтверждены one-refresh fan-in, exclusive lock, отсутствие refresh storm и очистка stale session при invalid refresh.
- CI: `29947790090`, static `29947789996`.
- Decision: `concurrent_auth_refresh_fan_in_covered_by_offline_unit_tests`.

### PR #466 — no-Web-Locks/network recovery

- Merge: `9141564a610fd9f5fce8112354b1eb120bb0f11a`.
- Подтверждены module-level fan-in без Web Locks, сохранение session/profile cache при transient network failure, очистка rejected refresh promise и успешная следующая попытка.
- CI: `29951835421`, static `29951835276`.
- Decision: `auth_refresh_no_lock_and_transient_network_recovery_covered_offline`.

### PR #467 — redacted Auth summary evaluator

- Merge: `8dca80c28f56fb5fb4830a3b7b291213dcb06e22`.
- Принимает только заранее обезличенный summary.
- Exit codes: `0` valid, `2` input error, `3` privacy/contract invalid, `4` security regression.
- Fail-closed отклоняет identifiers, tokens, headers, payloads, incomplete sequences и запрещённые E2E/production claims.
- CI: `29952411253`, static `29952411571`.
- Decision: `redacted_auth_summary_evaluator_prepared_offline_no_live_execution`.

### PR #469 — lock/timeout/post-refresh

- Merge: `2d8ae9d88ff45b81456c8c9313a4289aaf1efe68`.
- Покрыты Web Locks acquisition reject, refresh `AbortError`, повторный `401` и `403` после успешного refresh.
- Session/profile cache сохраняются при recoverable failures; второй refresh-loop не запускается.
- CI: `29953965931`, static `29953965858`.
- Decision: `auth_lock_timeout_and_post_refresh_failures_covered_offline`.

### PR #470 — capacity submission evaluator

- Merge: `0b58ada1dbccd51d4904dd26998c416a6a9436c3`.
- Проверяет локальную копию заполненной capacity form: 15 inputs, types, distribution order, timezone-aware timestamps, owner/release approvals, zero-threshold rationale, isolated/preview cost gates и forbidden execution claims.
- Exit codes: `0` structurally valid but separate authorization required; `2` input error; `3` form invalid; `4` environment/cost invalid; `5` forbidden authorization claim.
- Во всех reports: `benchmark_execution_ready=false`, `production_index_removal_ready=false`, `production_ddl_ready=false`.
- Canonical form осталась all-null/unsubmitted.
- CI: `29954902600`, static `29954902524`.
- Decision: `capacity_submission_evaluator_prepared_offline_canonical_form_unsubmitted`.

### PR #472 — malformed storage/sign-in races

- Merge: `9352df68fb9033a8086d650b9d29d9a33f81f1f2`.
- Malformed session/profile JSON → cache readers `null`, `requireUser` stops before network, clean sign-in clears stale cache.
- Same-user и different-user sign-in выигрывают у delayed old refresh.
- Failed sign-in не позволяет old refresh воскресить session.
- CI: `29955633485`, static `29955632495`.
- Decision: `auth_malformed_storage_and_signin_refresh_races_covered_offline`.

### PR #474 — logout/storage read failures

- Merge: `70ead72790ab963adf51cb422be752b3f3844698`.
- Logout во время pending refresh очищает session/profile cache; delayed old refresh не воскрешает session; RPC не retry.
- Transport failure logout endpoint передаётся caller, но local state очищается в `finally`.
- Logout без session не вызывает сеть и чистит stale profile cache.
- Browser storage `SecurityError` трактуется как отсутствие session/profile и protected action stops before network.
- CI: `29979882159`, static `29979882085`.
- Decision: `auth_logout_and_storage_read_failures_covered_offline`.

### PR #476 — password reset paths

- Merge: `08b2bc7ca061d8e42fcf9cc30fb5dd73d6898557`.
- Blank email stops before network.
- Success trims email, calls `/auth/v1/recover`, redirects to `nav-accept-invite-v2.html`, preserves active session/profile and remembers email only after `200`.
- Network failure, 12-second timeout and mocked `429 over_request_rate_limit` preserve session/profile and previous remembered email.
- CI: `29980416449`, static `29980416462`.
- Decision: `auth_password_reset_paths_covered_offline`.

## Active gates

### Preview/Auth E2E

Generic `продолжай`, `работай по плану`, `действуй автономно` не являются approval.

Cloud шаг требует отдельного решения владельца:

- `authenticated_e2e_only`;
- fresh branch cost;
- amount/currency/recurrence shown to owner;
- explicit cost approval;
- `confirm_cost` ID;
- disposable branch ≤6 часов;
- automatic delete deadline;
- synthetic technical accounts only;
- no production data/real employees;
- cleanup evidence.

### Production index/DDL

Для `nav_deal_answers_v2_deal_idx` отсутствуют:

- approved observation cadence;
- approved completion thresholds;
- second approved capture в том же epoch;
- representative authenticated workload;
- submitted/approved capacity form;
- separate benchmark execution authorization;
- production-scale benchmark в разрешённой среде;
- production `EXPLAIN ANALYZE` на approved non-PII fixtures;
- production write/storage evidence;
- authenticated regression;
- exact forward/rollback migration;
- separate owner DDL approval.

Индекс остаётся `review_possible_redundancy_only`.

## Канонические артефакты

Index:

- `config/nav-v2-performance-advisor-attestation-v1.json`
- `config/nav-v2-index-query-plan-candidate-v1.json`
- `config/nav-v2-index-fk-parent-mutation-evidence-v1.json`
- `config/nav-v2-query-to-index-mapping-v1.json`
- `config/nav-v2-index-write-storage-measurement-v1.json`
- `config/nav-v2-production-scale-fk-benchmark-plan-v1.json`
- `config/nav-v2-index-observation-window-v1.json`
- `config/nav-v2-index-capacity-input-decision-v1.json`
- `config/nav-v2-index-capacity-submission-evaluator-v1.json`
- `config/nav-v2-index-observation-delta-evaluator-v1.json`
- `scripts/evaluate_nav_v2_index_capacity_submission_v1.py`
- `scripts/check_nav_v2_index_capacity_submission_evaluator_v1.py`

Auth:

- `config/nav-v2-auth-recovery-live-attestation-v1.json`
- `config/nav-v2-auth-concurrent-refresh-tests-v1.json`
- `config/nav-v2-auth-network-no-lock-tests-v1.json`
- `config/nav-v2-auth-lock-timeout-post-refresh-tests-v1.json`
- `config/nav-v2-auth-storage-signin-race-tests-v1.json`
- `config/nav-v2-auth-logout-storage-failure-tests-v1.json`
- `config/nav-v2-auth-password-reset-tests-v1.json`
- `config/nav-v2-auth-recovery-summary-evaluator-v1.json`
- `assets/js/nav-v2/supabase-v2.js`
- `assets/js/nav-v2/auth-session-recovery-v2.js`
- `tests/unit/nav-v2-auth-session-recovery.test.mjs`
- `tests/unit/nav-v2-auth-concurrent-refresh.test.mjs`
- `tests/unit/nav-v2-auth-network-no-lock.test.mjs`
- `tests/unit/nav-v2-auth-lock-timeout-post-refresh.test.mjs`
- `tests/unit/nav-v2-auth-storage-signin-race.test.mjs`
- `tests/unit/nav-v2-auth-logout-storage-failure.test.mjs`
- `tests/unit/nav-v2-auth-password-reset.test.mjs`
- `scripts/evaluate_nav_v2_auth_recovery_summary_v1.py`
- `scripts/check_nav_v2_auth_recovery_live_attestation_v1.py`
- `scripts/check_nav_v2_auth_concurrent_refresh_tests_v1.py`
- `scripts/check_nav_v2_auth_network_no_lock_tests_v1.py`
- `scripts/check_nav_v2_auth_lock_timeout_post_refresh_tests_v1.py`
- `scripts/check_nav_v2_auth_storage_signin_race_tests_v1.py`
- `scripts/check_nav_v2_auth_logout_storage_failure_tests_v1.py`
- `scripts/check_nav_v2_auth_password_reset_tests_v1.py`
- `scripts/check_nav_v2_auth_recovery_summary_evaluator_v1.py`

Preview:

- `config/nav-v2-preview-candidate-package-v3.json`
- `config/nav-v2-preview-execution-runbook-v1.json`
- `config/nav-v2-preview-technical-account-lifecycle-v1.json`
- `config/nav-v2-combined-preview-lifecycle-v1.json`
- `scripts/run-nav-v2-combined-preview-lifecycle-v1.sh`

## Следующий безопасный slice

Только бесплатные read-only/repository actions:

1. проверять GitHub CI/review drift;
2. проверять Supabase project/migration/Edge/Advisor/Auth drift без settings changes;
3. исследовать browser storage write failures сначала как repository-only gap evidence и build-version plan, без скрытого runtime rollout;
4. расширять offline Auth coverage только для ещё не доказанных deterministic edge cases;
5. использовать redacted Auth evaluator только на заранее обезличенных summaries, не на raw logs;
6. поддерживать offline capacity evaluator, не заполняя canonical form;
7. повторять aggregate-only index snapshot только отдельным явным действием, не выбирая cadence автоматически;
8. использовать offline index delta evaluator только после второго approved snapshot;
9. поддерживать preview package v3 и handoff;
10. не вызывать cost confirmation;
11. не создавать Supabase branch/accounts/secrets;
12. не менять production DDL/DML/RLS/Auth/Edge;
13. не трогать `leader_*`.

Новый cloud deployment slice отсутствует.

## Отдельное gated решение

Authenticated preview E2E требует явной формулировки с fresh cost, separate cost confirmation, disposable branch, synthetic accounts и cleanup.

Production-scale benchmark требует submitted/approved capacity form, selected environment, approved scale/concurrency/runtime/cadence/thresholds и separate execution authorization.

Успешная offline validation формы не является execution authorization.

Без этих решений cloud execution запрещено.
