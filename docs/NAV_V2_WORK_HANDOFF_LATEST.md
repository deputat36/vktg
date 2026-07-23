# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 23 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- Последний подтверждённый `main`: `251044106437224480295688ac7954950fc44055` — squash merge PR #487.
- Рабочий PR: #488 — shared-project aware release drift gate.
- Shared frontend build: `20260723-02`.
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

Не изменять, не откатывать и не reconciliate `leader_*`.

## Назначение Navigator

Navigator — единая заявка на подготовку сделки и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`потребность → факты → маршрутизация → документы/условия → решение профильной роли → выполнение → evidence → готовность → задаток/сделка → закрытие`

Navigator не является основной CRM, файловым архивом, банковской CRM, автоматическим юристом или системой оценки сотрудников по сырым counters.

Автоматически создаваемый пункт должен иметь:

`trigger → owner → deadline → action → evidence → outcome → confirmation → gate impact`

## Production runtime

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

## Supabase baseline

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
- unique `(deal_id, question_key)` остаётся.

`idx_scan=0` не является drop approval.

## Auth storage hardening

PR #478 подтвердил storage write gaps.

PR #479 добавил helper `assets/js/nav-v2/auth-storage-guard-v2.js`.

PR #480 интегрировал helper в shared runtime:

- fail-closed reads;
- fingerprint tombstone;
- remove/null fallback;
- best-effort profile/email cache;
- `NAV_AUTH_STORAGE_UNAVAILABLE`;
- запрет RPC retry, если refreshed session нельзя сохранить.

Build `20260723-02` сохранил эти guarantees. Consolidated rollout gate и integrated Auth storage workflow повторно подтвердили session recovery, concurrent/no-lock/timeout, sign-in races, logout, password reset, missing-storage, fingerprint и write regressions.

## Исправление shared module cache-bust — PR #486

Первый browser run `30017592617` показал:

- guest login gate работал;
- `data-nav-v2-build=20260723-01` выставлялся;
- storage guard загружался с query version;
- shared `supabase-v2.js` загружался без query version.

Причина: короткие scoped importmap keys не совпадали с нормализованным relative module URL.

Исправление build `20260723-02`:

- обновлены все 35 root importmap pages;
- сохранены три compatibility mappings;
- добавлены три normalized mappings;
- все шесть mappings ведут на `supabase-v2.js?v=20260723-02`;
- обновлены shared build marker, guard query и diagnostic query;
- добавлен generator `scripts/bump_nav_v2_shared_build.py`;
- добавлен permanent shared runtime rollout gate;
- Auth storage contracts следуют canonical build динамически.

PR #486 merge:

`ecda0aeacd48845194b28c7d7e8d50ef068b4724`

Pre-merge evidence:

- local browser 10/10 — run `30021299357`;
- static 49/49 — run `30022025090`;
- consolidated rollout/Auth gate — run `30022024688`;
- integrated Auth storage guard — run `30022024779`;
- public contract/offline — run `30021302076`;
- handoff consistency — run `30021301806`;
- JavaScript syntax — run `30021299430`;
- guest desktop/mobile smoke — run `30021299987`;
- authenticated smoke skipped существующим gate.

## Public source/hash evidence — build 20260723-02

Решение:

`public_build_20260723_02_attested_read_only_via_github_pages_ci`

Evidence:

- run `30023416439`;
- evidence commit `41f9056d1021fd9a84ac3adf140b0877599e699b`;
- observed at `2026-07-23T16:04:44.867398+00:00`;
- build `20260723-02`;
- public pages `35/35`;
- diagnostic matched;
- artifact `8570253047`;
- artifact digest `sha256:24e71a7e91f394fbb70813cc5ae395dc5c7eb2fcee18aca019d57bf088c4cb5e`;
- shared runtime SHA-256 `f2713e29d1a84e27a4a290af99695211c5c2d4c9ed6df21c36fecf2a9b23ecd8`;
- storage guard SHA-256 `4384686ca4782603d4e307686d88f0e21922d66b92ebd59e10ff67d040d27a10`.

Теперь:

- `live_public_build_verified=true`;
- `runtime_rollout_completed=true`.

## Live browser runtime evidence

Решение:

`live_public_browser_runtime_20260723_02_verified_read_only`

Run `30023416439` подтвердил:

- desktop cases `5/5`;
- mobile cases `5/5`;
- exact `data-nav-v2-build=20260723-02`;
- exact `supabase-v2.js?v=20260723-02`;
- exact `auth-storage-guard-v2.js?v=20260723-02`;
- guest login gate;
- unexpected `0`;
- flaky `0`;
- `pageerror` и `console.error` отсутствуют.

Первый post-merge run `30022851155` выявил test-harness 404: абсолютные paths сбрасывали GitHub Pages subpath `/vktg/`. Commit `41f9056d1021fd9a84ac3adf140b0877599e699b` исправил resolution внутри configured base directory. Runtime code не менялся.

Сохранённые gates:

- `authenticated_role_e2e_completed=false`;
- `live_browser_storage_failure_verified=false`.

Public browser evidence не воспроизводит реальные `QuotaExceededError` или `SecurityError`.

## Historical public evidence — build 20260723-01

Предыдущее evidence сохранено:

- decision `public_build_20260723_01_attested_read_only_via_github_pages_ci`;
- run `29989423379`;
- commit `300e3f221ae9e755a6390ccea846121e358190a2`;
- pages `35/35`;
- artifact `8556415410`.

## Shared-project release drift — PR #488

Read-only Supabase inspection подтвердил одновременно:

- latest Navigator migration `20260716063401_nav_v2_correct_mortgage_broker_scope`;
- latest overall migration `20260721122333_revoke_anon_execute_leader_internal_rpcs`;
- production содержит более новые `leader_*` migrations без изменения Navigator runtime;
- `nav-v2-deal-api` v4 ACTIVE, `verify_jwt=true`, hash unchanged;
- preview branch отсутствует.

Старый release drift gate требовал, чтобы Navigator baseline был глобально последней migration общего project. Это создавало ложный drift после законных более новых `leader_*` migrations.

PR #488 вводит семантику:

`required_present_not_global_latest`

Подготовлено:

- baseline Navigator продвинут до live `20260716063401`;
- exact alias live `20260716063401` → canonical `20260716064500`;
- canonical SQL blob `93687e0aed8d88d604e31a730ba8c9f8c806b94e`;
- `config/nav-v2-release-drift-shared-project-v1.json`;
- `scripts/check_nav_v2_release_drift_shared_project.py`;
- dedicated unit/self-tests;
- PR CI в `.github/workflows/nav-v2-release-alias-static.yml`;
- read-only production workflow переключён на shared-project evaluator.

Сохраняются блокирующие условия:

- approved Navigator migration отсутствует в remote history;
- unknown remote-only migration;
- unapproved repository-only migration;
- Edge version/status/JWT/hash/source drift;
- незарегистрированная Navigator Edge Function.

Решение после зелёного CI:

`shared_project_release_drift_false_positive_removed_repository_only`

Production DDL/DML/Auth/Edge и `leader_*` не изменялись.

## Index/capacity status

Observation baseline:

- capture `2026-07-22T05:31:47.591346+00:00`;
- capture count `1`;
- required минимум `2`;
- cadence/thresholds `null`;
- representative workload не доказан.

Capacity form:

- 15 required values остаются `null`;
- form `unsubmitted`;
- approvals `false`;
- execution flags `false`.

Второй snapshot без отдельного выбора cadence/thresholds не выполнять.

Индекс `nav_deal_answers_v2_deal_idx` остаётся `review_possible_redundancy_only`.

## Active gates

### Preview/Auth E2E

Generic `продолжай`, `работай по плану`, `действуй автономно` не являются approval.

Cloud шаг требует отдельного решения владельца:

- `authenticated_e2e_only`;
- fresh branch cost;
- amount/currency/recurrence;
- explicit cost approval;
- `confirm_cost` ID;
- disposable branch ≤6 часов;
- synthetic technical accounts only;
- no production data/real employees;
- cleanup evidence.

### Production index/DDL

Требуются approved observation cadence/thresholds, второй capture, representative authenticated workload, submitted capacity form, benchmark authorization, permitted environment, production-scale evidence, exact migration/rollback и отдельное DDL approval.

Успешная offline validation формы не является execution authorization.

Без этих решений cloud execution запрещено.

## Канонические артефакты

Public/build:

- `config/nav-v2-build.json`;
- `config/nav-v2-public-build-attestation-v1.json`;
- `config/nav-v2-live-public-browser-runtime-v1.json`;
- `config/nav-v2-post-merge-live-evidence-v1.json`;
- `scripts/bump_nav_v2_shared_build.py`;
- `scripts/check_nav_v2_build_version.py`;
- `scripts/attest_nav_v2_public_build_v1.py`;
- `scripts/check_nav_v2_live_public_browser_runtime_v1.py`;
- `tests/e2e/live-public-runtime.spec.js`;
- `.github/workflows/nav-v2-public-build-attestation-v1.yml`;
- `.github/workflows/nav-v2-live-public-browser-runtime-v1.yml`;
- `.github/workflows/nav-v2-post-merge-live-evidence-v1.yml`;
- `.github/workflows/nav-v2-shared-runtime-rollout-gate-v1.yml`.

Release drift:

- `config/nav-v2-release-baseline.json`;
- `config/nav-v2-release-migration-aliases.json`;
- `config/nav-v2-release-drift-shared-project-v1.json`;
- `scripts/check_nav_v2_release_drift.py`;
- `scripts/check_nav_v2_release_drift_aliases.py`;
- `scripts/check_nav_v2_release_drift_shared_project.py`;
- `scripts/check_nav_v2_release_drift_workflow.py`;
- `tests/unit/test_nav_v2_release_drift_shared_project_v1.py`;
- `.github/workflows/nav-v2-release-alias-static.yml`;
- `.github/workflows/nav-v2-release-drift.yml`.

Auth:

- `assets/js/nav-v2/supabase-v2.js`;
- `assets/js/nav-v2/auth-session-recovery-v2.js`;
- `assets/js/nav-v2/auth-storage-guard-v2.js`;
- Auth unit contracts under `tests/unit/`.

Index:

- `config/nav-v2-index-observation-window-v1.json`;
- `config/nav-v2-index-capacity-input-decision-v1.json`;
- `config/nav-v2-index-capacity-submission-evaluator-v1.json`;
- `config/nav-v2-index-observation-delta-evaluator-v1.json`.

## Следующий безопасный slice

1. завершить PR #488 только на exact green head;
2. проверить migration alias/shared-project unit и workflow contract CI;
3. проверить static и handoff consistency;
4. убедиться, что review threads отсутствуют;
5. merge repository-only slice без production mutations;
6. после merge обновить issues #164 и #177;
7. поддерживать scheduled public source/browser monitoring;
8. не вызывать cost confirmation;
9. не создавать Supabase branch/accounts/secrets;
10. не менять production DDL/DML/RLS/Auth/Edge;
11. не трогать `leader_*`.
