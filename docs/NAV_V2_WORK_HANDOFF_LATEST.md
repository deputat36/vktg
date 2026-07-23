# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 23 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- Последний подтверждённый `main`: `08b863024a91f0f844b0c3d4a60fc212a6bf44b1` — squash merge PR #485.
- Рабочий PR: #486 — shared module cache-bust correction и public browser runtime attestation.
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

## Production runtime до PR #486

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

PR #479 добавил detached helper `assets/js/nav-v2/auth-storage-guard-v2.js`.

PR #480 интегрировал helper в shared runtime и добавил:

- fail-closed reads;
- fingerprint tombstone;
- remove/null fallback;
- best-effort profile/email cache;
- `NAV_AUTH_STORAGE_UNAVAILABLE`;
- запрет RPC retry, если refreshed session нельзя сохранить.

Offline Auth suites покрывают concurrent refresh, no-lock fallback, timeout, malformed storage, sign-in/refresh races, logout cleanup и password reset paths.

## Historical public build evidence — 20260723-01

Предыдущий build подтверждён решением:

`public_build_20260723_01_attested_read_only_via_github_pages_ci`

Evidence:

- build `20260723-01`;
- run `29989423379`;
- commit `300e3f221ae9e755a6390ccea846121e358190a2`;
- 35/35 Pages matched;
- artifact `8556415410`;
- `supabase-v2.js` SHA-256 `febb71791013d24a0d9dc1296cb84f586848b93ba2bf603119a4bc6c247ce9a2`;
- `auth-storage-guard-v2.js` SHA-256 `4384686ca4782603d4e307686d88f0e21922d66b92ebd59e10ff67d040d27a10`.

Это historical evidence и не подтверждает новый build `20260723-02`.

## PR #486 — обнаруженный cache-bust defect

Первый browser run `30017592617` доказал:

- guest login gate работал;
- `data-nav-v2-build=20260723-01` выставлялся;
- `auth-storage-guard-v2.js?v=20260723-01` загружался;
- `supabase-v2.js` загружался без query version.

Причина: короткие scoped importmap keys нормализовались относительно документа и не совпадали с относительным import URL внутри `assets/js/nav-v2/`.

Тест не был ослаблен. Подготовлен atomic build `20260723-02`:

- все 35 importmap pages обновлены;
- добавлены normalized keys;
- шесть mappings на странице ведут на `supabase-v2.js?v=20260723-02`;
- shared build marker обновлён;
- storage guard query обновлён;
- diagnostic query обновлён;
- добавлен генератор `scripts/bump_nav_v2_shared_build.py`;
- добавлен browser contract `config/nav-v2-live-public-browser-runtime-v1.json`;
- добавлен public build contract `config/nav-v2-public-build-attestation-v1.json`;
- добавлен local/post-merge workflow `.github/workflows/nav-v2-live-public-browser-runtime-v1.yml`.

## Активный public rollout status

Текущее решение public source/hash contract:

`public_build_attestation_contract_prepared_requires_successful_live_ci`

Текущее решение browser runtime contract:

`live_public_browser_runtime_contract_prepared_requires_successful_ci`

До merge и успешного post-merge Pages job:

- `live_public_build_verified=false`;
- `runtime_rollout_completed=false`;
- `authenticated_role_e2e_completed=false`;
- `live_browser_storage_failure_verified=false`.

Local PR browser evidence может подтвердить checkout build, но не deployed GitHub Pages.

После merge обязательны:

1. source/hash attestation build `20260723-02`;
2. 35/35 live importmap pages;
3. live SHA-256 shared runtime и guard;
4. desktop/mobile browser Resource Timing для двух exact versioned assets;
5. guest login gate;
6. отсутствие `pageerror` и `console.error`;
7. evidence artifact;
8. отдельное обновление contracts и handoff фактическими run/commit/hash.

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
- `scripts/bump_nav_v2_shared_build.py`;
- `scripts/check_nav_v2_build_version.py`;
- `scripts/attest_nav_v2_public_build_v1.py`;
- `scripts/check_nav_v2_live_public_browser_runtime_v1.py`;
- `tests/e2e/live-public-runtime.spec.js`;
- `.github/workflows/nav-v2-public-build-attestation-v1.yml`;
- `.github/workflows/nav-v2-live-public-browser-runtime-v1.yml`.

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

1. завершить local PR browser CI build `20260723-02`;
2. проверить static, JavaScript, Auth regression и existing public smoke;
3. не запускать live Pages attestation до merge;
4. merge только exact green head без review threads;
5. после merge получить source/hash и browser live evidence;
6. обновить contracts/handoff фактическими значениями;
7. проверить Supabase drift read-only;
8. не вызывать cost confirmation;
9. не создавать Supabase branch/accounts/secrets;
10. не менять production DDL/DML/RLS/Auth/Edge;
11. не трогать `leader_*`.
