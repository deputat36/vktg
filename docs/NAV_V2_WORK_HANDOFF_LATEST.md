# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 23 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- Последний функциональный `main`: `18a8d61d7ef1af16f3b23a23e294140cb2b41669` — squash merge PR #483.
- Shared frontend build: `20260723-01`.
- Public GitHub Pages: `https://deputat36.github.io/vktg/`.
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
- PR #482 закрыт без merge из-за зафиксированного GitHub head на промежуточном commit.
- PR #483 содержит полный финальный public-build attestation slice и слит.

PR #457–#483 не меняли production data/schema/indexes, Auth settings, RLS, grants или Edge.

Не изменять, не откатывать и не reconciliate `leader_*`.

## Назначение Navigator

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

## Repository-only evidence chain

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

## Index/capacity status

### PR #457 — observation baseline

- Read-only capture: `2026-07-22T05:31:47.591346+00:00`.
- Epoch: DB OID `5`, postmaster `2026-06-13T20:56:45.579218+00:00`, WAL reset `2026-06-13T20:56:11.777190+00:00`, table OID `19392`, composite index OID `19402`, single index OID `19583`.
- Capture count `1`; required at least `2`; cadence/thresholds `null`; representative workload unproven.
- Decision: `observation_window_baseline_started_evidence_not_yet_representative`.

### PR #458/#470 — capacity form/evaluator

- Все 15 canonical required values остаются `null`.
- Form `unsubmitted`; owner/release approvals `false`; execution flags `false`.
- Offline evaluator проверяет только локальную заполненную копию и не авторизует execution.
- Decision: `capacity_submission_evaluator_prepared_offline_canonical_form_unsubmitted`.

### PR #460 — offline index delta evaluator

- Проверяет две локальные JSON snapshots: epoch, OIDs, definitions, valid/ready state, monotonic counters, privacy markers и signed deltas.
- Decisions: `delta_valid_same_epoch_evidence_not_representative`; `observation_window_invalidated_restart_capture_required`.
- Второй capture без явного выбора cadence/thresholds не выполнять.

## Auth recovery evidence

### PR #462 — redacted live Auth attestation

- Две обезличенные последовательности `RPC 401 → refresh 200 → retry 200`.
- Fresh sample без нового `refresh_token_not_found`.
- Unauthenticated callable RPC → `401`; private/internal helper through Data API → `404`.
- Raw logs, identities, email, IP, tokens, request IDs, headers, payloads и business rows не коммитились.
- Decision: `live_auth_refresh_recovery_observed_redacted_not_authenticated_role_e2e`.

### PR #464/#466/#469/#472/#474/#476

Offline покрыты:

- concurrent refresh fan-in и один refresh на несколько 401;
- invalid refresh без RPC retry;
- no-Web-Locks fan-in;
- transient network recovery;
- Web Locks acquisition reject;
- refresh timeout/AbortError;
- post-refresh 401/403 без второго refresh-loop;
- malformed session/profile storage;
- same-user/different-user sign-in против delayed refresh;
- failed sign-in без resurrection;
- logout во время pending refresh;
- logout endpoint failure с local cleanup;
- storage read `SecurityError`;
- password-reset success/network/timeout/429 paths.

## Auth storage write hardening — PR #478–#480

### PR #478

Подтверждены пять source-level gaps:

- remembered-email write мог прервать invalid-session cleanup;
- session remove failure мог прервать logout cleanup;
- profile-cache write failure мог сломать успешный RPC;
- convenience-email write мог изменить outcome password reset;
- session persistence failure возвращал raw browser error.

Decision: `auth_storage_write_failures_confirmed_repository_only_runtime_hardening_planned`.

### PR #479

Добавлен detached helper `assets/js/nav-v2/auth-storage-guard-v2.js` с fail-closed reads, tombstone, remove/null fallback, best-effort cache/email и `NAV_AUTH_STORAGE_UNAVAILABLE`.

Decision: `auth_storage_write_hardening_helper_prepared_offline_not_integrated`.

### PR #480

- Merge: `6dd1593e96a2fd899d0caf58dc5bf3e61e68907d`.
- Helper интегрирован в `assets/js/nav-v2/supabase-v2.js`.
- Shared build: `20260711-01 → 20260723-01`.
- Обновлены все 35 root `*-v2.html` scoped importmaps и diagnostic cache-bust.
- Missing storage objects обрабатываются fail-closed.
- Session persistence failure нормализуется как `NAV_AUTH_STORAGE_UNAVAILABLE`.
- RPC не retry, если refreshed session невозможно сохранить.
- Optional profile/email storage не меняют успешный business/Auth outcome.

Первая boolean-tombstone реализация была отклонена existing CI. Финальная fingerprint tombstone блокирует только конкретное stale value, а replacement session другой вкладки снимает block без reload.

Decision до public attestation:

`auth_storage_write_failures_fixed_in_source_build_rollout_prepared_not_live_verified`

## Public build attestation — PR #483

PR #482 был закрыт без merge: GitHub PR head остался на первом evidence commit. Финальный PR #483 создан из exact SHA и слит.

Первичный live run `29989423379` на evidence commit `300e3f221ae9e755a6390ccea846121e358190a2` подтвердил:

- public base URL `https://deputat36.github.io/vktg/`;
- canonical build `20260723-01`;
- repository importmap pages `35`;
- live matched pages `35/35`;
- по три expected mapping на каждой странице;
- diagnostic page/module matched;
- `supabase-v2.js` live/repository SHA-256 `febb71791013d24a0d9dc1296cb84f586848b93ba2bf603119a4bc6c247ce9a2`;
- `auth-storage-guard-v2.js` live/repository SHA-256 `4384686ca4782603d4e307686d88f0e21922d66b92ebd59e10ff67d040d27a10`;
- artifact ID `8556415410`;
- artifact digest `sha256:d68cf8bd64011c62c951b3c39dd475d0d6a4df10ea7c3a3aa47e45c74335bcbb`.

Final-head CI `6c0809b7d2e1555dd74666199a2fce8f68115352`:

- public contract/offline/live attestation `29989797977` — success;
- static checks 49/49 `29989797964` — success;
- review threads — none.

Decision:

`public_build_20260723_01_attested_read_only_via_github_pages_ci`

Теперь подтверждено:

- `runtime_hardening_completed=true`;
- `build_bump_completed=true`;
- `live_public_build_verified=true`;
- `runtime_rollout_completed=true`.

Не подтверждено:

- `authenticated_role_e2e_completed=false`;
- `live_browser_storage_failure_verified=false`.

Public attestation доказывает публикацию source/build, но не воспроизведение реальных `QuotaExceededError`/`SecurityError` и не authenticated role behavior.

Scheduled workflow:

- `.github/workflows/nav-v2-public-build-attestation-v1.yml`;
- ежедневный read-only запуск;
- public HTML/JS only;
- no credentials, no authenticated requests, no production mutations;
- JSON evidence artifact хранится 14 дней.

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

### Public build

- `config/nav-v2-build.json`
- `config/nav-v2-public-build-attestation-v1.json`
- `scripts/attest_nav_v2_public_build_v1.py`
- `scripts/check_nav_v2_public_build_attestation_v1.py`
- `tests/unit/test_nav_v2_public_build_attestation_v1.py`
- `.github/workflows/nav-v2-public-build-attestation-v1.yml`
- `docs/NAV_V2_PUBLIC_BUILD_ATTESTATION_V1_2026-07-23.md`

### Auth

- `config/nav-v2-auth-recovery-live-attestation-v1.json`
- `config/nav-v2-auth-concurrent-refresh-tests-v1.json`
- `config/nav-v2-auth-network-no-lock-tests-v1.json`
- `config/nav-v2-auth-lock-timeout-post-refresh-tests-v1.json`
- `config/nav-v2-auth-storage-signin-race-tests-v1.json`
- `config/nav-v2-auth-logout-storage-failure-tests-v1.json`
- `config/nav-v2-auth-password-reset-tests-v1.json`
- `config/nav-v2-auth-storage-write-gap-v1.json`
- `config/nav-v2-auth-storage-guard-helper-v1.json`
- `config/nav-v2-auth-recovery-summary-evaluator-v1.json`
- `assets/js/nav-v2/supabase-v2.js`
- `assets/js/nav-v2/auth-session-recovery-v2.js`
- `assets/js/nav-v2/auth-storage-guard-v2.js`
- `tests/unit/nav-v2-auth-*.test.mjs`
- `scripts/check_nav_v2_auth_*.py`
- `scripts/evaluate_nav_v2_auth_recovery_summary_v1.py`
- `docs/NAV_V2_AUTH_STORAGE_RUNTIME_INTEGRATION_V1_2026-07-23.md`

### Index

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

### Preview

- `config/nav-v2-preview-candidate-package-v3.json`
- `config/nav-v2-preview-execution-runbook-v1.json`
- `config/nav-v2-preview-technical-account-lifecycle-v1.json`
- `config/nav-v2-combined-preview-lifecycle-v1.json`
- `scripts/run-nav-v2-combined-preview-lifecycle-v1.sh`

## Следующий безопасный slice

Только бесплатные read-only/repository actions:

1. контролировать scheduled public-build attestation и не путать Pages drift с authenticated E2E;
2. проверять GitHub CI/review drift;
3. проверять Supabase project/migration/Edge/Advisor/Auth drift без settings changes;
4. расширять offline Auth coverage только для ещё не доказанных deterministic edge cases;
5. использовать redacted Auth evaluator только на заранее обезличенных summaries, не на raw logs;
6. поддерживать offline capacity evaluator, не заполняя canonical form;
7. повторять aggregate-only index snapshot только после отдельного явного выбора cadence/thresholds;
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
