# Navigator v2 — актуальный handoff

## Точка продолжения

- Дата: 24 июля 2026 года.
- Репозиторий: `deputat36/vktg`.
- Последний подтверждённый `main`: `214dc8534a4649b257c86b03761d6f3b7dbfc4e7` — squash merge PR #499.
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

Действующий legacy task lifecycle:

- `assets/js/nav-v2/task-action-guard-v2.js`;
- `assets/js/nav-v2/task-lifecycle-closure-model-v1.js`;
- legacy RPC `public.nav_v2_update_task_status(uuid, nav_v2_task_status)`;
- evidence-комментарий через `public.nav_v2_add_comment(uuid, text, text)`;
- deployed Edge facade v4 остаётся legacy-only.

Новый intake, bounded contracts, actor-aware routes и preview packages остаются repository-only.

## Shared frontend build

Build `20260723-02` содержит integrated Auth storage guard, versioned shared runtime, normalized importmap mappings на 35 root pages, диагностический cache-bust и permanent rollout gates.

Канонические configs:

- `config/nav-v2-public-build-attestation-v1.json`;
- `config/nav-v2-live-public-browser-runtime-v1.json`.

Build bumper:

- `scripts/bump_nav_v2_shared_build.py`.

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

Public/browser evidence относится к shared build и не доказывает полноценный новый cloud role/mutation E2E. Реальные browser storage failures не воспроизводились.

## Запись для основной CRM

Действующий read-only блок `В CRM` содержит:

- текущий этап;
- результат;
- риск или препятствие;
- договорённость;
- недостающие обязательные пункты;
- следующее действие;
- ответственного;
- срок.

Запись не сохраняется автоматически. Сотрудник проверяет и копирует её вручную. Navigator не создаёт параллельную CRM или отдельный журнал.

Task policy для legacy-задач использует явные `task_type`, `assigned_role` и `due_date`, а при отсутствии `task_type` — read-only классификацию по `source`. Production backfill не выполнялся.

## Замыкание lifecycle задач — PR #495

Merge SHA:

`8ce918a2bb3f2551b7797530400f9ded4cea15aa`

Решение:

`legacy_task_lifecycle_closure_frontend_enabled_atomic_server_completion_blocked`

Для legacy-задач действует последовательность:

- `open` → `Начать работу`;
- `in_progress` → обязательный результат и `Сохранить результат и завершить`;
- `done` → `Вернуть в работу`;
- `cancelled` → без рабочих действий.

Результат сохраняется командным комментарием раньше статуса `done`. Если комментарий не сохранён, задача не закрывается. Если комментарий сохранён, а статус временно не изменён, повтор в текущей сессии не дублирует комментарий.

## Восстановление серверных разрешений — PR #497

Merge SHA:

`a1bbd44421b966775ba1b20fc918124dfaceeb5a`

Решение:

`full_card_task_permission_bridge_enabled_lite_dto_database_change_blocked`

Подтверждённый разрыв:

- `nav_v2_get_deal_card` возвращает авторитетные permission-поля;
- production `nav_v2_get_deal_card_lite` не возвращает их;
- прежний guard интерпретировал отсутствующее поле как запрет.

Действующее поведение:

- lite DTO остаётся быстрым источником состояния;
- при отсутствии permission-полей guard использует разрешения полной карточки;
- full-card RPC входит в общий in-flight dedupe-контур;
- explicit server denial остаётся denial;
- при ошибке обоих источников действия остаются fail-closed;
- клиент не вычисляет право по роли, назначению или тексту задачи.

## Маршрут к исполнимой задаче — PR #499

Merge SHA:

`214dc8534a4649b257c86b03761d6f3b7dbfc4e7`

Решение:

`actionable_task_preferred_in_existing_deal_focus_no_new_screen`

### Проверка предыдущего этапа

После permission-fix production по-прежнему не показывал реальных task transitions. Возврат старой permission-ошибки не обнаружен.

Read-only анализ действующих назначений показал:

- у СПН 6 доступных связок «пользователь–сделка» с открытыми задачами;
- во всех 6 связках есть как минимум одна задача с серверным разрешением на выполнение;
- во всех 6 прежний блок `Главное действие сейчас` выбирал более срочную задачу другой роли;
- у юриста 13 из 17 доступных связок имеют исполнимую задачу, ещё 4 являются control-only.

### Что действует теперь

В существующей карточке сделки, без нового task screen:

1. Сначала выбирается открытая задача с серверным `can_change_status=true` для текущего пользователя.
2. Среди исполнимых задач сохраняется приоритет по просрочке, важности и статусу `in_progress`.
3. Если исполнимой задачи нет, наиболее важная чужая задача остаётся видимой для контроля.
4. Для открытой своей задачи CTA называется `Начать эту задачу`.
5. Для своей задачи в работе CTA называется `Продолжить и завершить`.
6. CTA открывает существующую вкладку `Задачи`, прокручивает нужную задачу и устанавливает keyboard focus на разрешённую кнопку.
7. Чужая задача не перехватывает основное действие, но остаётся доступной для контроля.

### Проверка PR #499

Профильный workflow run `30108222992` подтвердил на desktop и mobile:

- более срочная задача юриста не перехватывает focus у исполнимой задачи СПН;
- открывается существующая вкладка задач;
- кнопка `Начать работу` видима, разрешена и получает focus;
- выполняется точный переход `open → in_progress` через действующий status RPC;
- новый mutation source, task screen или параллельная очередь не создаются.

Все 29 workflow head PR #499 завершились успешно. Один browser-job был повторён только из-за GitHub runner HTTP 429 при скачивании стандартного checkout; повтор завершился успешно. Review threads отсутствовали.

Канонические файлы:

- `config/nav-v2-actionable-task-route-v1.json`;
- `docs/NAV_V2_ACTIONABLE_TASK_ROUTE_V1_2026-07-24.md`;
- `tests/e2e/actionable-task-route.spec.js`.

## Operational baseline

Последняя read-only production-сверка перед PR #499:

- задач: 98;
- `open`: 88;
- `in_progress`: 0;
- `done`: 0;
- `cancelled`: 10;
- событий `task_status_changed`: 0;
- командных комментариев в `nav_deal_comments_v2`: 5;
- последнее production task/event изменение: 16 июля 2026 года.

Repository/frontend merges не должны менять эти значения. Автоматические переходы, переназначения, перенос сроков и массовое закрытие не выполнялись.

## Заблокированные пункты

### Permission-поля непосредственно в lite DTO

Статус: `blocked_requires_explicit_production_database_approval`.

Предпочтительное долгосрочное упрощение — добавить `can_change_status` и bounded permission booleans непосредственно в production `nav_v2_get_deal_card_lite`.

Подготовлено:

- доказана разница lite/full DTO;
- действует безопасный full-card fallback;
- explicit denial и fail-closed покрыты desktop/mobile тестами;
- rollback frontend-изменения понятен.

Требуются отдельная production migration, проверка grants/RLS, exact rollback и authenticated permission E2E. Этот пункт не блокирует frontend.

### Атомарное server-side завершение задачи

Статус: `blocked_requires_explicit_production_database_approval`.

Полная атомарность результата и статуса потребует production migration, rollback package, grants/RLS/actor scope, idempotency key и отдельного authenticated mutation E2E. Действующий frontend безопасно сохраняет evidence раньше статуса.

### Bounded task transport

Статус: `blocked_transport_disabled`.

Bounded actions распознаются, но network transport остаётся выключенным. Production Edge v4 не изменялся.

### Production backfill и массовое закрытие

Статус: `blocked_not_authorized_and_not_required_for_frontend_release`.

Не выполнять массовое заполнение `task_type`, переназначение, изменение сроков или закрытие существующих задач без отдельного решения владельца.

## Auth storage hardening

Shared runtime сохраняет fail-closed storage reads, session fingerprint tombstone, best-effort profile/email cache, normalized storage error, запрет RPC retry при несохраняемой refreshed session и cross-tab/concurrent refresh guards.

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

- exact mode и цель;
- fresh branch cost;
- amount/currency/recurrence;
- explicit cost approval;
- disposable branch;
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

1. Не создавать новый task screen, CRM-summary или параллельный журнал.
2. В read-only monitoring проверять появление первых `task_status_changed`, `in_progress`, `done` и evidence-комментариев после публикации actionable route.
3. Если реальные переходы появились, проверить, что результат понятен, комментарий не дублируется, завершённая задача уходит из active debt и CRM-handoff выбирает следующий незакрытый пункт.
4. Если переходы не появились после реального использования, следующий repository-only этап — проверить путь с рабочего стола и списка сделок в конкретную карточку: role filters, приоритетную сделку, ссылку и сохранение `#tasks`. Permission DTO и выбор actionable task больше не считать открытыми blockers.
5. Исправлять только существующий маршрут и видимость; новый экран создавать только при доказанной необходимости.
6. После подтверждённых task outcomes перейти к аналогичному замыканию документов и рисков: terminal outcome должен убирать пункт из active debt.
7. Не выполнять production backfill, массовое назначение, перенос сроков или закрытие задач без отдельного решения владельца.
8. Permission-поля lite DTO, атомарный task-completion RPC и bounded transport держать заблокированными до отдельного production approval.
9. Поддерживать scheduled public source/browser monitoring.
10. Не выполнять второй index snapshot без выбранной cadence/thresholds.
11. Не создавать preview branch или technical identities без отдельного cost/Auth approval.
12. Не менять production schema/data/Auth/RLS/grants/Edge.
13. Не трогать `leader_*`.
