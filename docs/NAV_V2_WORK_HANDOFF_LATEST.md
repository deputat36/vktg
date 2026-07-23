# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 23 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- Последний подтверждённый `main`: `3a078f28887033a49ac04443470da7f1b7760f42` — squash merge PR #493.
- Открытые PR по Navigator v2 отсутствуют на момент фиксации.
- Shared frontend build: `20260723-02`.
- Public GitHub Pages: `https://deputat36.github.io/vktg/`.
- Supabase project: `ofewxuqfjhamgerwzull`.
- Project: `ACTIVE_HEALTHY`, region `eu-west-1`.
- PostgreSQL: `17.6.1.121`.
- Последняя Navigator migration: `20260716063401_nav_v2_correct_mortgage_broker_scope`.
- Последняя общая migration: `20260721122333_revoke_anon_execute_leader_internal_rpcs` — относится к `leader_*`.
- Edge `nav-v2-deal-api`: v4, `ACTIVE`, `verify_jwt=true`.
- Edge SHA-256: `b64e3fdbc2fa22ccb4998e69232e4351308f1d9b0a7c3c2bec7093186d3e4095`.
- Preview branches отсутствуют.
- Technical `nav-e2e` users/profiles отсутствуют.

Не трогать `leader_*`.

## Назначение Navigator

Navigator — единая заявка на подготовку сделки и диспетчер взаимодействия СПН, юриста, ипотечного брокера и менеджера:

`потребность → факты → маршрутизация → документы/условия → решение профильной роли → выполнение → evidence → готовность → задаток/сделка → закрытие`

Navigator не является основной CRM, файловым архивом, банковской CRM, автоматическим юристом или системой оценки сотрудников по сырым counters.

Основная CRM хранит клиентов, объекты, обращения, задачи, договорённости, документы, сроки и историю взаимодействия. Navigator объясняет маршрут, проверяет полноту, показывает риски и готовит процессную запись для ручного переноса в CRM.

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

## Shared frontend build

Build `20260723-02` содержит:

- integrated Auth storage guard;
- versioned shared `supabase-v2.js`;
- versioned `auth-storage-guard-v2.js`;
- normalized importmap mappings на 35 root pages;
- диагностический cache-bust;
- generator `scripts/bump_nav_v2_shared_build.py`;
- permanent rollout gates.

Канонические configs:

- `config/nav-v2-public-build-attestation-v1.json`;
- `config/nav-v2-live-public-browser-runtime-v1.json`.

Public decision:

`public_build_20260723_02_attested_read_only_via_github_pages_ci`

Browser decision:

`live_public_browser_runtime_20260723_02_verified_read_only`

Public evidence:

- run `30023416439`;
- evidence commit `41f9056d1021fd9a84ac3adf140b0877599e699b`;
- build `20260723-02`;
- pages `35/35`;
- artifact `8570253047`;
- artifact digest `sha256:24e71a7e91f394fbb70813cc5ae395dc5c7eb2fcee18aca019d57bf088c4cb5e`;
- desktop cases `5/5`;
- mobile cases `5/5`;
- unexpected `0`;
- flaky `0`.

Current public state:

- `live_public_build_verified=true`;
- `runtime_rollout_completed=true`;
- `authenticated_role_e2e_completed=false`;
- `live_browser_storage_failure_verified=false`.

Public/browser evidence относится к shared build и не доказывает полноценный новый cloud role/mutation E2E. Реальные `QuotaExceededError` или `SecurityError` не воспроизводились.

## Shared-project release drift — PR #488

Merge SHA:

`8c354d4dfa51cff100f622f9a92c845e49939663`

Решение:

`shared_project_release_drift_false_positive_removed_repository_only`

Release drift использует семантику `required_present_not_global_latest`: более новые repository-known migrations общего Supabase project не создают ложный Navigator drift только из-за timestamp. Unknown remote-only migrations, отсутствующая approved Navigator migration и Edge version/status/JWT/hash/source drift остаются блокирующими.

Канонические файлы:

- `config/nav-v2-release-baseline.json`;
- `config/nav-v2-release-migration-aliases.json`;
- `config/nav-v2-release-drift-shared-project-v1.json`;
- `scripts/check_nav_v2_release_drift_shared_project.py`;
- `scripts/check_nav_v2_release_drift_workflow.py`;
- `.github/workflows/nav-v2-release-drift.yml`.

Production DDL/DML/Auth/RLS/grants/Edge/data не менялись.

## Запись для основной CRM — PR #490

Merge SHA:

`8eb9d11c973a82583cc066940e2587d53ce7f3a9`

Решение:

`crm_handoff_summary_added_read_only_no_crm_write`

В карточке сделки действует блок `В CRM`:

- текущий этап;
- результат;
- риск или препятствие;
- договорённость;
- недостающие обязательные пункты;
- следующее действие;
- ответственный;
- срок.

Граница:

- запись не сохраняется автоматически;
- сотрудник проверяет и копирует её вручную;
- Navigator не создаёт параллельную CRM или отдельный журнал;
- адрес, ФИО, телефон, email, реквизиты документов и другие клиентские идентификаторы исключены;
- свободный `deal.next_action` не используется;
- подтверждённые terminal outcomes документов и рисков исключаются из активного долга;
- используется существующий consolidated deal-card enhancement hook.

Канонические файлы:

- `assets/js/nav-v2/deal-card-crm-handoff-model-v1.js`;
- `assets/js/nav-v2/deal-card-crm-handoff-v1.js`;
- `config/nav-v2-deal-card-crm-handoff-v1.json`;
- `fixtures/nav-v2-deal-card-crm-handoff-scenarios.json`;
- `tests/unit/nav-v2-deal-card-crm-handoff.test.mjs`;
- `scripts/check_nav_v2_deal_card_crm_handoff_v1.py`;
- `.github/workflows/nav-v2-deal-card-crm-handoff-v1.yml`;
- `docs/NAV_V2_CRM_HANDOFF_V1_2026-07-23.md`.

Production Supabase/Auth/RLS/grants/schema/data/indexes/Edge не менялись.

## Task policy для CRM-handoff — PR #493

Merge SHA:

`3a078f28887033a49ac04443470da7f1b7760f42`

Решение:

`crm_handoff_task_policy_preview_added_no_backfill`

Практический результат:

- явные `task_type`, `assigned_role` и `due_date` остаются приоритетными;
- legacy-задачи с `task_type = NULL` классифицируются read-only по существующему `source`;
- типы разделены на рабочую задачу, юридический стоп-фактор, задачу брокера, проверку качества и системную рекомендацию;
- если роль отсутствует, предлагается безопасная роль по типу задачи;
- если назначен конкретный сотрудник, в CRM-записи отображается только `назначенный сотрудник`, без UUID, ФИО или email;
- если явного срока нет, формируется контрольная дата по `created_at + SLA`;
- источник каждого вывода сохраняется в модели: explicit или inferred;
- результат остаётся preview-only.

Не выполнялось:

- production task backfill;
- автоматическое назначение сотрудника или роли;
- изменение статуса задачи;
- новый RPC, fetch или прямой доступ к таблицам;
- browser storage;
- изменение production Supabase.

Канонические файлы:

- `assets/js/nav-v2/task-process-policy-v1.js`;
- `assets/js/nav-v2/deal-card-crm-handoff-model-v1.js`;
- `assets/js/nav-v2/deal-card-crm-handoff-v1.js`;
- `config/nav-v2-deal-card-crm-handoff-v1.json`;
- `fixtures/nav-v2-deal-card-crm-handoff-scenarios.json`;
- `tests/unit/nav-v2-deal-card-crm-handoff.test.mjs`;
- `scripts/check_nav_v2_deal_card_crm_handoff_v1.py`;
- `.github/workflows/nav-v2-deal-card-crm-handoff-v1.yml`.

Exact green head PR #493:

- CRM handoff run `30043939955`;
- static checks run `30043939922`;
- JavaScript syntax run `30043939879`;
- deal action focus run `30043939853`;
- completion evidence run `30043939891`;
- mobile first screen run `30043939925`;
- work-item outcome preview run `30043939855`;
- live public browser runtime run `30043939815`;
- authenticated browser workflow run `30043939897` — существующий gated workflow, не доказательство нового cloud role/mutation E2E.

Все 27 запущенных workflow завершились успешно. Review threads отсутствовали. PR #493 смёржен squash-merge.

## Supabase boundary

Последняя read-only сверка:

- project `ACTIVE_HEALTHY`;
- только default branch `main`;
- latest Navigator migration `20260716063401_nav_v2_correct_mortgage_broker_scope`;
- latest overall migration `20260721122333_revoke_anon_execute_leader_internal_rpcs`;
- `nav-invite-user` v10 ACTIVE, JWT required;
- `nav-v2-deal-api` v4 ACTIVE, JWT required;
- `nav-v2-deal-api` hash без изменений;
- preview branch не создавалась;
- migration apply/repair не выполнялся;
- Edge deploy не выполнялся;
- technical accounts не создавались;
- cost confirmation не выполнялся.

Read-only operational aggregate на 23 июля 2026 года:

- сделок: 23;
- задач: 98;
- открытых задач: 88;
- завершённых задач: 0;
- задач без сохранённого `task_type`: 98;
- документов: 198;
- открытых документов: 182;
- рисков: 53;
- открытых рисков: 49;
- закрытых рисков: 4;
- комментариев: 5;
- review-записей: 3.

Главный продуктовый разрыв: контрольные пункты создаются быстрее, чем получают подтверждённый исход. Не расширять автоматический backlog без доказанного цикла выполнения.

## Auth storage hardening

Shared runtime сохраняет:

- fail-closed storage reads;
- session fingerprint tombstone;
- remove/null fallback;
- best-effort profile/email cache;
- normalized `NAV_AUTH_STORAGE_UNAVAILABLE`;
- запрет RPC retry, если refreshed session нельзя сохранить;
- cross-tab и concurrent refresh guards;
- logout/password reset/sign-in race coverage.

Authenticated browser role E2E остаётся отдельным cloud-gated этапом.

## Index/capacity status

Candidate decisions:

- `nav_user_profiles_role_idx (role)` — `retain`;
- `nav_deal_answers_v2_deal_idx (deal_id)` — `review_possible_redundancy_only`;
- unique `(deal_id, question_key)` остаётся.

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

Успешная offline validation формы не является execution authorization.

## Active gates

Generic `продолжай`, `работай по плану`, `действуй автономно` не являются approval.

### Preview/Auth E2E

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

Не вызывать cost confirmation.

Не создавать Supabase branch/accounts/secrets.

### Production index/DDL

Требуются approved observation cadence/thresholds, второй capture, representative authenticated workload, submitted capacity form, benchmark authorization, permitted environment, production-scale evidence, exact migration/rollback и отдельное DDL approval.

Не менять production DDL/DML/RLS/Auth/Edge.

Без этих решений cloud execution запрещено.

## Следующий безопасный slice

1. Не создавать новый CRM-summary, параллельную карточку сделки или ещё один экран taxonomy.
2. Сфокусироваться на замыкании lifecycle существующих задач: открыта → в работе → подтверждённый результат → готово.
3. Подготовить repository-only анализ причин, почему в текущих данных 88 задач открыты, а подтверждённых `done` нет, без изменения production данных.
4. Проверить, достаточно ли существующей карточки для фиксации evidence и terminal outcome; дорабатывать только реальный разрыв.
5. Для документов и рисков сохранять такой же принцип: результат должен подтверждаться, а terminal outcomes должны убирать пункт из активного долга.
6. Не выполнять production backfill `task_type`, массовое назначение ролей или закрытие задач без отдельного решения владельца.
7. Поддерживать scheduled public source/browser monitoring.
8. Не выполнять второй index snapshot без выбранной cadence/thresholds.
9. Не создавать preview branch или technical identities без отдельного cost/Auth approval.
10. Не менять production schema/data/Auth/RLS/grants/Edge.
11. Не трогать `leader_*`.
